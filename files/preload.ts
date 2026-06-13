import { contextBridge, ipcRenderer } from 'electron';
import { PIDReading, DTCCode, ModuleState, ConnectionStatus, LogEntry } from '../shared/types';

// ─── Secure IPC Bridge (contextIsolation: true) ────────────────────────────────
// All communication between the renderer (React) and main process
// goes through this bridge. The renderer cannot access Node.js APIs directly.

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Commands (renderer → main) ─────────────────────────────────────────────
  connect:      (port: string)                   => ipcRenderer.invoke('obd:connect', { port }),
  disconnect:   ()                               => ipcRenderer.invoke('obd:disconnect'),
  scanDTCs:     ()                               => ipcRenderer.invoke('obd:scan-dtc'),
  clearDTCs:    ()                               => ipcRenderer.invoke('obd:clear-dtc'),
  checkModules: ()                               => ipcRenderer.invoke('obd:check-modules'),
  exportLog:    (filename: string)               => ipcRenderer.invoke('session:export-log', { filename }),
  exportCSV:    (data: string, filename: string) => ipcRenderer.invoke('session:export-csv', { data, filename }),

  // ── Event subscriptions (main → renderer) ──────────────────────────────────
  onPIDReading: (cb: (r: PIDReading) => void) => {
    ipcRenderer.on('obd:pid-reading', (_e, r) => cb(r));
    return () => ipcRenderer.removeAllListeners('obd:pid-reading');
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
});

// ── Type declaration for the renderer ─────────────────────────────────────────
// This is imported in the renderer via /// <reference types="./preload" />
export {};
