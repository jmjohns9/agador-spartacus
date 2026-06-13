import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ELM327Commander } from '../core/elm327Commander';
import { ELM327Simulator } from '../core/elm327Simulator';
import { OBDProtocolManager } from '../core/obdProtocolManager';
import { PIDReading, DTCCode, ModuleState, ConnectionStatus, LogEntry } from '../shared/types';
import { GMT800 } from '../core/platforms/gmt800';
import { askClaude, loadConfig as loadClaudeConfig, saveConfig as saveClaudeConfig, SessionContext, ChatTurn, CLAUDE_MODELS, DEFAULT_SYSTEM_PROMPT } from './claudeAssistant';
import * as fs from 'fs';

// SerialPort is a native module — use require() to avoid dynamic import issues in Electron
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SerialPort } = require('serialport') as { SerialPort: any };

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
    title: 'Project Agador Spartacus',
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
let activePort: any = null;       // currently open SerialPort (if any)
let isConnecting = false;          // guard against concurrent connect attempts

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
    addLog({ timestamp: Date.now(), level: 'ok', message: 'Simulator mode started — synthetic J1850 VPW session' });
    startOBDManager();
  });
}

// ─── Serial / Bluetooth connection ────────────────────────────────────────────

// Close and release any port we currently hold. Resolves once fully closed.
async function releaseActivePort(): Promise<void> {
  if (!activePort) return;
  const p = activePort;
  activePort = null;
  try {
    if (p.isOpen) {
      await new Promise<void>((resolve) => p.close(() => resolve()));
    }
  } catch {
    // ignore — best effort
  }
}

async function connectToPort(portPath: string): Promise<void> {
  // Guard: never run two connect attempts at once (that causes "Cannot lock port")
  if (isConnecting) {
    addLog({ timestamp: Date.now(), level: 'warn', message: 'Connect ignored — a connection attempt is already in progress' });
    return;
  }
  isConnecting = true;

  sendToRenderer('obd:connection-status', { status: 'connecting' as ConnectionStatus });

  // macOS Bluetooth-serial gotcha: tty.* is the call-IN device and blocks waiting
  // for carrier detect. cu.* is the call-UP device and is the correct one for
  // outgoing connections. Auto-correct so the adapter actually responds.
  if (portPath.includes('/dev/tty.')) {
    const corrected = portPath.replace('/dev/tty.', '/dev/cu.');
    addLog({ timestamp: Date.now(), level: 'info', message: `Using call-up device ${corrected} instead of ${portPath} (macOS Bluetooth requires cu.*)` });
    portPath = corrected;
  }

  // Make sure no stale port is still holding the lock
  await releaseActivePort();

  try {
    // OBDLink MX+ over Bluetooth SPP uses 115200 baud
    const port = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false });
    activePort = port;

    const fakeSend = (data: string): void => {
      // data already includes trailing \r from ELM327Commander.send()
      const display = data.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
      addLog({ timestamp: Date.now(), level: 'info', message: `TX → ${display}` });
      port.write(data, (err: Error | null | undefined) => {
        if (err) addLog({ timestamp: Date.now(), level: 'error', message: `Serial write error: ${err.message}` });
      });
    };

    elm = new ELM327Commander(fakeSend);

    port.on('data', (chunk: Buffer) => {
      const ascii = chunk.toString('ascii');
      const display = ascii.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
      addLog({ timestamp: Date.now(), level: 'info', message: `RX ← ${display}` });
      elm?.onData(ascii);
    });
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
    sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus, adapterInfo: msg });
    // Release the port so the lock doesn't linger and block the next attempt
    await releaseActivePort();
  } finally {
    isConnecting = false;
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
    obd?.startPolling();
    addLog({ timestamp: Date.now(), level: 'info', message: 'Sequential PID polling started (fast every cycle, normal every 3rd, slow every 10th)' });
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('obd:list-ports', async () => {
  try {
    const ports: Array<{ path: string; manufacturer?: string; serialNumber?: string; vendorId?: string }> = await SerialPort.list();
    return ports
      // Hide noise like /dev/cu.Bluetooth-Incoming-Port and debug consoles
      .filter(p => !/Bluetooth-Incoming|debug-console/i.test(p.path))
      .map(p => {
        const haystack = `${p.path} ${p.manufacturer ?? ''}`;
        // Match OBD adapters by name, OR common USB-serial bridges used by USB
        // OBD adapters (FTDI, Silicon Labs CP210x, Prolific, CH340), OR the
        // generic macOS usbserial/usbmodem device names.
        const isOBD = /obd|elm|obdlink|stn\d|ftdi|silicon\s*labs|cp210|prolific|ch340|usbserial|usbmodem/i.test(haystack);
        return {
          path: p.path,
          manufacturer: p.manufacturer ?? '',
          serialNumber: p.serialNumber ?? '',
          isOBD,
        };
      })
      // Surface likely OBD adapters first
      .sort((a, b) => Number(b.isOBD) - Number(a.isOBD));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
});

ipcMain.handle('obd:connect', async (_event, { port }: { port: string }) => {
  if (port === 'SIMULATOR') {
    startSimulator();
  } else {
    await connectToPort(port);
  }
});

ipcMain.handle('obd:disconnect', async () => {
  obd?.stopPolling();
  obd = null;
  // Actually close the serial port so the lock is released for the next session
  await releaseActivePort();
  elm = null;
  simulator = null;
  simulatorMode = false;
  addLog({ timestamp: Date.now(), level: 'info', message: 'Session disconnected — port released' });
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
  // Runtime wake detection is done by monitoring PID responses. The renderer
  // seeds its module list from the resolved platform profile; for the simulator
  // (a GMT800 vehicle) we return that platform's module map.
  return simulatorMode ? GMT800.modules : [];
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

// ─── Claude assistant ─────────────────────────────────────────────────────────

// One in-flight ask at a time — the chat UI serializes sends, so a single
// controller is enough. Cancel aborts the fetch mid-stream.
let activeAskController: AbortController | null = null;

ipcMain.handle('claude:ask', async (_event, { question, context, history }: {
  question: string; context: SessionContext; history: ChatTurn[];
}) => {
  activeAskController?.abort();
  const controller = new AbortController();
  activeAskController = controller;
  try {
    return await askClaude(question, context, history, {
      signal: controller.signal,
      onText: (delta) => sendToRenderer('claude:stream-chunk', delta),
    });
  } finally {
    if (activeAskController === controller) activeAskController = null;
  }
});

ipcMain.handle('claude:cancel', async () => {
  activeAskController?.abort();
  activeAskController = null;
  return true;
});

ipcMain.handle('claude:get-config', async () => {
  const cfg = loadClaudeConfig();
  // Never send the full key back to the renderer — just enough to show status
  return {
    hasKey:               cfg.apiKey.length > 0,
    keyHint:              cfg.apiKey ? `…${cfg.apiKey.slice(-4)}` : '',
    model:                cfg.model,
    models:               CLAUDE_MODELS,
    customSystemPrompt:   cfg.customSystemPrompt,
    defaultSystemPrompt:  DEFAULT_SYSTEM_PROMPT,
  };
});

ipcMain.handle('claude:set-config', async (_event, { apiKey, model, customSystemPrompt }: {
  apiKey?: string; model?: string; customSystemPrompt?: string;
}) => {
  const updates: { apiKey?: string; model?: string; customSystemPrompt?: string } = {};
  if (typeof apiKey === 'string' && apiKey.trim()) updates.apiKey = apiKey.trim();
  if (typeof model === 'string' && model) updates.model = model;
  if (typeof customSystemPrompt === 'string') updates.customSystemPrompt = customSystemPrompt;
  saveClaudeConfig(updates);
  return true;
});

ipcMain.handle('claude:export-chat', async (_event, { markdown, filename }: { markdown: string; filename: string }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
  });
  if (!filePath) return false;
  fs.writeFileSync(filePath, markdown, 'utf-8');
  addLog({ timestamp: Date.now(), level: 'ok', message: `Assistant chat exported to ${filePath}` });
  return true;
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

// App name — shown in the menu bar and as the Dock icon tooltip.
// (In dev mode the Dock may still say "Electron" because the tooltip comes from
//  the Electron binary's Info.plist; packaged builds use productName and show
//  "Project Agador Spartacus" correctly.)
app.setName('Project Agador Spartacus');

app.whenReady().then(() => {
  // Dock icon for dev mode (packaged builds get it from electron-builder's icon config)
  if (process.platform === 'darwin') {
    const iconPath = path.join(app.getAppPath(), 'build', 'icon-1024.png');
    if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  obd?.stopPolling();
  // Release the serial port so the adapter isn't locked for other apps
  releaseActivePort();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
