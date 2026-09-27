import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import * as path from 'path';
import { EventEmitter } from 'events';
import { execFile } from 'child_process';
import { ELM327Commander } from '../core/elm327Commander';
import { ELM327Simulator } from '../core/elm327Simulator';
import { OBDProtocolManager } from '../core/obdProtocolManager';
import { PIDReading, DTCCode, ModuleState, ConnectionStatus, LogEntry, PcmReadResult } from '../shared/types';
import { PcmDiagnostics } from '../core/pcmDiagnostics';
import { GMT800 } from '../core/platforms/gmt800';
import { askClaude, loadConfig as loadClaudeConfig, saveConfig as saveClaudeConfig, SessionContext, ChatTurn, CLAUDE_MODELS, DEFAULT_SYSTEM_PROMPT } from './claudeAssistant';
import * as fs from 'fs';
import { StorageService } from './storageService';
import { loadAppearance, saveAppearance, parseAppearance } from './appearance';

// SerialPort is a native module — use require() to avoid dynamic import issues in Electron
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SerialPort } = require('serialport') as { SerialPort: any };

// ─── Main Window ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Apply the saved override before the window exists so vibrancy and
  // prefers-color-scheme are correct on the very first frame.
  nativeTheme.themeSource = loadAppearance(app.getPath('userData'));

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 19 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'Project Agador Spartacus',
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

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
let debugSerial = false;           // set true to log every TX/RX byte over IPC

// Session generation. Every connect and disconnect ends the current session
// by bumping this; async connect/init/discovery chains capture the value they
// started with and drop their results once it has moved on. Without this a
// chain from a disconnected or replaced session kept running and later
// reported 'connected' (or 'error') over the live state, or started a second
// poll loop on the next session's adapter.
let sessionGen = 0;

const storage = new StorageService();

// Ring-buffer cap so a long-lived connected session doesn't grow the log
// array unboundedly (see eval/performance PRF-001 / eval/security SEC-004).
const SESSION_LOG_MAX = 5000;

function sendToRenderer(channel: string, data: unknown): void {
  mainWindow?.webContents.send(channel, data);
}

function addLog(entry: LogEntry): void {
  sessionLog.push(entry);
  if (sessionLog.length > SESSION_LOG_MAX) {
    // Drop the oldest 10% in one go — cheaper than splicing every push and
    // keeps the array length bounded at SESSION_LOG_MAX with steady-state
    // amortized O(1) cost.
    sessionLog.splice(0, Math.floor(SESSION_LOG_MAX * 0.1));
  }
  sendToRenderer('session:log-entry', entry);
}

// ─── Simulator Mode ───────────────────────────────────────────────────────────

// Pending simulated serial replies — cancelled on disconnect so none fire after
// the simulator is torn down (a late reply used to throw in the main process).
const simulatorTimers = new Set<ReturnType<typeof setTimeout>>();

function stopSimulatorTimers(): void {
  for (const t of simulatorTimers) clearTimeout(t);
  simulatorTimers.clear();
}

function startSimulator(gen: number): void {
  stopSimulatorTimers();
  simulatorMode = true;
  const sim = new ELM327Simulator();
  simulator = sim;

  // Create a fake "send" function that feeds simulator responses back
  const fakeEmitter = new EventEmitter();

  const fakeSend = (data: string): void => {
    // Small async delay to simulate serial latency
    const timer = setTimeout(() => {
      simulatorTimers.delete(timer);
      // Session ended or was replaced while this reply was in flight
      if (simulator !== sim) return;
      fakeEmitter.emit('data', sim.respond(data.trim()));
    }, 20 + Math.random() * 30);
    simulatorTimers.add(timer);
  };

  const commander = new ELM327Commander(fakeSend);
  elm = commander;

  // Wire simulator responses back into this session's commander
  fakeEmitter.on('data', (chunk: string) => commander.onData(chunk));

  wireELMEvents();

  // Fire-and-forget the init chain — but surface failures to the UI so a
  // throw in elm.initialize() can't leave the renderer stuck in "connecting"
  // forever (see eval/quality QLT-002).
  commander.initialize().then((info) => {
    if (gen !== sessionGen) return;   // disconnected or replaced meanwhile
    sendToRenderer('obd:connection-status', {
      status: 'connected' as ConnectionStatus,
      protocol: 'SAE J1850 VPW (Simulator)',
      adapterInfo: `${info.firmwareVersion} — SIMULATOR MODE`,
    });
    addLog({ timestamp: Date.now(), level: 'ok', message: 'Simulator mode started — synthetic J1850 VPW session' });
    startOBDManager(gen);
  }).catch((err) => {
    if (gen !== sessionGen) return;
    const msg = err instanceof Error ? err.message : String(err);
    addLog({ timestamp: Date.now(), level: 'error', message: `Simulator init failed: ${msg}` });
    sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus, adapterInfo: msg });
    simulatorMode = false;
    simulator = null;
    stopSimulatorTimers();
    commander.close();
    elm = null;
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

async function closePort(p: any): Promise<void> {
  try {
    if (p.isOpen) await new Promise<void>((resolve) => p.close(() => resolve()));
  } catch {
    // ignore — best effort
  }
}

// End the current session, whatever state it is in (connecting, initializing,
// connected): invalidate its async chains, stop polling, fail its adapter's
// pending commands fast, cancel simulator replies and release the port.
async function endSession(): Promise<void> {
  sessionGen++;
  obd?.stopPolling();
  obd?.removeAllListeners();
  obd = null;
  stopRSSIPolling();
  elm?.close();
  elm = null;
  simulator = null;
  stopSimulatorTimers();
  simulatorMode = false;
  // Actually close the serial port so the lock is released for the next session
  await releaseActivePort();
}

async function connectToPort(portPath: string, gen: number): Promise<void> {
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

  let port: any = null;
  let commander: ELM327Commander | null = null;
  try {
    // OBDLink MX+ over Bluetooth SPP uses 115200 baud
    port = new SerialPort({ path: portPath, baudRate: 115200, autoOpen: false });
    activePort = port;

    const fakeSend = (data: string): void => {
      if (debugSerial) {
        const display = data.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        addLog({ timestamp: Date.now(), level: 'info', message: `TX → ${display}` });
      }
      port.write(data, (err: Error | null | undefined) => {
        if (err) addLog({ timestamp: Date.now(), level: 'error', message: `Serial write error: ${err.message}` });
      });
    };

    commander = new ELM327Commander(fakeSend);
    elm = commander;

    port.on('data', (chunk: Buffer) => {
      const ascii = chunk.toString('ascii');
      if (debugSerial) {
        const display = ascii.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        addLog({ timestamp: Date.now(), level: 'info', message: `RX ← ${display}` });
      }
      commander?.onData(ascii);
    });
    // Port events only speak for the live session. A port we closed ourselves
    // (disconnect, a failed attempt, a replaced session) is no longer
    // activePort — its 'close' used to overwrite the failed attempt's 'error'
    // (hiding the reason) or a newer session's 'connected' with 'disconnected'.
    port.on('error', (err: Error) => {
      addLog({ timestamp: Date.now(), level: 'error', message: `Serial port error: ${err.message}` });
      if (port !== activePort) return;
      sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus });
    });
    port.on('close', () => {
      if (port !== activePort) return;
      // The adapter went away under a live session: end it so nothing keeps
      // polling a closed port.
      addLog({ timestamp: Date.now(), level: 'warn', message: 'Serial port closed' });
      void endSession().then(() => {
        sendToRenderer('obd:connection-status', { status: 'disconnected' as ConnectionStatus });
      });
    });

    wireELMEvents();

    await new Promise<void>((resolve, reject) => {
      port.open((openErr: Error | null) => openErr ? reject(openErr) : resolve());
    });

    // Disconnected (or replaced) while the port was opening: the teardown
    // could not close a port that wasn't open yet, so close it here.
    if (gen !== sessionGen) { await closePort(port); return; }

    sendToRenderer('obd:connection-status', { status: 'initializing' as ConnectionStatus });

    const info = await commander.initialize();
    if (gen !== sessionGen) return;   // teardown already closed the port

    sendToRenderer('obd:connection-status', {
      status: 'connected' as ConnectionStatus,
      protocol: info.protocol,
      adapterInfo: info.firmwareVersion,
    });

    addLog({ timestamp: Date.now(), level: 'ok', message: `Connected — ${info.firmwareVersion} — Protocol: ${info.protocol} — Battery: ${info.voltage}` });

    startRSSIPolling();
    startOBDManager(gen);
  } catch (err) {
    commander?.close();
    if (gen !== sessionGen) {
      // A later disconnect/connect owns the UI state now — just let go of the port.
      if (port) await closePort(port);
      return;
    }
    if (elm === commander) elm = null;
    const msg = err instanceof Error ? err.message : String(err);
    addLog({ timestamp: Date.now(), level: 'error', message: `Connection failed: ${msg}` });
    sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus, adapterInfo: msg });
    // Release the port so the lock doesn't linger and block the next attempt
    await releaseActivePort();
  } finally {
    isConnecting = false;
  }
}

let rssiTimer: ReturnType<typeof setInterval> | null = null;

function startRSSIPolling(): void {
  stopRSSIPolling();
  rssiTimer = setInterval(() => {
    execFile('system_profiler', ['SPBluetoothDataType', '-json'], { timeout: 5000 }, (err, stdout) => {
      if (err) { sendToRenderer('obd:bt-rssi', null); return; }
      try {
        const data = JSON.parse(stdout);
        const bt = data.SPBluetoothDataType?.[0];
        const devices = bt?.device_connected ?? bt?.devices_connected ?? [];
        for (const d of devices) {
          const keys = Object.keys(d);
          for (const k of keys) {
            if (/obd|elm|obdlink/i.test(k)) {
              const rssi = d[k]?.device_rssi;
              if (typeof rssi === 'number') {
                sendToRenderer('obd:bt-rssi', rssi);
                return;
              }
            }
          }
        }
        sendToRenderer('obd:bt-rssi', null);
      } catch { sendToRenderer('obd:bt-rssi', null); }
    });
  }, 3000);
}

function stopRSSIPolling(): void {
  if (rssiTimer) { clearInterval(rssiTimer); rssiTimer = null; }
  sendToRenderer('obd:bt-rssi', null);
}

function wireELMEvents(): void {
  if (!elm) return;
  elm.on('log', (entry: LogEntry) => addLog(entry));
}

function startOBDManager(gen: number): void {
  if (!elm || gen !== sessionGen) return;
  const mgr = new OBDProtocolManager(elm);
  obd = mgr;

  mgr.on('pid-reading', (reading: PIDReading) => {
    sendToRenderer('obd:pid-reading', reading);
  });

  mgr.on('log', (entry: LogEntry) => addLog(entry));

  // Discover supported PIDs then start the polling loop. A throw in
  // discoverSupportedPIDs would otherwise be silently dropped (see QLT-002).
  mgr.discoverSupportedPIDs().then(async () => {
    if (gen !== sessionGen) return;
    mgr.startPolling();
    addLog({ timestamp: Date.now(), level: 'info', message: 'Sequential PID polling started (fast every cycle, normal every 3rd, slow every 10th)' });

    // Re-read the negotiated protocol now that the bus is active — init may
    // have seen "STOPPED" if the engine was off at connect time.
    try {
      const protocol = await mgr.refreshProtocol();
      if (gen !== sessionGen) return;
      sendToRenderer('obd:connection-status', {
        status: 'connected' as ConnectionStatus,
        protocol,
        adapterInfo: elm?.getAdapterInfo()?.firmwareVersion ?? '',
      });
    } catch { /* non-fatal */ }

    // Auto-detect VIN from ECM (Mode 09 PID 02)
    try {
      const vin = await mgr.readVIN();
      if (vin && gen === sessionGen) sendToRenderer('obd:vin-detected', vin);
    } catch { /* non-fatal — not all vehicles support Mode 09 */ }
  }).catch((err) => {
    if (gen !== sessionGen) return;
    const msg = err instanceof Error ? err.message : String(err);
    addLog({ timestamp: Date.now(), level: 'error', message: `PID discovery failed: ${msg}` });
    sendToRenderer('obd:connection-status', { status: 'error' as ConnectionStatus, adapterInfo: msg });
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// ─── Appearance ──────────────────────────────────────────────────────────────

ipcMain.handle('app:get-appearance', () => loadAppearance(app.getPath('userData')));

ipcMain.handle('app:set-appearance', (_event, value: unknown) => {
  const appearance = parseAppearance(value);
  nativeTheme.themeSource = appearance;
  saveAppearance(app.getPath('userData'), appearance);
  return appearance;
});

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
  // Guard: never run two serial connect attempts at once (that causes "Cannot lock port")
  if (port !== 'SIMULATOR' && isConnecting) {
    addLog({ timestamp: Date.now(), level: 'warn', message: 'Connect ignored — a connection attempt is already in progress' });
    return;
  }
  // A new connection replaces whatever session is running.
  await endSession();
  const gen = sessionGen;
  if (port === 'SIMULATOR') {
    startSimulator(gen);
  } else {
    await connectToPort(port, gen);
  }
});

ipcMain.handle('obd:disconnect', async () => {
  await endSession();
  addLog({ timestamp: Date.now(), level: 'info', message: 'Session disconnected — port released' });
  sendToRenderer('obd:connection-status', { status: 'disconnected' as ConnectionStatus });
});

ipcMain.handle('obd:scan-dtc', async () => {
  const mgr = obd;
  if (!mgr) return [];
  const dtcs = await mgr.scanDTCs();
  // Disconnected mid-scan: don't wipe the renderer's list with an empty result
  if (obd === mgr) sendToRenderer('obd:dtc-result', dtcs);
  return dtcs;
});

ipcMain.handle('obd:clear-dtc', async () => {
  if (!obd) return false;
  return await obd.clearDTCs();
});

ipcMain.handle('pcm:read-ids', async (): Promise<PcmReadResult> => {
  if (!elm) return { ok: false, error: 'Not connected to an adapter.' };
  if (simulatorMode) {
    return { ok: false, error: 'PCM identity is read from the physical module — not available in simulator mode.' };
  }

  // The read reprograms the adapter's header and turns headers on, which would
  // corrupt parsePIDResponse mid-flight. Take the bus, then give it back.
  const mgr = obd;
  const wasPolling = mgr !== null;
  mgr?.stopPolling();
  addLog({ timestamp: Date.now(), level: 'info', message: 'PCM identity read starting — PID polling paused' });

  try {
    const pcm = new PcmDiagnostics(elm);
    const identity = await pcm.readIdentity((done, total) => {
      sendToRenderer('pcm:read-progress', { done, total });
    });
    const found = identity.fields.filter(f => f.supported).length;
    addLog({ timestamp: Date.now(), level: 'ok', message: `PCM identity read complete — ${found}/${identity.fields.length} blocks supported` });
    return { ok: true, identity };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    addLog({ timestamp: Date.now(), level: 'error', message: `PCM identity read failed: ${msg}` });
    return { ok: false, error: msg };
  } finally {
    // Only resume the session we paused — not one that was disconnected meanwhile
    if (wasPolling && mgr && obd === mgr) {
      mgr.startPolling();
      addLog({ timestamp: Date.now(), level: 'info', message: 'PID polling resumed' });
    }
  }
});

ipcMain.handle('obd:check-modules', async () => {
  // Runtime wake detection is done by monitoring PID responses. The renderer
  // seeds its module list from the resolved platform profile; for the simulator
  // (a GMT800 vehicle) we return that platform's module map.
  return simulatorMode ? GMT800.modules : [];
});

ipcMain.handle('obd:decode-vin', async (_event, { vin }: { vin: string }) => {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`);
    const json: any = await res.json();
    const r = json.Results?.[0];
    if (!r) return null;
    return {
      year: r.ModelYear ?? '',
      make: r.Make ?? '',
      model: r.Model ?? '',
      engine: [r.DisplacementL ? `${r.DisplacementL}L` : '', r.EngineCylinders ? `${r.EngineCylinders}-cyl` : '', r.FuelTypePrimary ?? ''].filter(Boolean).join(' '),
      trim: r.Trim ?? '',
      transmission: r.TransmissionStyle ?? '',
    };
  } catch {
    return null;
  }
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

// ─── Storage service ──────────────────────────────────────────────────────────

ipcMain.handle('storage:get-config',  ()                        => storage.getConfig());
ipcMain.handle('storage:set-config',  (_e: Electron.IpcMainInvokeEvent, u: Partial<import('../shared/types').StorageConfig>) => { storage.setConfig(u); return true; });
ipcMain.handle('storage:migrate',     (_e: Electron.IpcMainInvokeEvent, { to }: { to: 'local' | 'sqlite' }) => { storage.migrate(to); return true; });
ipcMain.handle('storage:get-info',    ()                        => storage.getInfo());
ipcMain.handle('storage:open-data-folder', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('storage:save-snapshot',    (_e: Electron.IpcMainInvokeEvent, snap: import('../shared/types').SessionSnapshot) => storage.saveSnapshot(snap));
ipcMain.handle('storage:get-snapshots',    ()                        => storage.getSnapshots());
ipcMain.handle('storage:delete-snapshot',  (_e: Electron.IpcMainInvokeEvent, { id }: { id: string }) => { storage.deleteSnapshot(id); return true; });

ipcMain.handle('storage:save-recording',   (_e: Electron.IpcMainInvokeEvent, rec: import('../shared/types').DataRecording) => storage.saveRecording(rec));
ipcMain.handle('storage:get-recordings',   ()                        => storage.getRecordings());
ipcMain.handle('storage:delete-recording', (_e: Electron.IpcMainInvokeEvent, { id }: { id: string }) => { storage.deleteRecording(id); return true; });

ipcMain.handle('storage:save-freeze-frame',   (_e: Electron.IpcMainInvokeEvent, ff: import('../shared/types').FreezeFrame) => storage.saveFreezeFrame(ff));
ipcMain.handle('storage:get-freeze-frames',   (_e: Electron.IpcMainInvokeEvent, { dtcCode }: { dtcCode?: string } = {}) => storage.getFreezeFrames(dtcCode));
ipcMain.handle('storage:delete-freeze-frame', (_e: Electron.IpcMainInvokeEvent, { id }: { id: string }) => { storage.deleteFreezeFrame(id); return true; });

// ─── PDF report ───────────────────────────────────────────────────────────────

ipcMain.handle('report:generate', async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => {
  const os = require('os') as typeof import('os');
  const outDir = path.join(os.homedir(), 'Documents', 'AgadorSpartacus');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const filename = `diagnostic-report-${new Date().toISOString().split('T')[0]}.pdf`;
  const outPath  = path.join(outDir, filename);

  const win = new BrowserWindow({
    show: false, width: 900, height: 1200,
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  });

  const templatePath = path.join(app.getAppPath(), 'assets', 'report.html');
  await win.loadFile(templatePath);
  await win.webContents.executeJavaScript(
    `window.__REPORT_DATA__ = ${JSON.stringify(payload)}; if (typeof render === 'function') render(window.__REPORT_DATA__);`
  );
  await new Promise(r => setTimeout(r, 300));

  const pdfBuffer = await win.webContents.printToPDF({ printBackground: false, pageSize: 'Letter' });
  win.destroy();

  fs.writeFileSync(outPath, pdfBuffer);
  shell.openPath(outPath);
  return outPath;
});

ipcMain.handle('carsxe:decode', async (_event: Electron.IpcMainInvokeEvent, { code }: { code: string }) => {
  const apiKey = process.env.CARSXE_API_KEY ?? '';
  if (!apiKey) return { ok: false, error: 'CARSXE_API_KEY not set' };
  try {
    const url = `https://api.carsxe.com/obdcodesdecoder?key=${apiKey}&code=${encodeURIComponent(code)}&source=claude_plugin`;
    const res  = await fetch(url);
    if (!res.ok) return { ok: false, error: `CarsXE HTTP ${res.status}` };
    const d: any = await res.json();
    const description = d.definition ?? d.description ?? d.code_description ?? '';
    const rawCauses   = d.possible_causes ?? d.causes ?? '';
    const causes: string[] = typeof rawCauses === 'string'
      ? rawCauses.split(/[;,\n]/).map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(rawCauses) ? rawCauses : [];
    const repair = d.tech_notes ?? d.tips ?? d.repair ?? '';
    return { ok: true, description, causes, repair };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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
    if (fs.existsSync(iconPath)) app.dock?.setIcon(iconPath);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  // End the session (stops polling, releases the serial port so the adapter
  // isn't locked for other apps). On macOS the app stays running and a new
  // window starts out disconnected, so nothing may keep polling behind it.
  void endSession();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
