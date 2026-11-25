/**
 * RoundingOS — on-device database (IndexedDB through Dexie, vendor/dexie/).
 *
 * The only code that reads or writes saved app data. app.js keeps its in-memory `state`
 * and calls Store.save(state); Store works out which records changed and writes only those.
 *
 * Database `roundingos`, Dexie version 1:
 *   meta        key                      'schema': version, migration status
 *                                        'crypto': codec and the wrapped data key (never the key itself)
 *   patients    id, purgeAfter           one row per patient; the record lives in `payload`
 *   settings    key ('app')              everything in state except patients, plus patientOrder
 *   snapshots   ++id, createdAt, reason  full copies of state (before import, clear, restore, migration, daily);
 *                                        rows also keep patientCount (a number, no patient data) for the list
 *   tombstones  id, deletedAt            ids of deleted patients, so a merge import keeps them deleted
 *
 * Encryption (phase 4): every record goes through encodeRecord()/decodeRecord(), and the
 * payload carries its own format tag. Once setup() has run, payloads are
 * { fmt: 'aes-gcm-1', iv, ct } (AES-256-GCM with the data key, see KeyCrypto in crypto.js), and
 * the row's table and id are bound in as additional data, so rows cannot be swapped. Only ids,
 * timestamps, counts and the purge date stay readable. Before setup (phase-3 databases, unit
 * tests) payloads are { fmt: 'plain', json }; setup() seals them all in one transaction, and
 * after that writing a plain row is refused. Encoding happens before a transaction opens,
 * because IndexedDB transactions close if they wait on WebCrypto.
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
  let cryptoMeta = null; // meta row 'crypto' once encryption is set up
  let dataKey = null;    // non-extractable CryptoKey, only while unlocked

  /* ---------- record codec ---------- */
  const AAD_SETTINGS = 'settings:app';
  const AAD_SNAPSHOT = 'snapshot';
  const aadPatient = id => `patient:${id}`;

  class LockedError extends Error {
    constructor() { super('RoundingOS is locked'); this.name = 'LockedError'; }
  }

  async function encodeRecord(json, aad) {
    if (dataKey) return KeyCrypto.encryptRecord(dataKey, json, aad);
    if (cryptoMeta) throw new LockedError(); // never write plain rows once encrypted
    return { fmt: 'plain', json };
  }

  async function decodeRecord(payload, aad) {
    if (payload && payload.fmt === 'plain') return JSON.parse(payload.json);
    if (payload && payload.fmt === KeyCrypto.CODEC) {
      if (!dataKey) throw new LockedError();
      return JSON.parse(await KeyCrypto.decryptRecord(dataKey, payload, aad));
    }
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
    cryptoMeta = (await d.meta.get('crypto')) || null;
    return true;
  }

  function close() {
    if (db) { db.close(); db = null; }
    resetCache();
    queue = Promise.resolve();
    cryptoMeta = null;
    dataKey = null;
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
    for (const row of rows) patients.push(await decodeRecord(row.payload, aadPatient(row.id)));
    const settings = settingsRow ? await decodeRecord(settingsRow.payload, AAD_SETTINGS) : {};
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
      const row = { id: p.id, payload: await encodeRecord(JSON.stringify(p), aadPatient(p.id)) };
      if (p.purgeAfter) row.purgeAfter = p.purgeAfter;
      puts.push({ row, isNew: !prev });
    }

    const deleted = [...written.keys()].filter(id => !seen.has(id));
    const sJson = JSON.stringify(settings);
    const settingsRow = sJson !== settingsJson ? { key: 'app', payload: await encodeRecord(sJson, AAD_SETTINGS) } : null;
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
    const patientCount = Array.isArray(state && state.patients) ? state.patients.length : 0;
    const row = { createdAt: new Date().toISOString(), reason: String(reason || 'manual'), patientCount, payload: await encodeRecord(json, AAD_SNAPSHOT) };
    const id = await d.snapshots.add(row);
    const all = await d.snapshots.orderBy('id').primaryKeys();
    if (all.length > MAX_SNAPSHOTS) await d.snapshots.bulkDelete(all.slice(0, all.length - MAX_SNAPSHOTS));
    return id;
  }

  /** Readable list (no patient data): [{ id, createdAt, reason, patientCount }], newest first. */
  async function listSnapshots() {
    const rows = await requireDb().snapshots.orderBy('id').reverse().toArray();
    const out = [];
    for (const r of rows) {
      let patientCount = r.patientCount;
      if (typeof patientCount !== 'number') {
        // copies made before patientCount was stored
        try { patientCount = ((await decodeRecord(r.payload, AAD_SNAPSHOT)).patients || []).length; } catch (e) { patientCount = null; }
      }
      out.push({ id: r.id, createdAt: r.createdAt, reason: r.reason, patientCount });
    }
    return out;
  }

  async function deleteSnapshot(id) {
    return requireDb().snapshots.delete(id);
  }

  /**
   * Removes these patients from every saved copy, so a patient deleted for good does not come
   * back through a restore. Returns how many copies changed. Decodes and re-encodes outside the
   * transaction (phase 4's WebCrypto would close it).
   */
  async function scrubSnapshots(patientIds) {
    const ids = new Set(patientIds || []);
    if (!ids.size) return 0;
    const d = requireDb();
    const rows = await d.snapshots.toArray();
    const puts = [];
    for (const r of rows) {
      let saved;
      try { saved = await decodeRecord(r.payload, AAD_SNAPSHOT); } catch (e) { continue; }
      const before = (saved.patients || []).length;
      saved.patients = (saved.patients || []).filter(p => !ids.has(p && p.id));
      if (saved.patients.length === before) continue;
      if (saved.selectedPatientId && ids.has(saved.selectedPatientId)) saved.selectedPatientId = null;
      puts.push({ ...r, patientCount: saved.patients.length, payload: await encodeRecord(JSON.stringify(saved), AAD_SNAPSHOT) });
    }
    if (puts.length) await d.snapshots.bulkPut(puts);
    return puts.length;
  }

  /** Returns the saved state. The caller puts it into `state` and saves as usual. */
  async function restoreSnapshot(id) {
    const row = await requireDb().snapshots.get(id);
    if (!row) throw new Error('Snapshot not found');
    return decodeRecord(row.payload, AAD_SNAPSHOT);
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
      await d.meta.delete('schema');
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
      const row = { id: p.id, payload: await encodeRecord(JSON.stringify(p), aadPatient(p.id)) };
      if (p.purgeAfter) row.purgeAfter = p.purgeAfter;
      rows.push(row);
    }
    const settingsRow = { key: 'app', payload: await encodeRecord(JSON.stringify(settings), AAD_SETTINGS) };

    try {
      // 'pending' until verified: a crash in between makes the next start redo the migration
      await d.transaction('rw', d.meta, d.patients, d.settings, async () => {
        await d.meta.delete('schema');
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

  /* ---------- encryption: setup, unlock, lock, seal (phase 4) ---------- */
  /** { encrypted, unlocked, hasRecovery }. Before setup(): encrypted false, and rows are plain. */
  function status() {
    requireDb();
    return {
      encrypted: Boolean(cryptoMeta),
      unlocked: Boolean(dataKey),
      hasRecovery: Boolean(cryptoMeta && cryptoMeta.recovery)
    };
  }

  /** Every row of the three record tables, read outside any transaction. */
  async function readRecordRows(d) {
    const [patients, settings, snapshots] = await Promise.all([d.patients.toArray(), d.settings.toArray(), d.snapshots.toArray()]);
    return { patients, settings, snapshots };
  }

  const aadFor = (table, row) => (table === 'patients' ? aadPatient(row.id) : table === 'settings' ? AAD_SETTINGS : AAD_SNAPSHOT);
  const keyOf = (table, row) => (table === 'settings' ? row.key : row.id);
  const TABLES = ['patients', 'settings', 'snapshots'];

  /**
   * Encrypts every plain row with `key` in one transaction (all or nothing), then re-reads and
   * decrypts each one to check it. `newMeta` (setup only) is written in the same transaction, so
   * the database is never half encrypted or marked encrypted without being so. On a failed check
   * the original rows are put back and the error is thrown.
   * options.afterWrite: test hook, runs between the write and the check.
   */
  async function sealRows(key, newMeta, options = {}) {
    const d = requireDb();
    const before = await readRecordRows(d);
    const sealed = { patients: [], settings: [], snapshots: [] };
    const originals = { patients: [], settings: [], snapshots: [] };
    for (const t of TABLES) {
      for (const row of before[t]) {
        if (!row.payload || row.payload.fmt !== 'plain') continue;
        const payload = await KeyCrypto.encryptRecord(key, row.payload.json, aadFor(t, row));
        // check the ciphertext before anything is written
        if (await KeyCrypto.decryptRecord(key, payload, aadFor(t, row)) !== row.payload.json) throw new Error('Encryption check failed');
        sealed[t].push({ ...row, payload });
        originals[t].push(row);
      }
    }
    const count = TABLES.reduce((n, t) => n + sealed[t].length, 0);
    if (!count && !newMeta) return { sealed: 0 };

    await d.transaction('rw', d.meta, d.patients, d.settings, d.snapshots, async () => {
      // a save that landed after the read above would be lost: give up instead (the caller retries)
      for (const t of TABLES) {
        const now = (await d.table(t).toCollection().primaryKeys()).map(String).sort().join('|');
        if (now !== before[t].map(r => String(keyOf(t, r))).sort().join('|')) throw new Error('Data changed while encrypting; try again');
      }
      for (const t of TABLES) if (sealed[t].length) await d.table(t).bulkPut(sealed[t]);
      if (newMeta) await d.meta.put(newMeta);
    });

    try {
      if (options.afterWrite) await options.afterWrite(d);
      const after = await readRecordRows(d);
      for (const t of TABLES) {
        const byKey = new Map(after[t].map(r => [keyOf(t, r), r]));
        for (const orig of originals[t]) {
          const got = byKey.get(keyOf(t, orig));
          if (!got || !got.payload || got.payload.fmt !== KeyCrypto.CODEC) throw new Error(`Check after encrypting failed (${t})`);
          if (await KeyCrypto.decryptRecord(key, got.payload, aadFor(t, got)) !== orig.payload.json) throw new Error(`Check after encrypting failed (${t})`);
        }
        if (after[t].length !== before[t].length) throw new Error(`Check after encrypting failed (${t} count)`);
      }
    } catch (err) {
      try {
        await d.transaction('rw', d.meta, d.patients, d.settings, d.snapshots, async () => {
          for (const t of TABLES) if (originals[t].length) await d.table(t).bulkPut(originals[t]);
          if (newMeta) await d.meta.delete('crypto');
        });
      } catch (e) { /* keep the original error */ }
      throw err;
    }
    return { sealed: count };
  }

  /**
   * First-time setup: makes the data key, locks it with the passphrase (and with the recovery
   * words when given; pass null to set up without them), and encrypts every existing row.
   * On failure nothing changes and the database stays as it was.
   */
  async function setup(passphrase, recoveryWords, options = {}) {
    const d = requireDb();
    if (cryptoMeta || await d.meta.get('crypto')) throw new Error('Encryption is already set up');
    if (!passphrase) throw new Error('A passphrase is needed');
    const { raw, key } = await KeyCrypto.generateDataKey();
    let meta;
    try {
      meta = { key: 'crypto', codec: KeyCrypto.CODEC, version: 1, createdAt: new Date().toISOString(), pass: await KeyCrypto.wrapWithPassphrase(raw, passphrase) };
      if (recoveryWords) meta.recovery = await KeyCrypto.wrapWithRecovery(raw, await RecoveryWords.toEntropy(recoveryWords));
    } finally { raw.fill(0); }
    const job = queue.then(() => sealRows(key, meta, options));
    queue = job.catch(() => {});
    const result = await job;
    cryptoMeta = meta;
    dataKey = key;
    resetCache(); // the next load() reads the sealed rows
    return result;
  }

  async function finishUnlock(key) {
    dataKey = key;
    resetCache();
    // a plain row that missed the first pass (or came from an older tab) is sealed now
    const job = queue.then(() => sealRows(key, null));
    queue = job.catch(() => {});
    try { await job; } catch (e) { /* retried on the next unlock; plain rows still read */ }
  }

  async function freshMeta() {
    const m = await requireDb().meta.get('crypto');
    if (!m) throw new Error('Encryption is not set up');
    cryptoMeta = m;
    return m;
  }

  /** Throws 'Wrong passphrase' when it does not open the data key. */
  async function unlock(passphrase) {
    const m = await freshMeta();
    let key;
    try { key = await KeyCrypto.unwrapWithPassphrase(m.pass, passphrase); } catch (e) { throw new Error('Wrong passphrase'); }
    await finishUnlock(key);
    return true;
  }

  /** Recovery words open the data key, and newPassphrase replaces the forgotten one. */
  async function unlockWithRecovery(words, newPassphrase) {
    const m = await freshMeta();
    if (!m.recovery) throw new Error('This device was set up without recovery words');
    if (!newPassphrase) throw new Error('Choose a new passphrase');
    const entropy = await RecoveryWords.toEntropy(words); // readable errors for typos
    let res;
    try { res = await KeyCrypto.recoverAndRewrap(m.recovery, entropy, newPassphrase); } catch (e) { throw new Error('These recovery words do not belong to this device'); }
    finally { entropy.fill(0); }
    const next = { ...m, pass: res.passSlot, passChangedAt: new Date().toISOString() };
    await requireDb().meta.put(next);
    cryptoMeta = next;
    await finishUnlock(res.key);
    return true;
  }

  /** Replaces the passphrase (the data key and records stay the same). */
  async function changePassphrase(oldPassphrase, newPassphrase) {
    const m = await freshMeta();
    let res;
    try { res = await KeyCrypto.changePassphrase(m.pass, oldPassphrase, newPassphrase); } catch (e) { throw new Error('Wrong passphrase'); }
    const next = { ...m, pass: res.passSlot, passChangedAt: new Date().toISOString() };
    await requireDb().meta.put(next);
    cryptoMeta = next;
    dataKey = res.key;
    return true;
  }

  /** Waits for queued writes, then forgets the key and every cached record. */
  async function lock() {
    await queue.catch(() => {});
    dataKey = null;
    resetCache();
  }

  /** Encrypts any plain rows left (needs to be unlocked). Returns { sealed }. */
  async function sealAll(options = {}) {
    if (!dataKey) throw new LockedError();
    const job = queue.then(() => sealRows(dataKey, null, options));
    queue = job.catch(() => {});
    return job;
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
    deleteSnapshot,
    scrubSnapshots,
    ensureDailySnapshot,
    getTombstones,
    migrateFromLocalStorage,
    status,
    setup,
    unlock,
    unlockWithRecovery,
    changePassphrase,
    lock,
    sealAll,
    LockedError,
    LEGACY_KEY,
    LEGACY_PRE_IMPORT_KEY
  };
})();
