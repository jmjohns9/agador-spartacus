import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore, ChatMessage, vehicleDisplayName } from '../store/appStore';
import { Badge, Button, Divider, EmptyState } from '../components/layout/UIComponents';
import { TYPE, WEIGHT, NUMERIC, RADIUS } from '../theme/theme';
import { PID_MAP } from '../../core/pidCatalog';

// ─── AssistantScreen — ask Claude about the live session ─────────────────────
//
// Every question carries a snapshot of the session (vehicle, connection state,
// live PIDs, DTCs, recent logs). Replies stream in token-by-token from the
// main process; Cancel aborts mid-stream and keeps the partial text.

// ── Quick actions: one-tap prompts that bias Claude toward a focused task ───
const QUICK_ACTIONS: Array<{ icon: string; label: string; prompt: string }> = [
  { icon: 'ti-list-search',        label: 'Triage DTCs',         prompt: 'Walk me through my stored DTCs in priority order — for each: what it means, likely root causes on this vehicle, and what to check first.' },
  { icon: 'ti-activity',           label: 'Read live data',      prompt: "Look at the live readings in the snapshot and tell me anything that's outside normal range or suggests an emerging problem." },
  { icon: 'ti-battery-automotive', label: 'Battery health',      prompt: "Analyze the battery voltage and what it tells me about the state of charge and the charging system right now." },
  { icon: 'ti-bolt',               label: 'Parasitic drain plan',prompt: "Give me a step-by-step plan to find a parasitic battery drain on this vehicle, tailored to what you can see in the snapshot." },
  { icon: 'ti-zoom-question',      label: "Why no data?",        prompt: "I'm not seeing any data flowing from the adapter. Based on the snapshot and logs, what's the most likely cause and what should I try first?" },
  { icon: 'ti-arrow-right',        label: 'What next?',          prompt: "Given everything in this snapshot, what's the single most useful next thing for me to check, run, or measure?" },
];

// ── Slash commands: typing "/" surfaces these focused shortcuts ────────────
const SLASH_COMMANDS: Array<{ cmd: string; description: string; prompt: string }> = [
  { cmd: '/pids',    description: "Summarize today's live readings",       prompt: 'Summarize the current live PID readings — call out anything notable, healthy or not.' },
  { cmd: '/dtcs',    description: 'Explain stored DTCs',                  prompt: 'Explain each stored DTC: meaning, likely causes on this vehicle, and what to verify.' },
  { cmd: '/battery', description: 'Analyze battery + charging',           prompt: 'Analyze the battery voltage trend and tell me what it says about state of charge and the charging system.' },
  { cmd: '/logs',    description: 'Review recent app logs',                prompt: 'Look through the recent app logs and flag anything that suggests a problem with the adapter, the bus, or the vehicle.' },
  { cmd: '/next',    description: 'Suggest next diagnostic step',          prompt: "Given the snapshot, what's the single highest-value next step I should take?" },
  { cmd: '/clear',   description: 'Clear the conversation',               prompt: '__CLEAR__' },
];

interface ClaudeConfigInfo {
  hasKey: boolean;
  keyHint: string;
  model: string;
  models: ReadonlyArray<{ id: string; label: string }>;
  customSystemPrompt: string;
  defaultSystemPrompt: string;
}

// ── Per-message hover-action button ────────────────────────────────────────
function MsgAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="plain" icon={icon} onClick={onClick} title={label} aria-label={label}>
      {label}
    </Button>
  );
}

// ─── Snapshot Claude sees with every question ────────────────────────────────
// Built from the store when a question is sent. Subscribing to live data,
// codes and the log here re-rendered the whole chat on every PID reading.

type AppState = ReturnType<typeof useAppStore.getState>;

function buildContext(st: AppState) {
  const { vehicle, connectionStatus, protocol, liveData, dtcs, log } = st;
  return {
    vehicle: [
      vehicleDisplayName(vehicle) !== 'No vehicle set' ? vehicleDisplayName(vehicle) : '',
      vehicle.engine, vehicle.vin && `VIN ${vehicle.vin}`, vehicle.nickname,
      vehicle.notes && `Notes: ${vehicle.notes}`,
    ].filter(Boolean).join(' · '),
    connectionStatus,
    protocol,
    liveData: Object.values(liveData).map(r => ({
      pid: r.pid,
      name: r.pid === 'ATRV' ? 'Battery voltage' : (PID_MAP.get(r.pid)?.name ?? r.pid),
      value: typeof r.value === 'number' ? Math.round((r.value as number) * 100) / 100 : r.value,
      unit: r.unit,
    })),
    dtcs: dtcs.map(d => ({
      code: d.code,
      status: d.status,
      description: d.description,
      module: d.module,
      likelyCauses: d.likelyCauses,
      repairSummary: d.repairSummary,
    })),
    recentLogs: log.slice(0, 30).reverse().map(e =>
      `${new Date(e.timestamp).toLocaleTimeString()} ${e.level.toUpperCase()} ${e.message}`),
  };
}

// Only mounted while the preview is open, so only then does it follow live data
function SnapshotPreview(): React.ReactElement {
  const liveData = useAppStore(s => s.liveData);
  const dtcs     = useAppStore(s => s.dtcs);
  const log      = useAppStore(s => s.log);
  const text = useMemo(() => {
    const snapshot = buildContext(useAppStore.getState());
    const lines: string[] = [];
    lines.push(`Vehicle:      ${snapshot.vehicle || 'not set'}`);
    lines.push(`Connection:   ${snapshot.connectionStatus}${snapshot.protocol ? ` (${snapshot.protocol})` : ''}`);
    lines.push(`Live PIDs:    ${snapshot.liveData.length}`);
    if (snapshot.liveData.length) {
      for (const r of snapshot.liveData.slice(0, 8)) lines.push(`  · ${r.name}: ${r.value} ${r.unit}`);
      if (snapshot.liveData.length > 8) lines.push(`  · …and ${snapshot.liveData.length - 8} more`);
    }
    lines.push(`DTCs:         ${snapshot.dtcs.length || 'none'}`);
    for (const d of snapshot.dtcs.slice(0, 5)) lines.push(`  · ${d.code} [${d.status}] ${d.description}`);
    lines.push(`Recent logs:  ${snapshot.recentLogs.length} entries`);
    return lines.join('\n');
  }, [liveData, dtcs, log]);
  return (
    <pre className="selectable" style={{
      margin: 0, padding: 8,
      background: 'var(--fill)', borderRadius: RADIUS.control,
      ...TYPE.caption, ...NUMERIC, color: 'var(--label)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto',
    }}>{text}</pre>
  );
}

export function AssistantScreen(): React.ReactElement {
  const connectionStatus    = useAppStore(s => s.connectionStatus);
  const protocol            = useAppStore(s => s.protocol);
  const vehicle             = useAppStore(s => s.vehicle);
  const messages            = useAppStore(s => s.chatMessages);
  const addChatMessage      = useAppStore(s => s.addChatMessage);
  const removeLastMessage   = useAppStore(s => s.removeLastMessage);
  const clearChat           = useAppStore(s => s.clearChat);

  const [input,         setInput]         = useState('');
  const [busy,          setBusy]          = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [config,        setConfig]        = useState<ClaudeConfigInfo | null>(null);
  const [showSetup,     setShowSetup]     = useState(false);
  const [showAdvanced,  setShowAdvanced]  = useState(false);
  const [showSnapshot,  setShowSnapshot]  = useState(false);
  const [showMenu,      setShowMenu]      = useState(false);
  const [keyDraft,      setKeyDraft]      = useState('');
  const [promptDraft,   setPromptDraft]   = useState('');
  const [copyToast,     setCopyToast]     = useState('');
  const scrollRef    = useRef<HTMLDivElement>(null);
  const streamingRef = useRef('');                 // mirror for capturing partial text on cancel
  const menuRef      = useRef<HTMLDivElement>(null);

  const refreshConfig = useCallback(async () => {
    const cfg = await window.electronAPI.claudeGetConfig();
    setConfig(cfg);
    setPromptDraft(cfg.customSystemPrompt);
    if (!cfg.hasKey) setShowSetup(true);
  }, []);

  useEffect(() => { refreshConfig(); }, [refreshConfig]);

  // Stream deltas arrive from the main process while a question is in flight.
  // Guarded: if the user reloads the renderer against a stale main/preload
  // build, the new IPC channel won't exist yet — skip subscription rather
  // than crash the screen.
  useEffect(() => {
    if (typeof window.electronAPI?.onClaudeStreamChunk !== 'function') return;
    const unsubscribe = window.electronAPI.onClaudeStreamChunk((delta) => {
      streamingRef.current += delta;
      setStreamingText(streamingRef.current);
    });
    return unsubscribe;
  }, []);

  // Close the overflow menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  // Auto-scroll to newest content (respect reduced motion)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, busy, streamingText]);


  // ── Ask helper, used by send / regenerate / quick actions ────────────────
  const callClaude = async (question: string, historyOverride?: ChatMessage[]) => {
    setBusy(true);
    streamingRef.current = '';
    setStreamingText('');
    try {
      const source = historyOverride ?? messages;
      const history = source
        .filter(m => m.role !== 'error')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const resp = await window.electronAPI.claudeAsk({ question, context: buildContext(useAppStore.getState()), history });
      if (resp.ok) {
        addChatMessage({
          role: 'assistant', content: resp.text, timestamp: Date.now(),
          model: resp.model, usage: resp.usage,
        });
      } else if (resp.cancelled) {
        // Keep whatever streamed in before the user hit Cancel
        if (streamingRef.current.trim()) {
          addChatMessage({
            role: 'assistant',
            content: streamingRef.current + '\n\n— stopped by user —',
            timestamp: Date.now(),
            model: config?.model,
          });
        }
      } else {
        addChatMessage({ role: 'error', content: resp.error, timestamp: Date.now() });
        if (/api key/i.test(resp.error)) setShowSetup(true);
      }
    } catch (e) {
      addChatMessage({ role: 'error', content: `Assistant error: ${e instanceof Error ? e.message : String(e)}`, timestamp: Date.now() });
    } finally {
      streamingRef.current = '';
      setStreamingText('');
      setBusy(false);
    }
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setInput('');

    // Slash-command shortcut
    if (q.startsWith('/')) {
      const cmd = SLASH_COMMANDS.find(c => q === c.cmd || q.startsWith(c.cmd + ' '));
      if (cmd) {
        if (cmd.prompt === '__CLEAR__') { clearChat(); return; }
        const extra = q.slice(cmd.cmd.length).trim();
        const finalPrompt = extra ? `${cmd.prompt}\n\nAdditional context from user: ${extra}` : cmd.prompt;
        addChatMessage({ role: 'user', content: q, timestamp: Date.now() });
        await callClaude(finalPrompt);
        return;
      }
    }

    addChatMessage({ role: 'user', content: q, timestamp: Date.now() });
    await callClaude(q);
  };

  const cancel = () => { window.electronAPI.claudeCancel?.(); };

  // Regenerate the last assistant reply with the same prior conversation.
  const regenerate = async () => {
    if (busy) return;
    const lastAssistantIdx = [...messages].reverse().findIndex(m => m.role === 'assistant' || m.role === 'error');
    if (lastAssistantIdx < 0) return;
    const realIdx = messages.length - 1 - lastAssistantIdx;
    const priorHistory = messages.slice(0, realIdx);
    const lastUserIdx = priorHistory.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx < 0) return;
    const lastUser = priorHistory[lastUserIdx];
    removeLastMessage();   // drop the assistant reply we're about to replace
    // History stops before the question: main appends the question itself,
    // and passing it in the history too sent it twice
    await callClaude(lastUser.content, priorHistory.slice(0, lastUserIdx).filter(m => m.role !== 'error'));
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyToast('Copied');
      setTimeout(() => setCopyToast(''), 1200);
    });
  };

  const exportChat = async () => {
    if (messages.length === 0) return;
    const md = [
      `# Agador Spartacus — Assistant chat`,
      `*Exported ${new Date().toLocaleString()}*`,
      ``,
      `**Vehicle:** ${vehicleDisplayName(vehicle)}`,
      `**Connection:** ${connectionStatus}${protocol ? ` (${protocol})` : ''}`,
      ``,
      ...messages.map(m => {
        const who = m.role === 'user' ? '## You' : m.role === 'assistant' ? `## Claude (${m.model ?? 'unknown'})` : '## Error';
        const usage = m.usage ? `\n\n_${m.usage.input_tokens} in · ${m.usage.output_tokens} out_` : '';
        return `${who}\n\n${m.content}${usage}`;
      }),
    ].join('\n');
    const slug = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join('-')
      .replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'session';
    const filename = `agador-${slug}-chat-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`;
    await window.electronAPI.claudeExportChat?.(md, filename);
  };

  const saveSetup = async () => {
    await window.electronAPI.claudeSetConfig({
      apiKey: keyDraft.trim() || undefined,
      model: config?.model,
    });
    setKeyDraft('');
    setShowSetup(false);
    refreshConfig();
  };

  const setModel = async (model: string) => {
    await window.electronAPI.claudeSetConfig({ model });
    refreshConfig();
  };

  const saveCustomPrompt = async () => {
    await window.electronAPI.claudeSetConfig({ customSystemPrompt: promptDraft });
    refreshConfig();
  };

  // ── Session token usage ───────────────────────────────────────────────────
  const sessionUsage = useMemo(() => {
    let i = 0, o = 0;
    for (const m of messages) if (m.usage) { i += m.usage.input_tokens; o += m.usage.output_tokens; }
    return { i, o };
  }, [messages]);

  const slashHints = input.startsWith('/')
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(input.split(/\s/)[0]))
    : [];


  // Menu keyboard: focus the first item on open, arrows move, Escape closes
  // and returns focus to the button that opened it
  useEffect(() => {
    if (showMenu) menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [showMenu]);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowMenu(false);
      menuRef.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  };

  const currentModelLabel = config?.models.find(m => m.id === config.model)?.label ?? config?.model ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

      {/* ── Top bar: identity + 2 toggles + overflow ─────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        boxShadow: 'inset 0 -1px 0 var(--separator)', flexShrink: 0,
        background: 'var(--grouped)',
      }}>
        <i className="ti ti-sparkles" style={{ fontSize: 16, color: 'var(--accent-text)' }} aria-hidden />
        <span style={{ ...TYPE.headline, color: 'var(--label)' }}>
          Claude diagnostic assistant
        </span>
        <Badge
          label={config?.hasKey ? `Key ${config.keyHint}` : 'No API key'}
          variant={config?.hasKey ? 'ok' : 'warn'}
        />
        {(sessionUsage.i + sessionUsage.o) > 0 && (
          <span title="Session token usage (input + output)" style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--label-2)' }}>
            {sessionUsage.i.toLocaleString()} in · {sessionUsage.o.toLocaleString()} out
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Button
          size="sm"
          icon={showSnapshot ? 'ti-eye-off' : 'ti-eye'}
          onClick={() => setShowSnapshot(s => !s)}
          title="Preview what Claude sees"
          aria-pressed={showSnapshot}
        >
          Snapshot
        </Button>
        <Button
          size="sm"
          icon="ti-settings"
          onClick={() => setShowSetup(s => !s)}
          title="API key & model settings"
          aria-pressed={showSetup}
        >
          Settings
        </Button>

        {/* Overflow: model picker, export, clear */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <Button
            size="sm"
            icon="ti-dots"
            onClick={() => setShowMenu(m => !m)}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          />
          {showMenu && (
            <div role="menu" aria-label="More actions" onKeyDown={onMenuKey} style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
              background: 'var(--elevated)', borderRadius: RADIUS.card,
              boxShadow: 'inset 0 0 0 0.5px var(--separator), 0 8px 24px var(--shadow)',
              minWidth: 260, padding: 8,
            }}>
              <div style={{ ...TYPE.caption, color: 'var(--label-3)', padding: '4px 8px' }}>
                Model
              </div>
              {config?.models.map(m => (
                <button
                  key={m.id}
                  role="menuitemradio"
                  aria-checked={config.model === m.id}
                  className="row-hover"
                  onClick={() => { setModel(m.id); setShowMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    background: 'transparent', borderRadius: RADIUS.control,
                    padding: '4px 8px', color: 'var(--label)', ...TYPE.body,
                  }}
                >
                  <i className={`ti ${config.model === m.id ? 'ti-circle-check-filled' : 'ti-circle'}`}
                     style={{ fontSize: 14, color: config.model === m.id ? 'var(--accent-text)' : 'var(--label-3)' }} aria-hidden />
                  {m.label}
                </button>
              ))}
              <Divider />
              <button
                role="menuitem"
                className="row-hover"
                onClick={() => { exportChat(); setShowMenu(false); }}
                disabled={messages.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  background: 'transparent', borderRadius: RADIUS.control,
                  padding: '4px 8px', color: messages.length ? 'var(--label)' : 'var(--label-3)', ...TYPE.body,
                  opacity: messages.length ? 1 : 0.5,
                }}
              >
                <i className="ti ti-download" style={{ fontSize: 14 }} aria-hidden />
                Export chat as Markdown
              </button>
              <button
                role="menuitem"
                className="row-hover"
                onClick={() => { clearChat(); setShowMenu(false); }}
                disabled={messages.length === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  background: 'transparent', borderRadius: RADIUS.control,
                  padding: '4px 8px', color: messages.length ? 'var(--crit-text)' : 'var(--label-3)', ...TYPE.body,
                  opacity: messages.length ? 1 : 0.5,
                }}
              >
                <i className="ti ti-trash" style={{ fontSize: 14 }} aria-hidden />
                Clear conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Snapshot preview ─────────────────────────────────────────── */}
      {showSnapshot && (
        <div style={{
          padding: '8px 12px', boxShadow: 'inset 0 -1px 0 var(--separator)',
          background: 'var(--grouped)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, ...TYPE.caption, color: 'var(--label-2)', marginBottom: 4 }}>
            <i className="ti ti-eye" style={{ fontSize: 12 }} aria-hidden />
            What Claude sees with every question
          </div>
          <SnapshotPreview />
        </div>
      )}

      {/* ── Setup panel ──────────────────────────────────────────────── */}
      {showSetup && (
        <div style={{
          padding: 12, boxShadow: 'inset 0 -1px 0 var(--separator)',
          background: 'var(--grouped)', flexShrink: 0,
        }}>
          <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginBottom: 8, lineHeight: '18px' }}>
            Paste your Claude API key (starts with{' '}
            <span style={{ ...NUMERIC, padding: '2px 6px', borderRadius: 4, background: 'var(--fill)', color: 'var(--accent-text)' }}>sk-ant-</span>).
            Get one at <span style={{ color: 'var(--accent-text)' }}>console.anthropic.com</span> → API Keys.
            The key is stored locally on this Mac only{config?.hasKey ? ` — current key ends in ${config.keyHint}` : ''}.
            {config?.hasKey && <> Current model: <strong style={{ color: 'var(--label)' }}>{currentModelLabel}</strong> (change via the ⋯ menu).</>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder="sk-ant-…"
              value={keyDraft}
              aria-label="Claude API key"
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveSetup(); }}
              style={{ flex: 1, ...NUMERIC }}
            />
            <Button variant="primary" onClick={saveSetup} disabled={!keyDraft.trim() && !config?.hasKey}>
              Save
            </Button>
          </div>

          {/* Advanced: custom system prompt */}
          <Button
            variant="plain" size="sm"
            icon={showAdvanced ? 'ti-chevron-down' : 'ti-chevron-right'}
            onClick={() => setShowAdvanced(a => !a)}
            aria-expanded={showAdvanced}
            style={{ marginTop: 12 }}
          >
            Advanced — custom system prompt
          </Button>
          {showAdvanced && config && (
            <div style={{ marginTop: 8 }}>
              <div style={{ ...TYPE.caption, color: 'var(--label-2)', marginBottom: 4, lineHeight: '16px' }}>
                Override the assistant's built-in instructions. Leave blank to use the default
                ({config.defaultSystemPrompt.length} chars). The session snapshot is appended automatically.
              </div>
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                placeholder={config.defaultSystemPrompt}
                rows={6}
                aria-label="Custom system prompt"
                style={{ width: '100%', boxSizing: 'border-box', ...TYPE.caption }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button variant="primary" size="sm" onClick={saveCustomPrompt}>Save prompt</Button>
                <Button variant="secondary" size="sm" onClick={() => setPromptDraft('')}>Reset to default</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Conversation ─────────────────────────────────────────────── */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.length === 0 && !busy && (
          <div style={{ margin: 'auto', maxWidth: 460 }}>
            <EmptyState
              icon="ti-sparkles"
              title={`Ask Claude about ${vehicleDisplayName(vehicle) !== 'No vehicle set' ? vehicleDisplayName(vehicle) : 'this vehicle'}, live`}
              message="Every question includes a snapshot of the current session — live readings, DTCs, and recent logs — so answers are grounded in what the app is actually seeing. Type / for slash commands."
            />
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && !busy;
          const isUser  = m.role === 'user';
          const isError = m.role === 'error';
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
              <div className="selectable" style={{
                maxWidth: '80%', padding: '8px 12px', borderRadius: 12, ...TYPE.body, lineHeight: '20px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: isUser ? 'var(--accent)' : isError ? 'var(--crit-tint)' : 'var(--grouped)',
                boxShadow: isUser ? 'none' : isError ? 'inset 0 0 0 1px var(--crit)' : 'inset 0 0 0 1px var(--separator)',
                color: isUser ? 'var(--on-accent)' : isError ? 'var(--crit-text)' : 'var(--label)',
              }}>
                {m.role === 'assistant' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                    ...TYPE.caption, fontWeight: WEIGHT.semibold, color: 'var(--accent-text)',
                  }}>
                    <span>
                      <i className="ti ti-sparkles" style={{ fontSize: 11, marginRight: 4 }} aria-hidden />
                      Claude
                    </span>
                    {m.model && (
                      <span style={{ ...NUMERIC, color: 'var(--label-2)', fontWeight: WEIGHT.regular }}>
                        {m.model.replace('claude-', '')}
                      </span>
                    )}
                    {m.usage && (
                      <span style={{ ...NUMERIC, color: 'var(--label-2)', fontWeight: WEIGHT.regular }}>
                        · {m.usage.input_tokens}↑ {m.usage.output_tokens}↓
                      </span>
                    )}
                  </div>
                )}
                {m.content}
                {(m.role === 'assistant' || m.role === 'error') && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <MsgAction icon="ti-copy" label="Copy" onClick={() => copy(m.content)} />
                    {isLastAssistant && (
                      <MsgAction icon="ti-refresh" label="Regenerate" onClick={regenerate} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Live streaming bubble */}
        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div aria-live="polite" className="selectable" style={{
              maxWidth: '80%', padding: '8px 12px', borderRadius: 12, ...TYPE.body, lineHeight: '20px',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: 'var(--grouped)', boxShadow: 'inset 0 0 0 1px var(--accent)', color: 'var(--label)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                ...TYPE.caption, fontWeight: WEIGHT.semibold, color: 'var(--accent-text)',
              }}>
                <i className="ti ti-loader" style={{ fontSize: 12, animation: 'spin 1s linear infinite' }} aria-hidden />
                Claude {streamingText ? 'is replying' : 'is reading the session data'}…
              </div>
              {streamingText || <span style={{ color: 'var(--label-2)' }}>…</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 12px 0', flexShrink: 0 }}>
        {QUICK_ACTIONS.map(q => (
          <Button
            key={q.label}
            size="sm"
            variant="secondary"
            icon={q.icon}
            disabled={busy || !config?.hasKey}
            title={q.prompt}
            onClick={() => send(q.prompt)}
          >
            {q.label}
          </Button>
        ))}
      </div>

      {/* ── Slash command hints ──────────────────────────────────────── */}
      {slashHints.length > 0 && (
        <div style={{ padding: '4px 12px 0', flexShrink: 0 }}>
          <div style={{
            background: 'var(--elevated)', borderRadius: RADIUS.card,
            boxShadow: 'inset 0 0 0 0.5px var(--separator), 0 8px 24px var(--shadow)',
            padding: 8, maxHeight: 160, overflowY: 'auto',
          }}>
            {slashHints.map(c => (
              <button
                key={c.cmd}
                className="row-hover"
                onClick={() => { setInput(c.cmd); }}
                style={{
                  width: '100%', textAlign: 'left', background: 'transparent',
                  padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8,
                  borderRadius: RADIUS.control,
                }}
              >
                <span style={{ ...TYPE.caption, ...NUMERIC, color: 'var(--accent-text)', minWidth: 70 }}>{c.cmd}</span>
                <span style={{ ...TYPE.caption, color: 'var(--label-2)' }}>{c.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 12px 12px',
        boxShadow: 'inset 0 1px 0 var(--separator)', flexShrink: 0, marginTop: 8,
        background: 'var(--grouped)',
      }}>
        <textarea
          placeholder={config?.hasKey ? 'Ask about the vehicle, a reading, a fault code… or type / for shortcuts' : 'Add your API key in Settings first'}
          value={input}
          disabled={busy || !config?.hasKey}
          aria-label="Message to Claude"
          rows={1}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          style={{ flex: 1, resize: 'none', minHeight: 32, maxHeight: 120, ...TYPE.body }}
        />
        {busy ? (
          <Button variant="destructive" icon="ti-player-stop" onClick={cancel}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="ti-send"
            onClick={() => send(input)}
            disabled={!input.trim() || !config?.hasKey}
          >
            Send
          </Button>
        )}
      </div>

      {copyToast && (
        <div role="status" style={{
          position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--elevated)', color: 'var(--accent-text)',
          boxShadow: 'inset 0 0 0 1px var(--accent), 0 8px 24px var(--shadow)',
          borderRadius: RADIUS.control, padding: '4px 12px', ...TYPE.caption, fontWeight: WEIGHT.semibold,
        }}>
          {copyToast}
        </div>
      )}
    </div>
  );
}
