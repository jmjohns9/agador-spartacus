import { contextBridge, ipcRenderer } from 'electron';
import { PIDReading, DTCCode, ModuleState, ConnectionStatus, LogEntry, SessionSnapshot, DataRecording, FreezeFrame, StorageConfig, StorageInfo, ReportPayload, PcmReadResult, Appearance } from '../shared/types';

// ─── Secure IPC Bridge (contextIsolation: true) ────────────────────────────────
// All communication between the renderer (React) and main process
// goes through this bridge. The renderer cannot access Node.js APIs directly.

// Each unsubscribe removes only its own listener. removeAllListeners(channel)
// also dropped every other subscriber to that channel when one unmounted.
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Commands (renderer → main) ─────────────────────────────────────────────
  listPorts:    ()                               => ipcRenderer.invoke('obd:list-ports'),
  connect:      (port: string)                   => ipcRenderer.invoke('obd:connect', { port }),
  disconnect:   ()                               => ipcRenderer.invoke('obd:disconnect'),
  scanDTCs:     ()                               => ipcRenderer.invoke('obd:scan-dtc'),
  checkModules: ()                               => ipcRenderer.invoke('obd:check-modules'),
  readPcmIds:   ()                               => ipcRenderer.invoke('pcm:read-ids') as Promise<PcmReadResult>,
  exportLog:    (filename: string, text?: string) => ipcRenderer.invoke('session:export-log', { filename, text }),
  exportCSV:    (data: string, filename: string) => ipcRenderer.invoke('session:export-csv', { data, filename }),
  getAppearance: ()                  => ipcRenderer.invoke('app:get-appearance') as Promise<Appearance>,
  getStatus:     ()                  => ipcRenderer.invoke('obd:get-status') as Promise<{ status: ConnectionStatus; protocol?: string; adapterInfo?: string }>,
  setAppearance: (a: Appearance)     => ipcRenderer.invoke('app:set-appearance', a) as Promise<Appearance>,

  // ── Claude assistant ────────────────────────────────────────────────────────
  claudeAsk:        (payload: { question: string; context: unknown; history: unknown })                  => ipcRenderer.invoke('claude:ask', payload),
  claudeCancel:     ()                                                                                   => ipcRenderer.invoke('claude:cancel'),
  onClaudeStreamChunk: (cb: (delta: string) => void) => {
    return subscribe('claude:stream-chunk', cb);
  },
  claudeGetConfig:  ()                                                                                   => ipcRenderer.invoke('claude:get-config'),
  claudeSetConfig:  (cfg: { apiKey?: string; model?: string; customSystemPrompt?: string })              => ipcRenderer.invoke('claude:set-config', cfg),
  claudeExportChat: (markdown: string, filename: string)                                                 => ipcRenderer.invoke('claude:export-chat', { markdown, filename }),

  // ── Event subscriptions (main → renderer) ──────────────────────────────────
  onPIDReading: (cb: (r: PIDReading) => void) => {
    return subscribe('obd:pid-reading', cb);
  },

  onPcmProgress: (cb: (p: { done: number; total: number }) => void) => {
    return subscribe('pcm:read-progress', cb);
  },

  onDTCResult: (cb: (dtcs: DTCCode[]) => void) => {
    return subscribe('obd:dtc-result', cb);
  },

  onModuleState: (cb: (m: ModuleState) => void) => {
    return subscribe('obd:module-state', cb);
  },

  onConnectionStatus: (cb: (s: { status: ConnectionStatus; protocol?: string; adapterInfo?: string }) => void) => {
    return subscribe('obd:connection-status', cb);
  },

  onLogEntry: (cb: (e: LogEntry) => void) => {
    return subscribe('session:log-entry', cb);
  },

  onVINDetected: (cb: (vin: string) => void) => {
    return subscribe('obd:vin-detected', cb);
  },

  onBtRSSI: (cb: (rssi: number | null) => void) => {
    return subscribe('obd:bt-rssi', cb);
  },

  decodeVIN: (vin: string) => ipcRenderer.invoke('obd:decode-vin', { vin }),

  storage: {
    getConfig:          (): Promise<StorageConfig>                    => ipcRenderer.invoke('storage:get-config'),
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
