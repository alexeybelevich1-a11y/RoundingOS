/* Phase 3: the on-device database (src/core/store.js), against a throwaway database. */
(() => {
  const DB = 'roundingos-unit';

  /* Fresh database, a state with the 14 fictional test patients, saved once. */
  async function freshStore() {
    Store.close();
    await Dexie.delete(DB);
    await Store.open(DB);
    const state = { ...getDefaultAppState(), patients: getInitialTestPatients() };
    state.selectedPatientId = state.patients[0].id;
    await Store.save(state);
    return state;
  }

  const clone = o => JSON.parse(JSON.stringify(o));

  test('store: save → reload gives an identical state', async () => {
    try {
      const state = await freshStore();
      const before = JSON.stringify(state);
      Store.close();
      await Store.open(DB);
      const loaded = await Store.load();
      assertEqual(JSON.stringify(loaded), before, 'reloaded state');
    } finally { Store.close(); }
  });

  test('store: a new database loads as null', async () => {
    try {
      Store.close();
      await Dexie.delete(DB);
      await Store.open(DB);
      assertEqual(await Store.load(), null, 'empty database');
    } finally { Store.close(); }
  });

  test('store: editing one patient rewrites one patient row', async () => {
    try {
      const state = await freshStore();
      const again = await Store.save(state);
      assertEqual(again.changed, false, 'nothing changed, nothing written');
      state.patients[3].subjective = 'Feels better today (fictional).';
      const r = await Store.save(state);
      assertEqual(r.patientsWritten, 1, 'patient rows written');
      assertEqual(r.patientsDeleted, 0, 'patient rows deleted');
    } finally { Store.close(); }
  });

  test('store: an edit sets updatedAt, an updatedAt set by the caller is kept', async () => {
    try {
      const state = await freshStore();
      const p = state.patients[2];
      p.updatedAt = '2020-01-01T00:00:00.000Z';
      await Store.save(state); // caller-set timestamp, same content: kept
      assertEqual(p.updatedAt, '2020-01-01T00:00:00.000Z', 'caller timestamp kept');
      p.oneLiner = 'Edited one-liner (fictional).';
      await Store.save(state); // content changed, timestamp not touched: Store sets it
      assert(p.updatedAt > '2025-01-01', `updatedAt should be now, got ${p.updatedAt}`);
      Store.close();
      await Store.open(DB);
      const loaded = await Store.load();
      assertEqual(loaded.patients[2].updatedAt, p.updatedAt, 'saved updatedAt');
    } finally { Store.close(); }
  });

  test('store: patient order is kept', async () => {
    try {
      const state = await freshStore();
      state.patients.reverse();
      await Store.save(state);
      const want = state.patients.map(p => p.id).join();
      Store.close();
      await Store.open(DB);
      assertEqual((await Store.load()).patients.map(p => p.id).join(), want, 'order');
    } finally { Store.close(); }
  });

  test('store: deleting a patient leaves a tombstone, adding it back removes it', async () => {
    try {
      const state = await freshStore();
      const gone = state.patients.splice(5, 1)[0];
      const r = await Store.save(state);
      assertEqual(r.patientsDeleted, 1, 'rows deleted');
      let tombs = await Store.getTombstones();
      assertEqual(tombs.length, 1, 'tombstones');
      assertEqual(tombs[0].id, gone.id, 'tombstone id');
      state.patients.splice(5, 0, gone);
      await Store.save(state);
      tombs = await Store.getTombstones();
      assertEqual(tombs.length, 0, 'tombstone removed on undo');
    } finally { Store.close(); }
  });

  test('store: rows keep the record inside a tagged payload (ready for phase 4 encryption)', async () => {
    try {
      await freshStore();
      const raw = new Dexie(DB);
      await raw.open();
      try {
        const rows = await raw.table('patients').toArray();
        assertEqual(rows.length, 14, 'one row per patient');
        rows.forEach(r => {
          assertEqual(Object.keys(r).filter(k => !['id', 'payload', 'purgeAfter'].includes(k)).length, 0, 'only id/purgeAfter readable');
          assertEqual(r.payload.fmt, 'plain', 'payload format tag');
        });
        const settings = await raw.table('settings').get('app');
        assert(settings && settings.payload.fmt === 'plain', 'settings row');
      } finally { raw.close(); }
    } finally { Store.close(); }
  });

  test('store: snapshots restore, and only the last 7 are kept', async () => {
    try {
      const state = await freshStore();
      const first = await Store.snapshot('test 0', state);
      const copy = clone(state);
      state.patients = [];
      const restored = await Store.restoreSnapshot(first);
      assertEqual(JSON.stringify(restored), JSON.stringify(copy), 'restored copy');
      for (let i = 1; i <= 8; i++) await Store.snapshot(`test ${i}`, state);
      const list = await Store.listSnapshots();
      assertEqual(list.length, 7, 'kept snapshots');
      assertEqual(list[0].reason, 'test 8', 'newest first');
      assert(!('payload' in list[0]), 'list has no patient data');
    } finally { Store.close(); }
  });

  test('store: one daily snapshot per day', async () => {
    try {
      const state = await freshStore();
      assert(await Store.ensureDailySnapshot(state), 'first one taken');
      assertEqual(await Store.ensureDailySnapshot(state), null, 'second one skipped');
    } finally { Store.close(); }
  });
})();
