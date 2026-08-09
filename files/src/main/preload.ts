import { contextBridge, ipcRenderer } from 'electron';
import { PIDReading, DTCCode, ModuleState, ConnectionStatus, LogEntry, SessionSnapshot, DataRecording, FreezeFrame, StorageConfig, StorageInfo, ReportPayload, PcmReadResult } from '../shared/types';

// ─── Secure IPC Bridge (contextIsolation: true) ────────────────────────────────
// All communication between the renderer (React) and main process
// goes through this bridge. The renderer cannot access Node.js APIs directly.

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Commands (renderer → main) ─────────────────────────────────────────────
  listPorts:    ()                               => ipcRenderer.invoke('obd:list-ports'),
  connect:      (port: string)                   => ipcRenderer.invoke('obd:connect', { port }),
  disconnect:   ()                               => ipcRenderer.invoke('obd:disconnect'),
  scanDTCs:     ()                               => ipcRenderer.invoke('obd:scan-dtc'),
  clearDTCs:    ()                               => ipcRenderer.invoke('obd:clear-dtc'),
  checkModules: ()                               => ipcRenderer.invoke('obd:check-modules'),
  readPcmIds:   ()                               => ipcRenderer.invoke('pcm:read-ids') as Promise<PcmReadResult>,
  exportLog:    (filename: string)               => ipcRenderer.invoke('session:export-log', { filename }),
  exportCSV:    (data: string, filename: string) => ipcRenderer.invoke('session:export-csv', { data, filename }),

  // ── Claude assistant ────────────────────────────────────────────────────────
  claudeAsk:        (payload: { question: string; context: unknown; history: unknown })                  => ipcRenderer.invoke('claude:ask', payload),
  claudeCancel:     ()                                                                                   => ipcRenderer.invoke('claude:cancel'),
  onClaudeStreamChunk: (cb: (delta: string) => void) => {
    ipcRenderer.on('claude:stream-chunk', (_e, delta) => cb(delta));
    return () => ipcRenderer.removeAllListeners('claude:stream-chunk');
  },
  claudeGetConfig:  ()                                                                                   => ipcRenderer.invoke('claude:get-config'),
  claudeSetConfig:  (cfg: { apiKey?: string; model?: string; customSystemPrompt?: string })              => ipcRenderer.invoke('claude:set-config', cfg),
  claudeExportChat: (markdown: string, filename: string)                                                 => ipcRenderer.invoke('claude:export-chat', { markdown, filename }),

  // ── Event subscriptions (main → renderer) ──────────────────────────────────
  onPIDReading: (cb: (r: PIDReading) => void) => {
    ipcRenderer.on('obd:pid-reading', (_e, r) => cb(r));
    return () => ipcRenderer.removeAllListeners('obd:pid-reading');
  },

  onPcmProgress: (cb: (p: { done: number; total: number }) => void) => {
    ipcRenderer.on('pcm:read-progress', (_e, p) => cb(p));
    return () => ipcRenderer.removeAllListeners('pcm:read-progress');
  },

  onDTCResult: (cb: (dtcs: DTCCode[]) => void) => {
    ipcRenderer.on('obd:dtc-result', (_e, d) => cb(d));
    return () => ipcRenderer.removeAllListeners('obd:dtc-result');
  },

  onModuleState: (cb: (m: ModuleState) => void) => {
    ipcRenderer.on('obd:module-state', (_e, m) => cb(m));
    return () => ipcRenderer.removeAllListeners('obd:module-state');
  },

  onConnectionStatus: (cb: (s: { status: ConnectionStatus; protocol?: string; adapterInfo?: string }) => void) => {
    ipcRenderer.on('obd:connection-status', (_e, s) => cb(s));
    return () => ipcRenderer.removeAllListeners('obd:connection-status');
  },

  onLogEntry: (cb: (e: LogEntry) => void) => {
    ipcRenderer.on('session:log-entry', (_e, entry) => cb(entry));
    return () => ipcRenderer.removeAllListeners('session:log-entry');
  },

  onVINDetected: (cb: (vin: string) => void) => {
    ipcRenderer.on('obd:vin-detected', (_e, vin) => cb(vin));
    return () => ipcRenderer.removeAllListeners('obd:vin-detected');
  },

  onBtRSSI: (cb: (rssi: number | null) => void) => {
    ipcRenderer.on('obd:bt-rssi', (_e, rssi) => cb(rssi));
    return () => ipcRenderer.removeAllListeners('obd:bt-rssi');
  },

  decodeVIN: (vin: string) => ipcRenderer.invoke('obd:decode-vin', { vin }),

  storage: {
    getConfig:          (): Promise<StorageConfig>                    => ipcRenderer.invoke('storage:get-config'),
    setConfig:          (u: Partial<StorageConfig>): Promise<boolean>  => ipcRenderer.invoke('storage:set-config', u),
    migrate:            (to: 'local' | 'sqlite'): Promise<boolean>    => ipcRenderer.invoke('storage:migrate', { to }),
    getInfo:            (): Promise<StorageInfo>                      => ipcRenderer.invoke('storage:get-info'),
    openDataFolder:     (): Promise<void>                             => ipcRenderer.invoke('storage:open-data-folder'),
    saveSnapshot:       (snap: SessionSnapshot): Promise<string>      => ipcRenderer.invoke('storage:save-snapshot', snap),
    getSnapshots:       (): Promise<SessionSnapshot[]>                => ipcRenderer.invoke('storage:get-snapshots'),
    deleteSnapshot:     (id: string): Promise<boolean>               => ipcRenderer.invoke('storage:delete-snapshot', { id }),
    saveRecording:      (rec: DataRecording): Promise<string>         => ipcRenderer.invoke('storage:save-recording', rec),
    getRecordings:      (): Promise<DataRecording[]>                  => ipcRenderer.invoke('storage:get-recordings'),
    deleteRecording:    (id: string): Promise<boolean>               => ipcRenderer.invoke('storage:delete-recording', { id }),
    saveFreezeFrame:    (ff: FreezeFrame): Promise<string>            => ipcRenderer.invoke('storage:save-freeze-frame', ff),
    getFreezeFrames:    (dtcCode?: string): Promise<FreezeFrame[]>    => ipcRenderer.invoke('storage:get-freeze-frames', { dtcCode }),
    deleteFreezeFrame:  (id: string): Promise<boolean>               => ipcRenderer.invoke('storage:delete-freeze-frame', { id }),
  },
  reportGenerate: (payload: ReportPayload): Promise<string> => ipcRenderer.invoke('report:generate', payload),
  carsxeDecode: (code: string): Promise<{ ok: true; description: string; causes: string[]; repair: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('carsxe:decode', { code }),
});

// ── Type declaration for the renderer ─────────────────────────────────────────
// This is imported in the renderer via /// <reference types="./preload" />
export {};
