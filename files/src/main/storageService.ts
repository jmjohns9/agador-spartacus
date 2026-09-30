import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { SessionSnapshot, DataRecording, FreezeFrame, StorageConfig, StorageInfo } from '../shared/types';

// ─── Local (JSON file) backend ────────────────────────────────────────────────

interface LocalStore {
  snapshots: SessionSnapshot[];
  recordings: DataRecording[];
  freezeFrames: FreezeFrame[];
}

const emptyStore = (): LocalStore => ({ snapshots: [], recordings: [], freezeFrames: [] });

// Write to a temp file, flush it to disk, then rename over the original. A
// crash, sleep or power loss mid-write leaves either the old file or the new
// one, never a truncated mix.
function writeFileAtomic(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// ─── SQLite backend ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
let BetterSqlite3: any = null;

function openDb(file: string): any {
  if (!BetterSqlite3) BetterSqlite3 = require('better-sqlite3');
  const db = new BetterSqlite3(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots
      (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recordings
      (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS freeze_frames
      (id TEXT PRIMARY KEY, dtc_code TEXT NOT NULL, data TEXT NOT NULL);
  `);
  return db;
}

// ─── StorageService ───────────────────────────────────────────────────────────

export class StorageService {
  private backend: 'local' | 'sqlite';
  private store: LocalStore | null = null;   // parsed storage.json, loaded once
  private db: any = null;

  constructor(
    private readonly dir: string = app.getPath('userData'),
    private readonly warn: (message: string) => void = () => {},
  ) {
    this.backend = this.readConfig().backend;
  }

  private get localPath()  { return path.join(this.dir, 'storage.json'); }
  private get sqlitePath() { return path.join(this.dir, 'storage.db'); }
  private get configPath() { return path.join(this.dir, 'storage-config.json'); }

  private getDb(): any {
    if (!this.db) this.db = openDb(this.sqlitePath);
    return this.db;
  }

  // A missing file is an empty store. A file that can't be parsed is moved
  // aside, never written over: the next save used to replace it with an
  // almost empty store and every recording and snapshot was lost.
  private readLocal(): LocalStore {
    if (this.store) return this.store;
    let text: string;
    try {
      text = fs.readFileSync(this.localPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      return (this.store = emptyStore());
    }
    try {
      const raw = JSON.parse(text);
      this.store = {
        snapshots:    Array.isArray(raw.snapshots)    ? raw.snapshots    : [],
        recordings:   Array.isArray(raw.recordings)   ? raw.recordings   : [],
        freezeFrames: Array.isArray(raw.freezeFrames) ? raw.freezeFrames : [],
      };
    } catch {
      const aside = `${this.localPath}.corrupt-${Date.now()}`;
      fs.renameSync(this.localPath, aside);
      this.warn(`storage.json could not be read and was moved to ${aside}. Saved data starts empty; the old file is kept for recovery.`);
      this.store = emptyStore();
    }
    return this.store;
  }

  private writeLocal(store: LocalStore): void {
    try {
      writeFileAtomic(this.localPath, JSON.stringify(store));
      this.store = store;
    } catch (err) {
      this.store = null;   // callers mutate the cached store; reload from disk next time
      throw err;
    }
  }

  private readConfig(): StorageConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      return { backend: raw.backend === 'sqlite' ? 'sqlite' : 'local' };
    } catch {
      return { backend: 'local' };
    }
  }

  private writeConfigFile(cfg: StorageConfig): void {
    writeFileAtomic(this.configPath, JSON.stringify(cfg, null, 2));
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  getConfig(): StorageConfig { return { backend: this.backend }; }

  setConfig(updates: Partial<StorageConfig>): void {
    if (updates.backend === 'local' || updates.backend === 'sqlite') this.backend = updates.backend;
    this.writeConfigFile({ backend: this.backend });
  }

  getInfo(): StorageInfo {
    const lp = this.localPath; const sp = this.sqlitePath;
    const counts = this.backend === 'sqlite'
      ? {
          snapshots:    this.count('snapshots'),
          recordings:   this.count('recordings'),
          freezeFrames: this.count('freeze_frames'),
        }
      : (() => {
          const st = this.readLocal();
          return { snapshots: st.snapshots.length, recordings: st.recordings.length, freezeFrames: st.freezeFrames.length };
        })();
    return {
      localPath: lp, sqlitePath: sp,
      localSizeBytes:  fs.existsSync(lp) ? fs.statSync(lp).size  : 0,
      sqliteSizeBytes: fs.existsSync(sp) ? fs.statSync(sp).size : 0,
      counts,
    };
  }

  private count(table: 'snapshots' | 'recordings' | 'freeze_frames'): number {
    return (this.getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  }

  // ── Migration ──────────────────────────────────────────────────────────────

  migrate(to: 'local' | 'sqlite'): void {
    if (to === this.backend) return;

    if (to === 'sqlite') {
      const store = this.readLocal();
      const d = this.getDb();
      // Replace, don't merge: rows left from an earlier SQLite period would
      // otherwise bring back items deleted while on the local backend.
      const txn = d.transaction(() => {
        d.exec('DELETE FROM snapshots; DELETE FROM recordings; DELETE FROM freeze_frames;');
        for (const s of store.snapshots)
          d.prepare('INSERT OR REPLACE INTO snapshots (id, data) VALUES (?, ?)').run(s.id, JSON.stringify(s));
        for (const r of store.recordings)
          d.prepare('INSERT OR REPLACE INTO recordings (id, data) VALUES (?, ?)').run(r.id, JSON.stringify(r));
        for (const f of store.freezeFrames)
          d.prepare('INSERT OR REPLACE INTO freeze_frames (id, dtc_code, data) VALUES (?, ?, ?)').run(f.id, f.dtcCode, JSON.stringify(f));
      });
      txn();
      if (fs.existsSync(this.localPath)) fs.copyFileSync(this.localPath, this.localPath + '.bak');
    } else {
      const snaps = this.getSnapshots();
      const recs  = this.getRecordings();
      const ffs   = this.getFreezeFrames();
      if (fs.existsSync(this.localPath)) fs.copyFileSync(this.localPath, this.localPath + '.bak');
      this.writeLocal({ snapshots: snaps, recordings: recs, freezeFrames: ffs });
    }

    this.backend = to;
    this.writeConfigFile({ backend: to });
  }

  // ── Snapshots ──────────────────────────────────────────────────────────────

  saveSnapshot(snap: SessionSnapshot): string {
    if (this.backend === 'sqlite') {
      this.getDb().prepare('INSERT OR REPLACE INTO snapshots (id, data) VALUES (?, ?)').run(snap.id, JSON.stringify(snap));
    } else {
      const store = this.readLocal();
      const i = store.snapshots.findIndex(s => s.id === snap.id);
      if (i >= 0) store.snapshots[i] = snap; else store.snapshots.unshift(snap);
      this.writeLocal(store);
    }
    return snap.id;
  }

  getSnapshots(): SessionSnapshot[] {
    if (this.backend === 'sqlite') {
      return (this.getDb().prepare('SELECT data FROM snapshots ORDER BY rowid DESC').all() as { data: string }[])
        .map(r => JSON.parse(r.data) as SessionSnapshot);
    }
    return this.readLocal().snapshots;
  }

  deleteSnapshot(id: string): void {
    if (this.backend === 'sqlite') {
      this.getDb().prepare('DELETE FROM snapshots WHERE id = ?').run(id);
    } else {
      const store = this.readLocal();
      store.snapshots = store.snapshots.filter(s => s.id !== id);
      this.writeLocal(store);
    }
  }

  // ── Recordings ─────────────────────────────────────────────────────────────

  saveRecording(rec: DataRecording): string {
    if (this.backend === 'sqlite') {
      this.getDb().prepare('INSERT OR REPLACE INTO recordings (id, data) VALUES (?, ?)').run(rec.id, JSON.stringify(rec));
    } else {
      const store = this.readLocal();
      const i = store.recordings.findIndex(r => r.id === rec.id);
      if (i >= 0) store.recordings[i] = rec; else store.recordings.unshift(rec);
      this.writeLocal(store);
    }
    return rec.id;
  }

  getRecordings(): DataRecording[] {
    if (this.backend === 'sqlite') {
      return (this.getDb().prepare('SELECT data FROM recordings ORDER BY rowid DESC').all() as { data: string }[])
        .map(r => JSON.parse(r.data) as DataRecording);
    }
    return this.readLocal().recordings;
  }

  deleteRecording(id: string): void {
    if (this.backend === 'sqlite') {
      this.getDb().prepare('DELETE FROM recordings WHERE id = ?').run(id);
    } else {
      const store = this.readLocal();
      store.recordings = store.recordings.filter(r => r.id !== id);
      this.writeLocal(store);
    }
  }

  // ── Freeze frames ──────────────────────────────────────────────────────────

  // The first capture for a code is kept: it is the one closest to when the
  // fault appeared. A later save returns the stored frame's id.
  saveFreezeFrame(ff: FreezeFrame): string {
    if (this.backend === 'sqlite') {
      const existing = (this.getDb().prepare(
        'SELECT id FROM freeze_frames WHERE dtc_code = ?'
      ).get(ff.dtcCode) as { id: string } | undefined);
      if (existing) return existing.id;
      this.getDb().prepare('INSERT INTO freeze_frames (id, dtc_code, data) VALUES (?, ?, ?)').run(ff.id, ff.dtcCode, JSON.stringify(ff));
      return ff.id;
    }
    const store = this.readLocal();
    const existing = store.freezeFrames.find(f => f.dtcCode === ff.dtcCode);
    if (existing) return existing.id;
    store.freezeFrames.unshift(ff);
    this.writeLocal(store);
    return ff.id;
  }

  getFreezeFrames(dtcCode?: string): FreezeFrame[] {
    if (this.backend === 'sqlite') {
      const d = this.getDb();
      const rows = dtcCode
        ? (d.prepare('SELECT data FROM freeze_frames WHERE dtc_code = ?').all(dtcCode) as { data: string }[])
        : (d.prepare('SELECT data FROM freeze_frames ORDER BY rowid DESC').all() as { data: string }[]);
      return rows.map(r => JSON.parse(r.data) as FreezeFrame);
    }
    const all = this.readLocal().freezeFrames;
    return dtcCode ? all.filter(f => f.dtcCode === dtcCode) : all;
  }

  deleteFreezeFrame(id: string): void {
    if (this.backend === 'sqlite') {
      this.getDb().prepare('DELETE FROM freeze_frames WHERE id = ?').run(id);
    } else {
      const store = this.readLocal();
      store.freezeFrames = store.freezeFrames.filter(f => f.id !== id);
      this.writeLocal(store);
    }
  }
}
