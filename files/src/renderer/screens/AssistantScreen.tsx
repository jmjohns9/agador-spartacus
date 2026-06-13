import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore, ChatMessage, vehicleDisplayName } from '../store/appStore';
import { Badge, Button } from '../components/layout/UIComponents';
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
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'transparent', border: '1px solid var(--br)', borderRadius: 3,
        padding: '3px 7px', cursor: 'pointer', color: 'var(--tm)',
        fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 11 }} />
      {label}
    </button>
  );
}

export function AssistantScreen(): React.ReactElement {
  const connectionStatus    = useAppStore(s => s.connectionStatus);
  const protocol            = useAppStore(s => s.protocol);
  const vehicle             = useAppStore(s => s.vehicle);
  const liveData            = useAppStore(s => s.liveData);
  const dtcs                = useAppStore(s => s.dtcs);
  const log                 = useAppStore(s => s.log);
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

  // ── Snapshot Claude sees with every question ──────────────────────────────
  const buildContext = useCallback(() => ({
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
    dtcs: dtcs.map(d => ({ code: d.code, status: d.status, description: d.description })),
    recentLogs: log.slice(0, 30).reverse().map(e =>
      `${new Date(e.timestamp).toLocaleTimeString()} ${e.level.toUpperCase()} ${e.message}`),
  }), [vehicle, connectionStatus, protocol, liveData, dtcs, log]);

  const snapshot = useMemo(() => buildContext(), [buildContext]);

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
      const resp = await window.electronAPI.claudeAsk({ question, context: snapshot, history });
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
    const lastUser = [...priorHistory].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    removeLastMessage();   // drop the assistant reply we're about to replace
    await callClaude(lastUser.content, priorHistory.filter(m => m.role !== 'error'));
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

  const snapshotPreview = useMemo(() => {
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
  }, [snapshot]);

  const currentModelLabel = config?.models.find(m => m.id === config.model)?.label ?? config?.model ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>

      {/* ── Top bar: identity + 2 toggles + overflow ─────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--br)', flexShrink: 0 }}>
        <i className="ti ti-sparkles" style={{ fontSize: 18, color: 'var(--pp)' }} />
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--tw)' }}>
          Claude diagnostic assistant
        </span>
        <Badge
          label={config?.hasKey ? `Key ${config.keyHint}` : 'No API key'}
          variant={config?.hasKey ? 'ok' : 'warn'}
        />
        {(sessionUsage.i + sessionUsage.o) > 0 && (
          <span title="Session token usage (input + output)" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--tm)' }}>
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
            onClick={() => setShowMenu(m => !m)}
            title="More actions"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            ⋯
          </Button>
          {showMenu && (
            <div role="menu" style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
              background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 4,
              minWidth: 260, padding: 6, boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '4px 8px' }}>
                Model
              </div>
              {config?.models.map(m => (
                <button
                  key={m.id}
                  role="menuitemradio"
                  aria-checked={config.model === m.id}
                  onClick={() => { setModel(m.id); setShowMenu(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none', borderRadius: 3,
                    padding: '6px 8px', cursor: 'pointer', color: 'var(--tw)', fontSize: 12,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <i className={`ti ${config.model === m.id ? 'ti-circle-check-filled' : 'ti-circle'}`}
                     style={{ fontSize: 14, color: config.model === m.id ? 'var(--pp)' : 'var(--tm)' }} />
                  {m.label}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--br)', margin: '6px 0' }} />
              <button
                role="menuitem"
                onClick={() => { exportChat(); setShowMenu(false); }}
                disabled={messages.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 3, padding: '6px 8px', cursor: messages.length ? 'pointer' : 'not-allowed', color: messages.length ? 'var(--tw)' : 'var(--tm)', fontSize: 12 }}
                onMouseEnter={e => { if (messages.length) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <i className="ti ti-download" style={{ fontSize: 14 }} />
                Export chat as Markdown
              </button>
              <button
                role="menuitem"
                onClick={() => { clearChat(); setShowMenu(false); }}
                disabled={messages.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 3, padding: '6px 8px', cursor: messages.length ? 'pointer' : 'not-allowed', color: messages.length ? 'var(--sr)' : 'var(--tm)', fontSize: 12 }}
                onMouseEnter={e => { if (messages.length) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <i className="ti ti-trash" style={{ fontSize: 14 }} />
                Clear conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Snapshot preview ─────────────────────────────────────────── */}
      {showSnapshot && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--br)', background: 'var(--bg2)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--tm)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
            <i className="ti ti-eye" style={{ fontSize: 12, marginRight: 5 }} />
            What Claude sees with every question
          </div>
          <pre style={{
            margin: 0, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 3,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--tw)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto',
          }}>{snapshotPreview}</pre>
        </div>
      )}

      {/* ── Setup panel ──────────────────────────────────────────────── */}
      {showSetup && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--br)', background: 'var(--bg2)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--tm)', marginBottom: 8, lineHeight: 1.6 }}>
            Paste your Claude API key (starts with <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>sk-ant-</code>).
            Get one at <span style={{ color: 'var(--gb)' }}>console.anthropic.com</span> → API Keys.
            The key is stored locally on this Mac only{config?.hasKey ? ` — current key ends in ${config.keyHint}` : ''}.
            {config?.hasKey && <> Current model: <strong style={{ color: 'var(--tw)' }}>{currentModelLabel}</strong> (change via the ⋯ menu).</>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              placeholder="sk-ant-…"
              value={keyDraft}
              aria-label="Claude API key"
              onChange={e => setKeyDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveSetup(); }}
              style={{ flex: 1, padding: '8px 10px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
            />
            <Button variant="primary" onClick={saveSetup} disabled={!keyDraft.trim() && !config?.hasKey}>
              Save
            </Button>
          </div>

          {/* Advanced: custom system prompt */}
          <button
            onClick={() => setShowAdvanced(a => !a)}
            aria-expanded={showAdvanced}
            style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--tm)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <i className={`ti ${showAdvanced ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ fontSize: 12 }} />
            Advanced — custom system prompt
          </button>
          {showAdvanced && config && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--tm)', marginBottom: 6, lineHeight: 1.5 }}>
                Override the assistant's built-in instructions. Leave blank to use the default
                ({config.defaultSystemPrompt.length} chars). The session snapshot is appended automatically.
              </div>
              <textarea
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                placeholder={config.defaultSystemPrompt}
                rows={6}
                aria-label="Custom system prompt"
                style={{ width: '100%', padding: '8px 10px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <Button variant="primary" onClick={saveCustomPrompt}>Save prompt</Button>
                <Button variant="ghost" onClick={() => setPromptDraft('')}>Reset to default</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Conversation ─────────────────────────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !busy && (
          <div style={{ margin: 'auto', maxWidth: 620, textAlign: 'center' }}>
            <i className="ti ti-sparkles" style={{ fontSize: 34, color: 'var(--pp)' }} />
            <div style={{ fontSize: 14, color: 'var(--tw)', margin: '10px 0 4px', fontWeight: 500 }}>
              Ask Claude about {vehicleDisplayName(vehicle) !== 'No vehicle set' ? vehicleDisplayName(vehicle) : 'this vehicle'}, live
            </div>
            <div style={{ fontSize: 12, color: 'var(--tm)', lineHeight: 1.6, marginBottom: 16 }}>
              Every question includes a snapshot of the current session — live readings,
              DTCs, and recent logs — so answers are grounded in what the app is actually seeing.
              Type <code style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--pp)' }}>/</code> for slash commands.
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && !busy;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 13px', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: m.role === 'user' ? 'rgba(255,128,0,0.10)'
                  : m.role === 'error' ? 'rgba(255,36,64,0.07)' : 'var(--bg3)',
                border: `1px solid ${m.role === 'user' ? 'rgba(255,128,0,0.3)'
                  : m.role === 'error' ? 'rgba(255,36,64,0.35)' : 'var(--br)'}`,
                color: m.role === 'error' ? 'var(--sr)' : 'var(--tw)',
              }}>
                {m.role === 'assistant' && (
                  <div style={{ fontSize: 10, color: 'var(--pp)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>
                      <i className="ti ti-sparkles" style={{ fontSize: 11, marginRight: 4 }} />
                      Claude
                    </span>
                    {m.model && (
                      <span style={{ color: 'var(--tm)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, letterSpacing: 0 }}>
                        {m.model.replace('claude-', '')}
                      </span>
                    )}
                    {m.usage && (
                      <span style={{ color: 'var(--tm)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, letterSpacing: 0 }}>
                        · {m.usage.input_tokens}↑ {m.usage.output_tokens}↓
                      </span>
                    )}
                  </div>
                )}
                {m.content}
                {(m.role === 'assistant' || m.role === 'error') && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
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
            <div aria-live="polite" style={{
              maxWidth: '80%', padding: '10px 13px', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: 'var(--bg3)', border: '1px solid var(--pp)', color: 'var(--tw)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--pp)', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-loader" style={{ fontSize: 11, animation: 'spin 1s linear infinite' }} />
                Claude {streamingText ? 'is replying' : 'is reading the session data'}…
              </div>
              {streamingText || <span style={{ color: 'var(--tm)' }}>…</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Quick actions ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 14px 0', flexShrink: 0 }}>
        {QUICK_ACTIONS.map(q => (
          <button
            key={q.label}
            onClick={() => send(q.prompt)}
            disabled={busy || !config?.hasKey}
            title={q.prompt}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'var(--bg3)', border: '1px solid var(--br)', borderRadius: 14,
              padding: '5px 11px', cursor: (busy || !config?.hasKey) ? 'not-allowed' : 'pointer',
              color: (busy || !config?.hasKey) ? 'var(--tm)' : 'var(--tw)', fontSize: 11,
            }}
            onMouseEnter={e => { if (!busy && config?.hasKey) (e.currentTarget as HTMLElement).style.borderColor = 'var(--pp)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--br)'; }}
          >
            <i className={`ti ${q.icon}`} style={{ fontSize: 12, color: 'var(--pp)' }} />
            {q.label}
          </button>
        ))}
      </div>

      {/* ── Slash command hints ──────────────────────────────────────── */}
      {slashHints.length > 0 && (
        <div style={{ padding: '6px 14px 0', flexShrink: 0 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--br)', borderRadius: 4, padding: 6, maxHeight: 160, overflowY: 'auto' }}>
            {slashHints.map(c => (
              <button
                key={c.cmd}
                onClick={() => { setInput(c.cmd); }}
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '4px 8px', cursor: 'pointer', color: 'var(--tw)', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--pp)', minWidth: 70 }}>{c.cmd}</code>
                <span style={{ fontSize: 11, color: 'var(--tm)' }}>{c.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 12px', borderTop: '1px solid var(--br)', flexShrink: 0, marginTop: 8 }}>
        <input
          type="text"
          placeholder={config?.hasKey ? 'Ask about the vehicle, a reading, a fault code… or type / for shortcuts' : 'Add your API key in Settings first'}
          value={input}
          disabled={busy || !config?.hasKey}
          aria-label="Message to Claude"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(input); }}
          style={{ flex: 1, padding: '10px 12px', fontSize: 13 }}
        />
        {busy ? (
          <Button variant="danger" icon="ti-player-stop" onClick={cancel}>
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
        <div role="status" style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg4)', border: '1px solid var(--pp)', color: 'var(--pp)', borderRadius: 3, padding: '5px 12px', fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {copyToast}
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @media (prefers-reduced-motion: reduce) {
          .ti-loader { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
