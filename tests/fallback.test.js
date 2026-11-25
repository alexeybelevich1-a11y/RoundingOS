/* HIPAA H3: there is no plain-storage fallback. If the encrypted database can't be used, nothing
   is written to localStorage and a banner says nothing is saved. Fictional patients only. */
(() => {
  const KEY = 'roundingos_hospitalist_v1';
  const PRE = 'roundingos_pre_import_snapshot';

  /* Loads the app as if IndexedDB/WebCrypto were missing, with `seed` as an old localStorage save. */
  async function withNoDbApp(seed, fn) {
    const backup = { [KEY]: localStorage.getItem(KEY), [PRE]: localStorage.getItem(PRE) };
    if (seed) localStorage.setItem(KEY, JSON.stringify(seed)); else localStorage.removeItem(KEY);
    localStorage.removeItem(PRE);
    const frame = document.createElement('iframe');
    frame.className = 'app-frame';
    frame.src = '../index.html?testdb=1&testnodb=1';
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

  test('no database (app): a banner says nothing is saved, and nothing is written to localStorage', async () => {
    await withNoDbApp(null, async ({ doc }) => {
      assertEqual(doc.documentElement.dataset.storeReady, 'error', 'no storage mode');
      const banner = doc.getElementById('storageErrorBanner');
      assert(!banner.classList.contains('hidden'), 'banner shows');
      assert(!banner.querySelector('button'), 'banner has no close button');
      assert(/nothing is saved/i.test(banner.textContent), 'says nothing is saved');
      doc.getElementById('addTestPatientsBtn').click();
      await new Promise(r => setTimeout(r, 500));
      assertEqual(localStorage.getItem(KEY), null, 'no plain save');
      assertEqual(localStorage.getItem(PRE), null, 'no plain pre-change copy');
    });
  });

  test('no database (app): an old localStorage save is left as it is, not loaded or rewritten', async () => {
    const seed = { ...getDefaultAppState(), patients: getInitialTestPatients().slice(0, 2) };
    await withNoDbApp(seed, async ({ doc }) => {
      const before = localStorage.getItem(KEY);
      assert(!doc.querySelector('[data-patient-id]'), 'old data not shown in plain mode');
      doc.getElementById('addTestPatientsBtn').click();
      await new Promise(r => setTimeout(r, 500));
      assertEqual(localStorage.getItem(KEY), before, 'old save untouched (it moves into the database in a working browser)');
    });
  });
})();
