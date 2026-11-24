/**
 * RoundingOS — on-device database (IndexedDB through Dexie, vendor/dexie/).
 *
 * The only code that reads or writes saved app data. app.js keeps its in-memory `state`
 * and calls Store.save(state); Store works out which records changed and writes only those.
 *
 * Database `roundingos`, Dexie version 1:
 *   meta        key                      schema version, migration status
 *   patients    id, purgeAfter           one row per patient; the record lives in `payload`
 *   settings    key ('app')              everything in state except patients, plus patientOrder
 *   snapshots   ++id, createdAt, reason  full copies of state (before import, clear, migration, daily)
 *   tombstones  id, deletedAt            ids of deleted patients, so a merge import keeps them deleted
 *
 * NOT ENCRYPTED YET. Every record goes through encodeRecord()/decodeRecord(), and the payload
 * carries its own format tag ({ fmt: 'plain', json }). Phase 4 adds { fmt: 'aes-gcm', iv, ct }
 * in those two functions only: same tables and indexes, so no Dexie schema change is needed,
 * and old 'plain' rows are re-encrypted on first unlock. Encoding happens before a transaction
 * opens, because IndexedDB transactions close if they wait on WebCrypto.
 */
const Store = (() => {
  const SCHEMA_VERSION = 1;
  const LEGACY_KEY = 'roundingos_hospitalist_v1';
  const LEGACY_PRE_IMPORT_KEY = 'roundingos_pre_import_snapshot';
  const MAX_SNAPSHOTS = 7;
  const TOMBSTONE_KEEP_DAYS = 90;
  const DAY_MS = 24 * 60 * 60 * 1000;

  let db = null;
  // What the database holds right now, so save() can skip unchanged records.
  let written = new Map(); // patient id -> { content, updatedAt }
  let settingsJson = null;
  let hasMeta = false;
  let queue = Promise.resolve();

  /* ---------- record codec (phase 4 encrypts here) ---------- */
  async function encodeRecord(json) {
    return { fmt: 'plain', json };
  }

  async function decodeRecord(payload) {
    if (payload && payload.fmt === 'plain') return JSON.parse(payload.json);
    throw new Error(`Unknown record format: ${payload && payload.fmt}`);
  }

  /* ---------- helpers ---------- */
  /** Patient JSON without updatedAt: used to tell a real edit from a timestamp-only change. */
  function contentOf(p) {
    return JSON.stringify({ ...p, updatedAt: undefined });
  }

  function splitState(state) {
    const patients = state.patients || [];
    // patients: null keeps the key's place, so a load gives back the same object shape
    return { patients, settings: { ...state, patients: null, patientOrder: patients.map(p => p.id) } };
  }

  function joinState(settings, patients) {
    const { patientOrder, ...rest } = settings || {};
    const byId = new Map(patients.map(p => [p.id, p]));
    const ordered = [];
    (patientOrder || []).forEach(id => {
      if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
    });
    byId.forEach(p => ordered.push(p));
    return { ...rest, patients: ordered };
  }

  function requireDb() {
    if (!db) throw new Error('Database is not open');
    return db;
  }

  function resetCache() {
    written = new Map();
    settingsJson = null;
    hasMeta = false;
  }

  /* ---------- open / close ---------- */
  async function open(name = 'roundingos') {
    if (typeof Dexie === 'undefined') throw new Error('Dexie did not load');
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
    close();
    const d = new Dexie(name);
    d.version(1).stores({
      meta: 'key',
      patients: 'id, purgeAfter',
      settings: 'key',
      snapshots: '++id, createdAt, reason',
      tombstones: 'id, deletedAt'
    });
    await d.open();
    db = d;
    return true;
  }

  function close() {
    if (db) { db.close(); db = null; }
    resetCache();
    queue = Promise.resolve();
  }

  function isOpen() { return Boolean(db); }

  /* ---------- load ---------- */
  /** Reads every row. Returns { state, meta } or null on an empty database. */
  async function readAll() {
    const d = requireDb();
    const meta = await d.meta.get('schema');
    if (!meta) return null;
    const [settingsRow, rows] = await Promise.all([d.settings.get('app'), d.patients.toArray()]);
    const patients = [];
    for (const row of rows) patients.push(await decodeRecord(row.payload));
    const settings = settingsRow ? await decodeRecord(settingsRow.payload) : {};
    return { meta, settings, patients, state: joinState(settings, patients) };
  }

  /** Full state as the app keeps it, or null when nothing is saved yet (or a migration did not finish). */
  async function load() {
    const all = await readAll();
    resetCache();
    if (!all || all.meta.migration === 'pending') return null;
    all.patients.forEach(p => written.set(p.id, { content: contentOf(p), updatedAt: p.updatedAt || null }));
    settingsJson = JSON.stringify(all.settings);
    hasMeta = true;
    pruneTombstones().catch(() => {});
    return all.state;
  }

  /* ---------- save ---------- */
  /**
   * Writes only what changed since the last load/save. Calls are queued, never interleaved.
   * options.keepTimestamps: write changed records without setting updatedAt (used right after
   * load, when the app only fills in missing fields and nobody edited anything).
   */
  function save(state, options = {}) {
    const job = queue.then(() => doSave(state, options));
    queue = job.catch(() => {});
    return job;
  }

  async function doSave(state, options) {
    const d = requireDb();
    const now = new Date().toISOString();
    const { patients, settings } = splitState(state);
    const puts = [];
    const nextWritten = new Map();
    const seen = new Set();

    for (const p of patients) {
      if (!p || !p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      const prev = written.get(p.id);
      const content = contentOf(p);
      const changed = !prev || prev.content !== content;
      // Only one code path in app.js updates updatedAt, so it is set here for every real edit.
      // An updatedAt that differs from what was written (set by the app or by a merge) is kept.
      if (changed && !options.keepTimestamps && (!p.updatedAt || (prev && p.updatedAt === prev.updatedAt))) p.updatedAt = now;
      const updatedAt = p.updatedAt || null;
      nextWritten.set(p.id, { content, updatedAt });
      if (!changed && prev.updatedAt === updatedAt) continue;
      const row = { id: p.id, payload: await encodeRecord(JSON.stringify(p)) };
      if (p.purgeAfter) row.purgeAfter = p.purgeAfter;
      puts.push({ row, isNew: !prev });
    }

    const deleted = [...written.keys()].filter(id => !seen.has(id));
    const sJson = JSON.stringify(settings);
    const settingsRow = sJson !== settingsJson ? { key: 'app', payload: await encodeRecord(sJson) } : null;
    const needMeta = !hasMeta;

    if (!puts.length && !deleted.length && !settingsRow && !needMeta) {
      return { patientsWritten: 0, patientsDeleted: 0, settingsWritten: false, changed: false };
    }

    await d.transaction('rw', d.meta, d.patients, d.settings, d.tombstones, async () => {
      if (needMeta) await d.meta.put({ key: 'schema', version: SCHEMA_VERSION, createdAt: now });
      if (puts.length) await d.patients.bulkPut(puts.map(x => x.row));
      const readded = puts.filter(x => x.isNew).map(x => x.row.id);
      if (readded.length) await d.tombstones.bulkDelete(readded);
      if (deleted.length) {
        await d.patients.bulkDelete(deleted);
        await d.tombstones.bulkPut(deleted.map(id => ({ id, deletedAt: now })));
      }
      if (settingsRow) await d.settings.put(settingsRow);
    });

    written = nextWritten;
    if (settingsRow) settingsJson = sJson;
    hasMeta = true;
    return { patientsWritten: puts.length, patientsDeleted: deleted.length, settingsWritten: Boolean(settingsRow), changed: true };
  }

  /* ---------- snapshots ---------- */
  /** Full copy of state. Serializes right away, so later edits to state don't leak in. */
  async function snapshot(reason, state) {
    const json = JSON.stringify(state);
    const d = requireDb();
    const row = { createdAt: new Date().toISOString(), reason: String(reason || 'manual'), payload: await encodeRecord(json) };
    const id = await d.snapshots.add(row);
    const all = await d.snapshots.orderBy('id').primaryKeys();
    if (all.length > MAX_SNAPSHOTS) await d.snapshots.bulkDelete(all.slice(0, all.length - MAX_SNAPSHOTS));
    return id;
  }

  /** Readable list (no patient data): [{ id, createdAt, reason }], newest first. */
  async function listSnapshots() {
    const rows = await requireDb().snapshots.orderBy('id').reverse().toArray();
    return rows.map(r => ({ id: r.id, createdAt: r.createdAt, reason: r.reason }));
  }

  /** Returns the saved state. The caller puts it into `state` and saves as usual. */
  async function restoreSnapshot(id) {
    const row = await requireDb().snapshots.get(id);
    if (!row) throw new Error('Snapshot not found');
    return decodeRecord(row.payload);
  }

  /** One snapshot a day, taken at startup. */
  async function ensureDailySnapshot(state) {
    const rows = await requireDb().snapshots.where('reason').equals('daily').toArray();
    const latest = rows.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), '');
    if (latest && Date.now() - Date.parse(latest) < DAY_MS) return null;
    return snapshot('daily', state);
  }

  /* ---------- tombstones ---------- */
  async function getTombstones() {
    return requireDb().tombstones.toArray();
  }

  async function pruneTombstones() {
    const cutoff = new Date(Date.now() - TOMBSTONE_KEEP_DAYS * DAY_MS).toISOString();
    return requireDb().tombstones.where('deletedAt').below(cutoff).delete();
  }

  /* ---------- one-time migration from localStorage ---------- */
  async function clearData() {
    const d = requireDb();
    await d.transaction('rw', d.meta, d.patients, d.settings, async () => {
      await d.meta.clear();
      await d.patients.clear();
      await d.settings.clear();
    });
    resetCache();
  }

  /**
   * Copies the old localStorage save into the database, re-reads it, and only after the
   * re-read matches deletes the old keys. On any failure localStorage is left as it was.
   * Returns { migrated: false } when there is nothing to migrate, else { migrated: true, count }.
   * `options.afterWrite` is a test hook that runs between the write and the check.
   */
  async function migrateFromLocalStorage(options = {}) {
    let raw = null;
    let preRaw = null;
    try {
      raw = localStorage.getItem(LEGACY_KEY);
      preRaw = localStorage.getItem(LEGACY_PRE_IMPORT_KEY);
    } catch (e) { return { migrated: false }; }
    if (!raw) return { migrated: false };

    const legacy = JSON.parse(raw);
    if (!legacy || !Array.isArray(legacy.patients)) throw new Error('Old saved data is not a RoundingOS save');
    const d = requireDb();
    const now = new Date().toISOString();
    const { patients, settings } = splitState(legacy);
    const rows = [];
    for (const p of patients) {
      const row = { id: p.id, payload: await encodeRecord(JSON.stringify(p)) };
      if (p.purgeAfter) row.purgeAfter = p.purgeAfter;
      rows.push(row);
    }
    const settingsRow = { key: 'app', payload: await encodeRecord(JSON.stringify(settings)) };

    try {
      // 'pending' until verified: a crash in between makes the next start redo the migration
      await d.transaction('rw', d.meta, d.patients, d.settings, async () => {
        await d.meta.clear();
        await d.patients.clear();
        await d.settings.clear();
        await d.meta.put({ key: 'schema', version: SCHEMA_VERSION, createdAt: now, migratedFrom: 'localStorage', migration: 'pending' });
        await d.patients.bulkPut(rows);
        await d.settings.put(settingsRow);
      });
      if (options.afterWrite) await options.afterWrite(d);

      const back = await readAll();
      const want = patients.map(p => JSON.stringify(p));
      const got = back ? back.state.patients.map(p => JSON.stringify(p)) : [];
      if (got.length !== want.length || got.some((j, i) => j !== want[i])) {
        throw new Error(`Check after copying failed (${got.length} of ${want.length} patients read back)`);
      }

      await snapshot('before migration', legacy);
      if (preRaw) {
        try { await snapshot('before import (old storage)', JSON.parse(preRaw)); } catch (e) { /* unreadable: dropped */ }
      }
      await d.meta.update('schema', { migration: 'done' });
    } catch (err) {
      try { await clearData(); } catch (e) { /* keep the original error */ }
      throw err;
    }

    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_PRE_IMPORT_KEY);
    return { migrated: true, count: patients.length };
  }

  return {
    open,
    close,
    isOpen,
    load,
    save,
    snapshot,
    listSnapshots,
    restoreSnapshot,
    ensureDailySnapshot,
    getTombstones,
    migrateFromLocalStorage,
    LEGACY_KEY,
    LEGACY_PRE_IMPORT_KEY
  };
})();
