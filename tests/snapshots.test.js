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
})();
