import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ELM327Commander } from '../core/elm327Commander';
import { ELM327Simulator } from '../core/elm327Simulator';
import { OBDProtocolManager } from '../core/obdProtocolManager';
import { PIDReading, DTCCode, ModuleState, ConnectionStatus, LogEntry } from '../shared/types';
import { GMT800_MODULES } from '../core/vehicleProfile';
import * as fs from 'fs';

// ─── Main Window ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#07080A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: '2004 Chevrolet Silverado 1500 — Silverado DX',
  });

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── OBD Session State ────────────────────────────────────────────────────────

let elm: ELM327Commander | null = null;
let obd: OBDProtocolManager | null = null;
let simulator: ELM327Simulator | null = null;
let simulatorMode = false;
let sessionLog: LogEntry[] = [];

function sendToRenderer(channel: string, data: unknown): void {
  mainWindow?.webContents.send(channel, data);
}

function addLog(entry: LogEntry): void {
  sessionLog.push(entry);
  sendToRenderer('session:log-entry', entry);
}

// ─── Simulator Mode ───────────────────────────────────────────────────────────

function startSimulator(): void {
  simulatorMode = true;
  simulator = new ELM327Simulator();

  // Create a fake "send" function that feeds simulator responses back
  const fakeEmitter = new EventEmitter();

  const fakeSend = (data: string): void => {
    // Small async delay to simulate serial latency
    setTimeout(() => {
      const response = simulator!.respond(data.trim());
      fakeEmitter.emit('data', response);
    }, 20 + Math.random() * 30);
  };

  elm = new ELM327Commander(fakeSend);

  // Wire simulator responses back into ELM327Commander
  fakeEmitter.on('data', (chunk: string) => elm?.onData(chunk));

  wireELMEvents();

  elm.initialize().then((info) => {
    sendToRenderer('obd:connection-status', {
      status: 'connected' as ConnectionStatus,
      protocol: 'SAE J1850 VPW (Simulator)',
      adapterInfo: `${info.firmwareVersion} — SIMULATOR MODE`,
    });
    addLog({ timestamp: Date.now(), level: 'ok', message: 'Simulator mode started — 2004 Silverado 1500 Z71 session' });
    startOBDManager();
  });
}

// ─── Serial / Bluetooth connection ────────────────────────────────────────────

async function connectToPort(portPath: string): Promise<void> {
  sendToRenderer('obd:connection-status', { status: 'connecting' as ConnectionStatus });

  try {
    // Dynamic import to avoid build errors in environments without serialport
    // @ts-ignore — serialport types installed at runtime
    const { SerialPort } = await import('serialport');

    const port = new SerialPort({ path: portPath, baudRate: 38400, autoOpen: false });

    const fakeSend = (data: string): void => {
      port.write(data + '\r', (err: Error) => {
        if (err) addLog({ timestamp: Date.now(), level: 'error', message: `Serial write error: ${err.message}` });
      });
    };

    elm = new ELM327Commander(fakeSend);

    port.on('data', (chunk: Buffer) => elm?.onData(chunk.toString('ascii')));
    port.on('error', (err: Error) => {
      addLog({ timestamp: Date.now(), level: 'error', message: `Serial port error: ${err.message}` });
      sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus });
    });
    port.on('close', () => {
      addLog({ timestamp: Date.now(), level: 'warn', message: 'Serial port closed' });
      sendToRenderer('obd:connection-status', { status: 'disconnected' as ConnectionStatus });
    });

    wireELMEvents();

    await new Promise<void>((resolve, reject) => {
      port.open((openErr: Error | null) => openErr ? reject(openErr) : resolve());
    });

    sendToRenderer('obd:connection-status', { status: 'initializing' as ConnectionStatus });

    const info = await elm.initialize();

    sendToRenderer('obd:connection-status', {
      status: 'connected' as ConnectionStatus,
      protocol: info.protocol,
      adapterInfo: info.firmwareVersion,
    });

    addLog({ timestamp: Date.now(), level: 'ok', message: `Connected — ${info.firmwareVersion} — Protocol: ${info.protocol} — Battery: ${info.voltage}` });

    startOBDManager();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addLog({ timestamp: Date.now(), level: 'error', message: `Connection failed: ${msg}` });
    sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus });
  }
}

function wireELMEvents(): void {
  if (!elm) return;
  elm.on('log', (entry: LogEntry) => addLog(entry));
}

function startOBDManager(): void {
  if (!elm) return;
  obd = new OBDProtocolManager(elm);

  obd.on('pid-reading', (reading: PIDReading) => {
    sendToRenderer('obd:pid-reading', reading);
  });

  obd.on('log', (entry: LogEntry) => addLog(entry));

  // Discover supported PIDs then start the polling loop
  obd.discoverSupportedPIDs().then(() => {
    obd?.startPolling(100, 500, 2000);
    addLog({ timestamp: Date.now(), level: 'info', message: 'PID polling started — fast:100ms normal:500ms slow:2000ms' });
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('obd:connect', async (_event, { port }: { port: string }) => {
  if (port === 'SIMULATOR') {
    startSimulator();
  } else {
    await connectToPort(port);
  }
});

ipcMain.handle('obd:disconnect', async () => {
  obd?.stopPolling();
  addLog({ timestamp: Date.now(), level: 'info', message: 'Session disconnected' });
  sendToRenderer('obd:connection-status', { status: 'disconnected' as ConnectionStatus });
});

ipcMain.handle('obd:scan-dtc', async () => {
  if (!obd) return [];
  const dtcs = await obd.scanDTCs();
  sendToRenderer('obd:dtc-result', dtcs);
  return dtcs;
});

ipcMain.handle('obd:clear-dtc', async () => {
  if (!obd) return false;
  return await obd.clearDTCs();
});

ipcMain.handle('obd:check-modules', async () => {
  // Return initial module list — runtime wake detection is done by monitoring PID responses
  return GMT800_MODULES;
});

ipcMain.handle('session:export-log', async (_event, { filename }: { filename: string }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [{ name: 'Log files', extensions: ['log', 'txt'] }],
  });

  if (!filePath) return;

  const lines = sessionLog.map(e => {
    const ts = new Date(e.timestamp).toISOString();
    return `${ts}\t${e.level.toUpperCase().padEnd(5)}\t${e.message}`;
  }).join('\n');

  fs.writeFileSync(filePath, lines, 'utf-8');
  addLog({ timestamp: Date.now(), level: 'ok', message: `Session log exported to ${filePath}` });
});

ipcMain.handle('session:export-csv', async (_event, { data, filename }: { data: string; filename: string }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [{ name: 'CSV files', extensions: ['csv'] }],
  });

  if (!filePath) return;
  fs.writeFileSync(filePath, data, 'utf-8');
  addLog({ timestamp: Date.now(), level: 'ok', message: `Session data exported to ${filePath}` });
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  obd?.stopPolling();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
