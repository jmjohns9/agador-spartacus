import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

// ─── Claude Assistant — main-process bridge to the Claude API ─────────────────
//
// The renderer sends a question plus a snapshot of session context (live PIDs,
// DTCs, recent logs). We assemble a vehicle-aware prompt and call the Messages
// API. The API key is stored in the app's userData folder, never in the repo.

const CONFIG_FILE = (): string => path.join(app.getPath('userData'), 'claude-config.json');

// Every public Claude model on the Anthropic API as of 2026-06.
// The label hints at the trade-off so the user can pick without leaving the app.
export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-8',         label: 'Opus 4.8 — most capable' },
  { id: 'claude-opus-4-7',         label: 'Opus 4.7 — balanced flagship' },
  { id: 'claude-fable-5',          label: 'Fable 5 — latest creative' },
  { id: 'claude-sonnet-4-6',       label: 'Sonnet 4.6 — fast, strong' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — fastest, cheapest' },
] as const;

interface ClaudeConfig {
  apiKey: string;
  model: string;
  customSystemPrompt: string;   // empty = use built-in prompt
}

export function loadConfig(): ClaudeConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf-8'));
    return {
      apiKey:             raw.apiKey ?? '',
      model:              raw.model  ?? 'claude-opus-4-8',
      customSystemPrompt: raw.customSystemPrompt ?? '',
    };
  } catch {
    return { apiKey: '', model: 'claude-opus-4-8', customSystemPrompt: '' };
  }
}

export function saveConfig(cfg: Partial<ClaudeConfig>): void {
  const merged = { ...loadConfig(), ...cfg };
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(merged), { mode: 0o600 });
}

// ── Context payload sent from the renderer with each question ────────────────
export interface SessionContext {
  vehicle: string;               // user-entered description: year/make/model/engine/VIN/notes
  connectionStatus: string;
  protocol: string;
  liveData: Array<{ pid: string; name: string; value: number | string; unit: string }>;
  dtcs: Array<{ code: string; status: string; description: string }>;
  recentLogs: string[];          // newest last, capped by renderer
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string; }

const SYSTEM_PROMPT = `You are the built-in diagnostic assistant inside "Project Agador Spartacus", a macOS OBD-II diagnostic app. The app connects to whatever vehicle the user plugs the adapter into — the vehicle description, if the user provided one, is included in each session snapshot.

You receive a live snapshot with every question: vehicle description, connection state, live PID readings, stored DTCs, and recent app logs.

Guidelines:
- Be a sharp, practical drivability tech. Give specific, actionable answers grounded in the snapshot data — quote actual values when relevant.
- Tailor advice to the vehicle described in the snapshot (platform-specific systems, known failure patterns, correct specs). If no vehicle is set, give general OBD-II guidance and suggest filling in the vehicle profile on the Connect screen for sharper answers.
- Battery voltage context: 12.6V+ healthy rest, <12.4V discharged, ~13.5–14.7V charging.
- If data needed to answer is missing from the snapshot, say what to check or which screen/test to run.
- Keep answers concise: a few sentences for simple questions, short structured steps for procedures. No filler.`;

function formatContext(ctx: SessionContext): string {
  const lines: string[] = [];
  lines.push(`Vehicle: ${ctx.vehicle || 'not specified'}`);
  lines.push(`Connection: ${ctx.connectionStatus}${ctx.protocol ? ` (${ctx.protocol})` : ''}`);
  if (ctx.liveData.length) {
    lines.push('Live readings:');
    for (const r of ctx.liveData) lines.push(`  ${r.name || r.pid}: ${r.value} ${r.unit}`);
  } else {
    lines.push('Live readings: none (no data streaming)');
  }
  lines.push(ctx.dtcs.length
    ? 'DTCs: ' + ctx.dtcs.map(d => `${d.code} [${d.status}] ${d.description}`).join('; ')
    : 'DTCs: none scanned/stored');
  if (ctx.recentLogs.length) {
    lines.push('Recent app logs (newest last):');
    for (const l of ctx.recentLogs) lines.push(`  ${l}`);
  }
  return lines.join('\n');
}

/** Render the snapshot the user can preview before sending. */
export function renderContextPreview(ctx: SessionContext): string {
  return formatContext(ctx);
}

/** Default prompt — exported so the renderer's "Advanced" settings can show it for reference. */
export const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPT;

export interface AskResult {
  ok: true;
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}
export interface AskError { ok: false; error: string; cancelled?: boolean }

export interface AskOptions {
  /** Called with each text delta as it streams in. */
  onText?: (delta: string) => void;
  /** Abort the in-flight request (Cancel button / window closed). */
  signal?: AbortSignal;
}

// ── Ask Claude — streams the reply, resolves with full text + usage ──────────
export async function askClaude(
  question: string,
  ctx: SessionContext,
  history: ChatTurn[],
  opts: AskOptions = {},
): Promise<AskResult | AskError> {
  const { apiKey, model, customSystemPrompt } = loadConfig();
  if (!apiKey) return { ok: false, error: 'No API key configured. Add your Claude API key in the assistant settings.' };

  const system = customSystemPrompt.trim() || SYSTEM_PROMPT;

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-12),                       // keep the conversation bounded
    {
      role: 'user',
      content: `<session-snapshot>\n${formatContext(ctx)}\n</session-snapshot>\n\n${question}`,
    },
  ];

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream(
      { model, max_tokens: 1500, system, messages },
      { signal: opts.signal },
    );
    if (opts.onText) stream.on('text', opts.onText);

    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');
    return {
      ok: true,
      text: text || '(empty response)',
      model,
      usage: {
        input_tokens:  final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
      },
    };
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError ||
        (e instanceof Error && e.name === 'AbortError')) {
      return { ok: false, error: 'Cancelled', cancelled: true };
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'Invalid API key — check it in the assistant settings.' };
    }
    if (e instanceof Anthropic.APIError) {
      return { ok: false, error: e.message };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Network error reaching the Claude API: ${msg}` };
  }
}
