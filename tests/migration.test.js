/* Phase 3: one-time move from localStorage['roundingos_hospitalist_v1'] into the database. */
(() => {
  const DB = 'roundingos-unit';
  const KEY = 'roundingos_hospitalist_v1';
  const PRE = 'roundingos_pre_import_snapshot';

  /* Runs fn with a fake old save in localStorage, then puts the real keys back. */
  async function withLegacy(legacy, pre, fn) {
    const backup = { [KEY]: localStorage.getItem(KEY), [PRE]: localStorage.getItem(PRE) };
    localStorage.setItem(KEY, JSON.stringify(legacy));
    if (pre) localStorage.setItem(PRE, JSON.stringify(pre)); else localStorage.removeItem(PRE);
    Store.close();
    await Dexie.delete(DB);
    await Store.open(DB);
    try { return await fn(); } finally {
      Store.close();
      Object.entries(backup).forEach(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
    }
  }

  const legacyState = () => ({ ...getDefaultAppState(), patients: getInitialTestPatients(), providerName: 'Dr. Test (fictional)' });

  test('migration: copies every patient, then deletes the old keys', async () => {
    const legacy = legacyState();
    const pre = { ...getDefaultAppState(), patients: getInitialTestPatients().slice(0, 2) };
    await withLegacy(legacy, pre, async () => {
      const r = await Store.migrateFromLocalStorage();
      assertEqual(r.migrated, true, 'migrated');
      assertEqual(r.count, 14, 'count');
      const loaded = await Store.load();
      assertEqual(loaded.patients.map(p => p.id).join(), legacy.patients.map(p => p.id).join(), 'ids and order');
      assertEqual(JSON.stringify(loaded.patients), JSON.stringify(legacy.patients), 'patient records unchanged');
      assertEqual(loaded.providerName, 'Dr. Test (fictional)', 'settings');
      assertEqual(localStorage.getItem(KEY), null, 'old save deleted');
      assertEqual(localStorage.getItem(PRE), null, 'old pre-import snapshot deleted');
      const snaps = (await Store.listSnapshots()).map(s => s.reason);
      assert(snaps.includes('before migration'), 'copy of the old save kept as a snapshot');
      assert(snaps.includes('before import (old storage)'), 'old pre-import snapshot moved into the database');
    });
  });

  test('migration: a failed check leaves localStorage untouched and the database empty', async () => {
    const legacy = legacyState();
    await withLegacy(legacy, null, async () => {
      const raw = localStorage.getItem(KEY);
      let error = null;
      try {
        await Store.migrateFromLocalStorage({ afterWrite: d => d.table('patients').delete(legacy.patients[0].id) });
      } catch (e) { error = e; }
      assert(error, 'migration should fail');
      assertEqual(localStorage.getItem(KEY), raw, 'old save untouched');
      assertEqual(await Store.load(), null, 'database left empty, so the next start tries again');
    });
  });

  test('migration: nothing to migrate on a fresh install', async () => {
    const backup = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    try {
      Store.close();
      await Dexie.delete(DB);
      await Store.open(DB);
      assertEqual((await Store.migrateFromLocalStorage()).migrated, false, 'migrated');
    } finally {
      Store.close();
      if (backup !== null) localStorage.setItem(KEY, backup);
    }
  });

  test('migration: the app moves an old save into the database on start', async () => {
    const legacy = { ...legacyState(), patients: getInitialTestPatients().slice(0, 4) };
    const app = await loadApp(legacy);
    try {
      assertEqual(app.doc.documentElement.dataset.storeReady, 'db', 'storage mode');
      assertEqual(app.win.localStorage.getItem(KEY), null, 'old save removed after the check');
      assertEqual(app.doc.querySelectorAll('[data-patient-id], .patient-card').length > 0, true, 'census shows patients');
      const saved = await readAppDb();
      assertEqual(saved.patients.length, 4, 'patients in the database');
    } finally { app.restore(); app.frame.remove(); }
  });

  test('app: an edit survives a reload', async () => {
    const legacy = { ...legacyState(), patients: getInitialTestPatients().slice(0, 3) };
    let app = await loadApp(legacy);
    try {
      app.doc.getElementById('themeToggleBtn').click(); // a settings change goes through saveState()
      await waitFor(async () => {
        const s = await readAppDb();
        return s && s.theme && s.theme !== 'light';
      }, 4000, 'theme saved');
      app.restore(); app.frame.remove();
      app = await loadApp(undefined, { keepDb: true });
      const s = await readAppDb();
      assertEqual(s.patients.length, 3, 'patients after reload');
      assert(s.theme !== 'light', 'theme kept');
    } finally { app.restore(); app.frame.remove(); }
  });
})();
