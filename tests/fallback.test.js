/* HIPAA H3: when the encrypted database can't be used, the app keeps test patients only and never
   writes real patients to localStorage in plain text. Fictional patients only. */
(() => {
  const KEY = 'roundingos_hospitalist_v1';
  const PRE = 'roundingos_pre_import_snapshot';

  /* Loads the app as if IndexedDB/WebCrypto were missing, with `seed` as the old localStorage save. */
  async function withFallbackApp(seed, fn) {
    const backup = { [KEY]: localStorage.getItem(KEY), [PRE]: localStorage.getItem(PRE) };
    if (seed) localStorage.setItem(KEY, JSON.stringify(seed)); else localStorage.removeItem(KEY);
    localStorage.removeItem(PRE);
    const frame = document.createElement('iframe');
    frame.className = 'app-frame';
    frame.src = '../index.html?testdb=1&testfallback=1';
    document.body.appendChild(frame);
    try {
      await waitFor(() => frame.contentWindow?.document?.documentElement?.dataset.storeReady, 10000, 'app ready');
      const win = frame.contentWindow;
      await fn({ win, doc: win.document });
    } finally {
      frame.remove();
      Object.entries(backup).forEach(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
    }
  }

  const saved = () => JSON.parse(localStorage.getItem(KEY) || 'null');
  const realPatient = () => ({
    id: 'pt-real1', name: 'Fictional Realperson', room: '501', age: 70, sex: 'F', codeStatus: 'Full',
    priority: 'stable', mrn: '000123', allergies: 'NKDA', hospitalDay: 2
  });

  test('fallback (app): test patients are saved, and the banner shows with no way to hide it', async () => {
    await withFallbackApp(null, async ({ doc }) => {
      assertEqual(doc.documentElement.dataset.storeReady, 'local', 'plain-storage fallback');
      const banner = doc.getElementById('testDataBanner');
      assert(!banner.classList.contains('hidden'), 'banner shows');
      assert(!banner.querySelector('button'), 'banner has no close button');
      doc.getElementById('addTestPatientsBtn').click();
      const s = await waitFor(() => { const v = saved(); return v && v.patients.length === 14 && v; }, 4000, 'test patients saved');
      assertEqual(s.patients.length, 14, 'saved to localStorage');
    });
  });

  test('fallback (app): old real data still opens, but edits and new real patients are not written in plain text', async () => {
    const seed = { ...getDefaultAppState(), patients: [realPatient()], selectedPatientId: 'pt-real1' };
    await withFallbackApp(seed, async ({ win, doc }) => {
      const before = localStorage.getItem(KEY);
      assert(doc.querySelector('[data-patient-id="pt-real1"]'), 'old patient is readable');
      // Adding a real patient through the form is refused
      doc.getElementById('pfId').value = '';
      doc.getElementById('pfRoom').value = '502';
      doc.getElementById('pfName').value = 'Fictional Newperson';
      doc.getElementById('pfAge').value = '60';
      doc.getElementById('pfMrn').value = '000456';
      doc.getElementById('patientForm').dispatchEvent(new win.Event('submit', { cancelable: true }));
      assert(!doc.querySelector('[data-patient-id]:not([data-patient-id="pt-real1"])'), 'no new patient on the census');
      assert(/test patients only/.test(doc.body.textContent), 'says why');
      // Editing the real patient (through the form) is refused too
      doc.getElementById('pfId').value = 'pt-real1';
      doc.getElementById('pfRoom').value = '599';
      doc.getElementById('patientForm').dispatchEvent(new win.Event('submit', { cancelable: true }));
      // Adding test patients next to a real one is shown but not written either
      doc.getElementById('addTestPatientsBtn').click();
      await new Promise(r => setTimeout(r, 400));
      assertEqual(localStorage.getItem(KEY), before, 'localStorage unchanged');
      assertEqual(localStorage.getItem(PRE), null, 'no plain pre-change copy');
    });
  });

  test('fallback (app): a patient with a TEST- MRN can be added', async () => {
    await withFallbackApp(null, async ({ win, doc }) => {
      doc.getElementById('pfId').value = '';
      doc.getElementById('pfRoom').value = '777';
      doc.getElementById('pfName').value = 'Test Fictional';
      doc.getElementById('pfAge').value = '50';
      doc.getElementById('pfSex').value = 'M';
      doc.getElementById('pfMrn').value = 'TEST-9';
      doc.getElementById('patientForm').dispatchEvent(new win.Event('submit', { cancelable: true }));
      const s = await waitFor(() => { const v = saved(); return v && v.patients.some(p => p.mrn === 'TEST-9') && v; }, 4000, 'test patient saved');
      assertEqual(s.patients.length, 1, 'one patient');
    });
  });
})();
