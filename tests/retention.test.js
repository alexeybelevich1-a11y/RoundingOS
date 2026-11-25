/* Phase 3: discharged patients → archive → deleted after N days (src/core/retention.js). Fictional patients only. */
(() => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date('2026-03-31T12:00:00.000Z');
  const ago = days => new Date(NOW.getTime() - days * DAY).toISOString();
  const pt = (id, extra = {}) => ({ id, name: `Test ${id}`, room: id.toUpperCase(), priority: 'stable', ...extra });
  const ids = list => list.map(p => p.id).join();

  test('retention: defaults are archive right away, delete after 30 days', () => {
    const r = Retention.settingsOf({});
    assertEqual(r.archiveAfterDays, 0, 'archive');
    assertEqual(r.deleteAfterDays, 30, 'delete');
    const bad = Retention.settingsOf({ retention: { archiveAfterDays: 9, deleteAfterDays: 1 } });
    assertEqual(bad.deleteAfterDays, 30, 'values outside the choices fall back to the default');
  });

  test('retention: patients never marked discharged are never archived or deleted', () => {
    const r = { archiveAfterDays: 0, deleteAfterDays: 7 };
    const patients = [
      pt('a', { priority: 'discharge', updatedAt: ago(400) }),
      pt('b', { disposition: 'Discharged home', hospitalDay: 90 }),
      pt('c', { archivedAt: ago(400) }) // archivedAt without dischargedAt is not a discharge
    ];
    const { toArchive, toDelete } = Retention.due(patients, r, NOW);
    assertEqual(toArchive.length + toDelete.length, 0, 'nothing due');
    patients.forEach(p => assert(Retention.isActive(p), `${p.id} stays on the census`));
  });

  test('retention: discharge archives right away by default, Return to census undoes it', () => {
    const p = pt('a');
    Retention.discharge(p, Retention.settingsOf({}), NOW);
    assert(Retention.isArchived(p), 'archived');
    assertEqual(Retention.deleteDate(p, Retention.settingsOf({})).toISOString(), new Date(NOW.getTime() + 30 * DAY).toISOString(), 'delete date');
    Retention.returnToCensus(p);
    assert(Retention.isActive(p) && !p.dischargedAt && !p.archivedAt, 'back on census');
  });

  test('retention: with a 1-day wait, archive comes after a day and delete after the window', () => {
    const r = { archiveAfterDays: 1, deleteAfterDays: 30 };
    const p = pt('a');
    Retention.discharge(p, r, new Date(ago(0.5)));
    assert(!Retention.isArchived(p) && Retention.isActive(p), 'still on the census for the first day');
    assertEqual(Retention.due([p], r, NOW).toArchive.length, 0, 'not due after 12 h');
    p.dischargedAt = ago(1);
    assertEqual(ids(Retention.due([p], r, NOW).toArchive), 'a', 'due after 1 day');
    const archived = [pt('x', { dischargedAt: ago(40), archivedAt: ago(29) }), pt('y', { dischargedAt: ago(40), archivedAt: ago(30) })];
    assertEqual(ids(Retention.due(archived, r, NOW).toDelete), 'y', 'deleted only after 30 days in the archive');
  });

  /* ---- In the app */
  async function seedApp(state, snapshotState) {
    await Dexie.delete(APP_TEST_DB);
    await withStore(APP_TEST_DB, async s => {
      await s.save(state);
      if (snapshotState) await s.snapshot('daily', snapshotState);
    });
    return loadApp(null, { keepDb: true });
  }

  test('retention (app): an expired archived patient is deleted from the database and from saved copies', async () => {
    const now = Date.now();
    const old = new Date(now - 31 * DAY).toISOString();
    const recent = new Date(now - 2 * DAY).toISOString();
    const state = { ...getDefaultAppState(), patients: [
      pt('keep', { priority: 'discharge' }),
      pt('gone', { dischargedAt: old, archivedAt: old }),
      pt('arch', { dischargedAt: recent, archivedAt: recent })
    ] };
    const app = await seedApp(state, state);
    try {
      const saved = await waitFor(async () => {
        const s = await readAppDb();
        return s && !s.patients.some(p => p.id === 'gone') && s;
      }, 4000, 'expired patient deleted');
      assertEqual(ids(saved.patients), 'keep,arch', 'active and recently archived patients kept');
      const copies = await waitFor(async () => {
        const list = await withStore(APP_TEST_DB, s => s.listSnapshots());
        return list.length && list.every(c => c.patientCount === 2) && list;
      }, 4000, 'saved copies scrubbed');
      const copy = await withStore(APP_TEST_DB, s => s.restoreSnapshot(copies[copies.length - 1].id));
      assert(!copy.patients.some(p => p.id === 'gone'), 'not in the saved copy');
      const tomb = await withStore(APP_TEST_DB, s => s.getTombstones());
      assert(tomb.some(t => t.id === 'gone'), 'tombstone so a merge import keeps it deleted');
    } finally { app.restore(); app.frame.remove(); }
  });

  test('retention (app): archived patients leave the census and sign-out, the Archive filter shows them', async () => {
    const t = new Date().toISOString();
    const state = { ...getDefaultAppState(), patients: [pt('act1'), pt('arc1', { dischargedAt: t, archivedAt: t })] };
    const app = await seedApp(state);
    try {
      const cardIds = () => [...app.doc.querySelectorAll('[data-patient-id]')].map(c => c.dataset.patientId).join();
      assertEqual(cardIds(), 'act1', 'census list');
      const so = SignOutEngine.generateText(state, {});
      assert(so.includes('Test act1'), 'active patient in sign-out');
      assert(!so.includes('Test arc1'), 'archived patient not in sign-out');
      const sel = app.doc.getElementById('filterSelect');
      sel.value = 'archived';
      sel.dispatchEvent(new app.win.Event('change'));
      assertEqual(cardIds(), 'arc1', 'archive list');
    } finally { app.restore(); app.frame.remove(); }
  });

  test('retention (app): Discharged action moves a patient to the archive, Return to census brings it back', async () => {
    const state = { ...getDefaultAppState(), patients: [pt('p1'), pt('p2')], selectedPatientId: 'p1' };
    const app = await seedApp(state);
    try {
      app.doc.getElementById('dischargePatientBtn').click();
      const saved = await waitFor(async () => {
        const s = await readAppDb();
        const p = s && s.patients.find(x => x.id === 'p1');
        return p && p.archivedAt && s;
      }, 4000, 'archived p1 saved');
      assertEqual(saved.patients.length, 2, 'not deleted');
      const cards = [...app.doc.querySelectorAll('[data-patient-id]')].map(c => c.dataset.patientId).join();
      assertEqual(cards, 'p2', 'p1 left the census');
      const sel = app.doc.getElementById('filterSelect');
      sel.value = 'archived';
      sel.dispatchEvent(new app.win.Event('change'));
      app.doc.querySelector('[data-patient-id="p1"]').click();
      app.doc.getElementById('returnToCensusBtn').click();
      await waitFor(async () => {
        const s = await readAppDb();
        const p = s && s.patients.find(x => x.id === 'p1');
        return p && !p.dischargedAt;
      }, 4000, 'p1 back on census');
    } finally { app.restore(); app.frame.remove(); }
  });
  test('retention (app): Delete now on an archived patient also removes it from saved copies (H5)', async () => {
    const t = new Date().toISOString();
    const state = { ...getDefaultAppState(), patients: [pt('act1'), pt('arc1', { dischargedAt: t, archivedAt: t })], filterBy: 'archived', selectedPatientId: 'arc1' };
    const app = await seedApp(state, state);
    try {
      const asked = [];
      app.win.confirm = q => { asked.push(q); return true; };
      app.doc.getElementById('deletePatientBtn').click();
      assert(/saved copies/.test(asked[0] || ''), `confirm says saved copies go too: ${asked[0]}`);
      const saved = await waitFor(async () => {
        const s = await readAppDb();
        return s && !s.patients.some(p => p.id === 'arc1') && s;
      }, 4000, 'arc1 deleted');
      assertEqual(ids(saved.patients), 'act1', 'only the active patient left');
      const copies = await waitFor(async () => {
        const list = await withStore(APP_TEST_DB, s => s.listSnapshots());
        return list.length && list.every(c => c.patientCount === 1) && list;
      }, 4000, 'saved copies scrubbed');
      for (const c of copies) {
        const copy = await withStore(APP_TEST_DB, s => s.restoreSnapshot(c.id));
        assert(!copy.patients.some(p => p.id === 'arc1'), 'not in any saved copy');
      }
    } finally { app.restore(); app.frame.remove(); }
  });

  test('retention (app): Remove from census keeps the patient in saved copies and says so (H5)', async () => {
    const state = { ...getDefaultAppState(), patients: [pt('act1'), pt('act2')], selectedPatientId: 'act2' };
    const app = await seedApp(state, state);
    try {
      const asked = [];
      app.win.confirm = q => { asked.push(q); return true; };
      app.doc.getElementById('deletePatientBtn').click();
      assert(/Saved copies .* keep them/.test(asked[0] || ''), `confirm mentions saved copies: ${asked[0]}`);
      await waitFor(async () => {
        const s = await readAppDb();
        return s && !s.patients.some(p => p.id === 'act2');
      }, 4000, 'act2 removed');
      await new Promise(r => setTimeout(r, 300));
      const list = await withStore(APP_TEST_DB, s => s.listSnapshots());
      const copy = await withStore(APP_TEST_DB, s => s.restoreSnapshot(list[list.length - 1].id));
      assert(copy.patients.some(p => p.id === 'act2'), 'still in the saved copy');
    } finally { app.restore(); app.frame.remove(); }
  });
})();
