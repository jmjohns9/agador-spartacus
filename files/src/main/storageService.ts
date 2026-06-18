import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SessionSnapshot, DataRecording, FreezeFrame, StorageConfig, StorageInfo } from '../shared/types';

// ─── File paths ───────────────────────────────────────────────────────────────

const localPath  = () => path.join(app.getPath('userData'), 'storage.json');
const sqlitePath = () => path.join(app.getPath('userData'), 'storage.db');
const configPath = () => path.join(app.getPath('userData'), 'storage-config.json');

// ─── Local (JSON file) backend ────────────────────────────────────────────────

interface LocalStore {
  snapshots: SessionSnapshot[];
  recordings: DataRecording[];
  freezeFrames: FreezeFrame[];
}

function readLocal(): LocalStore {
  try {
    const raw = JSON.parse(fs.readFileSync(localPath(), 'utf-8'));
    return {
      snapshots:    Array.isArray(raw.snapshots)    ? raw.snapshots    : [],
      recordings:   Array.isArray(raw.recordings)   ? raw.recordings   : [],
      freezeFrames: Array.isArray(raw.freezeFrames) ? raw.freezeFrames : [],
    };
  } catch {
    return { snapshots: [], recordings: [], freezeFrames: [] };
  }
}

function writeLocal(store: LocalStore): void {
  fs.writeFileSync(localPath(), JSON.stringify(store, null, 2), 'utf-8');
}

// ─── SQLite backend ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
let BetterSqlite3: any = null;
let _db: any = null;

function getDb(): any {
  if (!_db) {
    if (!BetterSqlite3) BetterSqlite3 = require('better-sqlite3');
    _db = new BetterSqlite3(sqlitePath());
    _db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots
        (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recordings
        (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS freeze_frames
        (id TEXT PRIMARY KEY, dtc_code TEXT NOT NULL, data TEXT NOT NULL);
    `);
  }
  return _db;
}

// ─── Config ───────────────────────────────────────────────────────────────────

function readConfig(): StorageConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(), 'utf-8'));
    return { backend: raw.backend === 'sqlite' ? 'sqlite' : 'local' };
  } catch {
    return { backend: 'local' };
  }
}

function writeConfigFile(cfg: StorageConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

// ─── StorageService ───────────────────────────────────────────────────────────

export class StorageService {
  private backend: 'local' | 'sqlite';

  constructor() {
    this.backend = readConfig().backend;
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  getConfig(): StorageConfig { return { backend: this.backend }; }

  setConfig(updates: Partial<StorageConfig>): void {
    if (updates.backend) this.backend = updates.backend;
    writeConfigFile({ backend: this.backend });
  }

  getInfo(): StorageInfo {
    const lp = localPath(); const sp = sqlitePath();
    return {
      localPath: lp, sqlitePath: sp,
      localSizeBytes:  fs.existsSync(lp) ? fs.statSync(lp).size  : 0,
      sqliteSizeBytes: fs.existsSync(sp) ? fs.statSync(sp).size : 0,
      counts: {
        snapshots:    this.getSnapshots().length,
        recordings:   this.getRecordings().length,
        freezeFrames: this.getFreezeFrames().length,
      },
    };
  }

  // ── Migration ──────────────────────────────────────────────────────────────

  migrate(to: 'local' | 'sqlite'): void {
    if (to === this.backend) return;

    if (to === 'sqlite') {
      const store = readLocal();
      const d = getDb();
      const txn = d.transaction(() => {
        for (const s of store.snapshots)
          d.prepare('INSERT OR REPLACE INTO snapshots (id, data) VALUES (?, ?)').run(s.id, JSON.stringify(s));
        for (const r of store.recordings)
          d.prepare('INSERT OR REPLACE INTO recordings (id, data) VALUES (?, ?)').run(r.id, JSON.stringify(r));
        for (const f of store.freezeFrames)
          d.prepare('INSERT OR REPLACE INTO freeze_frames (id, dtc_code, data) VALUES (?, ?, ?)').run(f.id, f.dtcCode, JSON.stringify(f));
      });
      txn();
      if (fs.existsSync(localPath())) fs.copyFileSync(localPath(), localPath() + '.bak');
    } else {
      const snaps = this.getSnapshots();
      const recs  = this.getRecordings();
      const ffs   = this.getFreezeFrames();
      if (fs.existsSync(localPath())) fs.copyFileSync(localPath(), localPath() + '.bak');
      writeLocal({ snapshots: snaps, recordings: recs, freezeFrames: ffs });
    }

    this.backend = to;
    writeConfigFile({ backend: to });
  }

  // ── Snapshots ──────────────────────────────────────────────────────────────

  saveSnapshot(snap: SessionSnapshot): string {
    if (this.backend === 'sqlite') {
      getDb().prepare('INSERT OR REPLACE INTO snapshots (id, data) VALUES (?, ?)').run(snap.id, JSON.stringify(snap));
    } else {
      const store = readLocal();
      const i = store.snapshots.findIndex(s => s.id === snap.id);
      if (i >= 0) store.snapshots[i] = snap; else store.snapshots.unshift(snap);
      writeLocal(store);
    }
    return snap.id;
  }

  getSnapshots(): SessionSnapshot[] {
    if (this.backend === 'sqlite') {
      return (getDb().prepare('SELECT data FROM snapshots ORDER BY rowid DESC').all() as { data: string }[])
        .map(r => JSON.parse(r.data) as SessionSnapshot);
    }
    return readLocal().snapshots;
  }

  deleteSnapshot(id: string): void {
    if (this.backend === 'sqlite') {
      getDb().prepare('DELETE FROM snapshots WHERE id = ?').run(id);
    } else {
      const store = readLocal();
      store.snapshots = store.snapshots.filter(s => s.id !== id);
      writeLocal(store);
    }
  }

  // ── Recordings ─────────────────────────────────────────────────────────────

  saveRecording(rec: DataRecording): string {
    if (this.backend === 'sqlite') {
      getDb().prepare('INSERT OR REPLACE INTO recordings (id, data) VALUES (?, ?)').run(rec.id, JSON.stringify(rec));
    } else {
      const store = readLocal();
      const i = store.recordings.findIndex(r => r.id === rec.id);
      if (i >= 0) store.recordings[i] = rec; else store.recordings.unshift(rec);
      writeLocal(store);
    }
    return rec.id;
  }

  getRecordings(): DataRecording[] {
    if (this.backend === 'sqlite') {
      return (getDb().prepare('SELECT data FROM recordings ORDER BY rowid DESC').all() as { data: string }[])
        .map(r => JSON.parse(r.data) as DataRecording);
    }
    return readLocal().recordings;
  }

  deleteRecording(id: string): void {
    if (this.backend === 'sqlite') {
      getDb().prepare('DELETE FROM recordings WHERE id = ?').run(id);
    } else {
      const store = readLocal();
      store.recordings = store.recordings.filter(r => r.id !== id);
      writeLocal(store);
    }
  }

  // ── Freeze frames ──────────────────────────────────────────────────────────

  saveFreezeFrame(ff: FreezeFrame): string {
    if (this.backend === 'sqlite') {
      const existing = (getDb().prepare(
        'SELECT id FROM freeze_frames WHERE dtc_code = ?'
      ).get(ff.dtcCode) as { id: string } | undefined);
      const id = existing ? existing.id : ff.id;
      getDb().prepare('INSERT OR REPLACE INTO freeze_frames (id, dtc_code, data) VALUES (?, ?, ?)').run(id, ff.dtcCode, JSON.stringify({ ...ff, id }));
      return id;
    } else {
      const store = readLocal();
      const i = store.freezeFrames.findIndex(f => f.dtcCode === ff.dtcCode);
      if (i >= 0) store.freezeFrames[i] = ff; else store.freezeFrames.unshift(ff);
      writeLocal(store);
      return ff.id;
    }
  }

  getFreezeFrames(dtcCode?: string): FreezeFrame[] {
    if (this.backend === 'sqlite') {
      const d = getDb();
      const rows = dtcCode
        ? (d.prepare('SELECT data FROM freeze_frames WHERE dtc_code = ?').all(dtcCode) as { data: string }[])
        : (d.prepare('SELECT data FROM freeze_frames ORDER BY rowid DESC').all() as { data: string }[]);
      return rows.map(r => JSON.parse(r.data) as FreezeFrame);
    }
    const all = readLocal().freezeFrames;
    return dtcCode ? all.filter(f => f.dtcCode === dtcCode) : all;
  }

  deleteFreezeFrame(id: string): void {
    if (this.backend === 'sqlite') {
      getDb().prepare('DELETE FROM freeze_frames WHERE id = ?').run(id);
    } else {
      const store = readLocal();
      store.freezeFrames = store.freezeFrames.filter(f => f.id !== id);
      writeLocal(store);
    }
  }
}
