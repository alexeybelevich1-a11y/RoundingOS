/* Phase 3: merging import between devices (src/core/transfer.js). Fictional patients only. */
(() => {
  const T0 = '2026-01-01T08:00:00.000Z';
  const T1 = '2026-01-01T09:00:00.000Z';
  const T2 = '2026-01-01T10:00:00.000Z';
  const pt = (id, updatedAt, extra = {}) => ({ id, name: `Test ${id}`, room: id.toUpperCase(), updatedAt, ...extra });
  const ids = list => list.map(p => p.id).join();

  test('merge: newer edit wins on both sides', () => {
    const local = { patients: [pt('a', T2, { plan: 'local' }), pt('b', T0, { plan: 'local' })] };
    const incoming = { patients: [pt('a', T1, { plan: 'file' }), pt('b', T1, { plan: 'file' })] };
    const { patients, summary } = Transfer.mergeStates(local, incoming, []);
    assertEqual(patients.find(p => p.id === 'a').plan, 'local', 'a: local is newer');
    assertEqual(patients.find(p => p.id === 'b').plan, 'file', 'b: file is newer');
    assertEqual(summary.keptLocal, 1, 'kept local');
    assertEqual(summary.updated, 1, 'updated');
  });

  test('merge: patients on one side only are kept or added, local order first', () => {
    const local = { patients: [pt('a', T0), pt('b', T0)] };
    const incoming = { patients: [pt('c', T0), pt('a', T0)] };
    const { patients, summary } = Transfer.mergeStates(local, incoming, []);
    assertEqual(ids(patients), 'a,b,c', 'order');
    assertEqual(summary.added, 1, 'added');
    assertEqual(summary.unchanged, 1, 'unchanged');
  });

  test('merge: a patient deleted here after the export stays deleted', () => {
    const local = { patients: [pt('a', T0)] };
    const incoming = { patients: [pt('a', T0), pt('b', T0)] };
    const { patients, summary } = Transfer.mergeStates(local, incoming, [{ id: 'b', deletedAt: T1 }]);
    assertEqual(ids(patients), 'a', 'b stays deleted');
    assertEqual(summary.skippedDeleted, 1, 'skipped');
  });

  test('merge: a patient edited on the other device after it was deleted here comes back', () => {
    const local = { patients: [] };
    const incoming = { patients: [pt('b', T2)] };
    const { patients } = Transfer.mergeStates(local, incoming, [{ id: 'b', deletedAt: T1 }]);
    assertEqual(ids(patients), 'b', 'b restored');
  });

  test('merge: a patient deleted on the other device is removed here', () => {
    const local = { patients: [pt('a', T0), pt('b', T0), pt('c', T2)] };
    const incoming = { patients: [pt('a', T0)], deletedPatients: [{ id: 'b', deletedAt: T1 }, { id: 'c', deletedAt: T1 }] };
    const { patients, summary } = Transfer.mergeStates(local, incoming, []);
    assertEqual(ids(patients), 'a,c', 'b removed, c edited here after the deletion stays');
    assertEqual(summary.removed, 1, 'removed');
  });

  test('merge: re-importing the same file changes nothing', () => {
    const local = { patients: [pt('a', T0), pt('b', T1)] };
    const file = Transfer.buildExport({ patients: [pt('a', T0), pt('c', T1)] }, []);
    const once = Transfer.mergeStates(local, file, []);
    const twice = Transfer.mergeStates({ patients: once.patients }, file, []);
    assertEqual(JSON.stringify(twice.patients), JSON.stringify(once.patients), 'same result');
    assertEqual(twice.summary.added + twice.summary.updated + twice.summary.removed, 0, 'no changes the second time');
  });

  test('merge: does not change its inputs', () => {
    const local = { patients: [pt('a', T0)] };
    const incoming = { patients: [pt('a', T1), pt('b', T1)] };
    const before = JSON.stringify([local, incoming]);
    Transfer.mergeStates(local, incoming, []);
    assertEqual(JSON.stringify([local, incoming]), before, 'inputs');
  });

  test('export carries deleted ids; replace strips them from the state', () => {
    const file = Transfer.buildExport({ patients: [pt('a', T0)], theme: 'dark' }, [{ id: 'z', deletedAt: T1, extra: 1 }]);
    assertEqual(JSON.stringify(file.deletedPatients), JSON.stringify([{ id: 'z', deletedAt: T1 }]), 'deletedPatients');
    const st = Transfer.stripTransferFields(file);
    assert(!('deletedPatients' in st), 'stripped');
    assertEqual(st.theme, 'dark', 'other fields kept');
  });

  test('summary text', () => {
    assertEqual(Transfer.describeSummary({ added: 3, updated: 5, keptLocal: 1, unchanged: 0, removed: 0, skippedDeleted: 0 }),
      '3 new, 5 updated, 1 kept local (newer)', 'text');
  });

  test('app: merge import round trip through the encrypted file', async () => {
    // A file exported from "the other device": one patient edited later, one new.
    const base = getInitialTestPatients().slice(0, 3).map(p => ({ ...p, updatedAt: T0 }));
    const legacy = { ...getDefaultAppState(), patients: base };
    const app = await loadApp(legacy);
    try {
      const other = JSON.parse(JSON.stringify(base));
      other[1].plan = 'Edited on the other device (fictional).';
      other[1].updatedAt = T2;
      other.push({ ...getInitialTestPatients()[5], updatedAt: T1 });
      const pass = 'test-passphrase-123';
      const fileText = await BackupCrypto.encryptJson({ ...getDefaultAppState(), patients: other }, pass);
      const input = app.doc.getElementById('importJsonInput');
      const dt = new app.win.DataTransfer();
      dt.items.add(new app.win.File([fileText], 'backup.rnos', { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new app.win.Event('change'));
      await waitFor(() => !app.doc.getElementById('passModal').classList.contains('hidden'), 4000, 'passphrase dialog');
      app.doc.getElementById('passInput').value = pass;
      app.doc.getElementById('passForm').requestSubmit();
      await waitFor(() => !app.doc.getElementById('importModal').classList.contains('hidden'), 4000, 'import summary');
      const summary = app.doc.getElementById('importSummary').textContent;
      assert(summary.includes('1 new') && summary.includes('1 updated'), `summary: ${summary}`);
      app.doc.getElementById('importMergeBtn').click();
      const saved = await waitFor(async () => {
        const s = await readAppDb();
        return s && s.patients.length === 4 && s;
      }, 4000, 'merged census saved');
      assertEqual(saved.patients[1].plan, 'Edited on the other device (fictional).', 'newer edit taken');
      assertEqual(saved.patients[1].updatedAt, T2, 'merged patient keeps the other device\'s timestamp');
      const snaps = await withStore(APP_TEST_DB, s => s.listSnapshots());
      assert(snaps.some(s => s.reason === 'before import'), 'snapshot taken before the import');
    } finally { app.restore(); app.frame.remove(); }
  });
})();
