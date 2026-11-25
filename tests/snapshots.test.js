/* Phase 3: saved copies (snapshots) — list, delete, scrub, and the Saved copies screen. Fictional patients only. */
(() => {
  const DB = 'roundingos-unit';
  const pt = id => ({ id, name: `Test ${id}`, room: id.toUpperCase(), priority: 'stable' });
  const stateWith = (...list) => ({ ...getDefaultAppState(), patients: list.map(pt) });

  async function fresh() {
    Store.close();
    await Dexie.delete(DB);
    await Store.open(DB);
  }

  test('snapshots: list shows reason and patient count, delete removes one', async () => {
    try {
      await fresh();
      const a = await Store.snapshot('before import', stateWith('a', 'b'));
      await Store.snapshot('daily', stateWith('a'));
      let list = await Store.listSnapshots();
      assertEqual(list.map(r => `${r.reason}:${r.patientCount}`).join(), 'daily:1,before import:2', 'newest first, with counts');
      assert(!('payload' in list[0]), 'list carries no patient data');
      await Store.deleteSnapshot(a);
      list = await Store.listSnapshots();
      assertEqual(list.length, 1, 'one left');
    } finally { Store.close(); }
  });

  test('snapshots: copies saved before patientCount existed still show a count', async () => {
    try {
      await fresh();
      const id = await Store.snapshot('daily', stateWith('a', 'b', 'c'));
      const d = new Dexie(DB); d.version(1).stores({ meta: 'key', patients: 'id, purgeAfter', settings: 'key', snapshots: '++id, createdAt, reason', tombstones: 'id, deletedAt' });
      await d.open(); await d.snapshots.update(id, { patientCount: undefined }); d.close();
      const list = await Store.listSnapshots();
      assertEqual(list[0].patientCount, 3, 'counted from the copy');
    } finally { Store.close(); }
  });

  test('snapshots: scrub removes a patient from every saved copy', async () => {
    try {
      await fresh();
      await Store.snapshot('daily', stateWith('a', 'x'));
      await Store.snapshot('before import', stateWith('x'));
      await Store.snapshot('daily', stateWith('a'));
      assertEqual(await Store.scrubSnapshots(['x']), 2, 'two copies changed');
      for (const r of await Store.listSnapshots()) {
        const s = await Store.restoreSnapshot(r.id);
        assert(!s.patients.some(p => p.id === 'x'), `x gone from copy ${r.id}`);
        assertEqual(r.patientCount, s.patients.length, 'count updated');
      }
    } finally { Store.close(); }
  });

  test('saved copies (app): restore asks first, replaces the census, and Undo brings it back', async () => {
    await Dexie.delete(APP_TEST_DB);
    await withStore(APP_TEST_DB, async s => {
      await s.save(stateWith('now1', 'now2'));
      await s.snapshot('before import', stateWith('old1'));
    });
    const app = await loadApp(null, { keepDb: true });
    try {
      app.doc.getElementById('dataModalBtn').click();
      app.doc.getElementById('openSnapshotsBtn').click();
      const rows = await waitFor(() => {
        const r = app.doc.querySelectorAll('.snapshot-row');
        return r.length >= 2 && r;
      }, 4000, 'saved copies listed');
      const target = [...rows].find(r => r.textContent.includes('Before import'));
      assert(target && target.textContent.includes('1 patient'), 'reason and count shown');

      let asked = 0;
      app.win.confirm = () => { asked++; return false; };
      target.querySelector('[data-restore-snapshot]').click();
      await new Promise(r => setTimeout(r, 200));
      assertEqual(asked, 1, 'asked before restoring');
      assertEqual((await readAppDb()).patients.length, 2, 'cancel leaves data alone');

      app.win.confirm = () => true;
      target.querySelector('[data-restore-snapshot]').click();
      await waitFor(async () => (await readAppDb()).patients.map(p => p.id).join() === 'old1', 4000, 'restored');
      const undo = await waitFor(() => app.doc.querySelector('.toast-action'), 2000, 'Undo button');
      undo.click();
      await waitFor(async () => (await readAppDb()).patients.map(p => p.id).join() === 'now1,now2', 4000, 'undone');
    } finally { app.restore(); app.frame.remove(); }
  });

  test('saved copies (app): delete asks first and removes the copy', async () => {
    await Dexie.delete(APP_TEST_DB);
    await withStore(APP_TEST_DB, async s => {
      await s.save(stateWith('now1'));
      await s.snapshot('before clear census', stateWith('old1'));
    });
    const app = await loadApp(null, { keepDb: true });
    try {
      app.doc.getElementById('dataModalBtn').click();
      app.doc.getElementById('openSnapshotsBtn').click();
      const before = await waitFor(() => {
        const r = app.doc.querySelectorAll('.snapshot-row');
        return r.length >= 2 && r.length;
      }, 4000, 'listed');
      app.win.confirm = () => true;
      [...app.doc.querySelectorAll('.snapshot-row')].find(r => r.textContent.includes('clearing'))
        .querySelector('[data-delete-snapshot]').click();
      await waitFor(() => app.doc.querySelectorAll('.snapshot-row').length === before - 1, 4000, 'row gone');
      const list = await withStore(APP_TEST_DB, s => s.listSnapshots());
      assert(!list.some(r => r.reason === 'before clear census'), 'deleted from the database');
    } finally { app.restore(); app.frame.remove(); }
  });
  /* ---- HIPAA H6: reminders don't outlive the patient */
  test('reminders (app): deleting a patient for good deletes their reminders; removing drops the name (H6)', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const iso = ms => new Date(ms).toISOString();
    const later = iso(now + 6 * 60 * 60 * 1000);
    const rem = (id, patientId, patientLabel) => ({
      id, text: `Recheck labs (${id})`, dueAt: later, patientId, patientLabel,
      playSound: false, triggered: false, dismissed: false, createdAt: iso(now)
    });
    const p = (id, extra = {}) => ({ ...pt(id), ...extra });
    const state = {
      ...getDefaultAppState(),
      patients: [
        p('act1'), p('act2'),
        p('arc1', { dischargedAt: iso(now), archivedAt: iso(now) }),
        p('old1', { dischargedAt: iso(now - 40 * DAY), archivedAt: iso(now - 40 * DAY) })
      ],
      selectedPatientId: 'act2',
      reminders: [
        rem('r-act2', 'act2', 'Rm ACT2 · Test act2'),
        rem('r-arc1', 'arc1', 'Rm ARC1 · Test arc1'),
        rem('r-old1', 'old1', 'Rm OLD1 · Test old1'),
        rem('r-legacy', null, 'Rm 9 · Test legacy (removed)'),
        rem('r-general', null, '')
      ]
    };
    await Dexie.delete(APP_TEST_DB);
    await withStore(APP_TEST_DB, s => s.save(state));
    const app = await loadApp(null, { keepDb: true });
    try {
      const byId = s => Object.fromEntries((s.reminders || []).map(r => [r.id, r]));
      // automatic purge of old1 at startup, and the old "(removed)" label loses its name
      let saved = await waitFor(async () => {
        const s = await readAppDb();
        return s && !byId(s)['r-old1'] && byId(s)['r-legacy']?.patientLabel === 'Removed patient' && s;
      }, 4000, 'purge and relabel saved');
      assert(byId(saved)['r-general'], 'general reminder kept');
      app.win.confirm = () => true;
      // Remove from census (active): reminder kept, without the name
      app.doc.getElementById('deletePatientBtn').click();
      saved = await waitFor(async () => {
        const s = await readAppDb();
        return s && !s.patients.some(x => x.id === 'act2') && s;
      }, 4000, 'act2 removed');
      const kept = byId(saved)['r-act2'];
      assert(kept, 'reminder kept');
      assertEqual(kept.patientLabel, 'Removed patient', 'label');
      assertEqual(kept.patientId, null, 'unlinked');
      // Delete now (archived): reminder deleted
      const sel = app.doc.getElementById('filterSelect');
      sel.value = 'archived';
      sel.dispatchEvent(new app.win.Event('change'));
      app.doc.querySelector('[data-patient-id="arc1"]').click();
      app.doc.getElementById('deletePatientBtn').click();
      saved = await waitFor(async () => {
        const s = await readAppDb();
        return s && !s.patients.some(x => x.id === 'arc1') && s;
      }, 4000, 'arc1 deleted');
      assert(!byId(saved)['r-arc1'], 'reminder deleted with the patient');
      const all = JSON.stringify(saved.reminders);
      assert(!/Test (act2|arc1|old1|legacy)/.test(all), 'no removed patient names left in reminders');
    } finally { app.restore(); app.frame.remove(); }
  });
})();
