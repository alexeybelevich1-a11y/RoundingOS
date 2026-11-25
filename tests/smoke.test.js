/* Phase 1 smoke tests: the app loads, a fresh install is empty, test patients still load. */
test('fresh install opens to an empty census', async () => {
  const app = await loadApp(null);
  try {
    const cards = app.doc.querySelectorAll('[data-patient-id], .patient-card');
    assertEqual(cards.length, 0, 'patient cards on first run');
    assertEqual(app.doc.documentElement.dataset.storeReady, 'db', 'saves to the on-device database');
    const saved = await waitFor(readAppDb, 4000, 'first save');
    assertEqual(saved.patients.length, 0, 'saved patients on first run');
    assertEqual(saved.voiceEnabled, false, 'voice is off by default');
  } finally { app.restore(); app.frame.remove(); }
});

test('"Add 14 test patients" still works', async () => {
  const app = await loadApp(null);
  try {
    app.doc.getElementById('addTestPatientsBtn').click();
    const saved = await waitFor(async () => {
      const s = await readAppDb();
      return s && s.patients.length === 14 && s;
    }, 4000, '14 saved patients');
    assertEqual(saved.patients.length, 14, 'patients after adding test data');
  } finally { app.restore(); app.frame.remove(); }
});

test('opening with ?demo=1 loads the 14 test patients into an empty census', async () => {
  const app = await loadApp(null, { query: '&demo=1' });
  try {
    const saved = await waitFor(async () => {
      const s = await readAppDb();
      return s && s.patients.length === 14 && s;
    }, 4000, '14 saved patients');
    assertEqual(saved.patients.length, 14, 'patients after ?demo=1');
    assert(!app.win.location.search.includes('demo'), 'demo flag removed from the address');
    assert(app.win.location.search.includes('testdb=1'), 'other flags kept');
  } finally { app.restore(); app.frame.remove(); }
});

test('?demo=1 leaves a census that already has patients alone', async () => {
  const mine = { ...getInitialTestPatients()[0], id: 'demo-check-1', mrn: 'FAKE-1', isTest: false };
  await Dexie.delete(APP_TEST_DB);
  await withStore(APP_TEST_DB, s => s.save({ ...getDefaultAppState(), patients: [mine], selectedPatientId: mine.id }));
  const app = await loadApp(null, { keepDb: true, query: '&demo=1' });
  try {
    await new Promise(r => setTimeout(r, 500));
    const saved = await readAppDb();
    assertEqual(saved.patients.length, 1, 'existing census untouched');
    assertEqual(saved.patients[0].id, 'demo-check-1', 'same patient');
  } finally { app.restore(); app.frame.remove(); }
});

test('voice does not start until the notice is accepted', async () => {
  const app = await loadApp(null);
  try {
    app.doc.getElementById('fabMic')?.click();
    const modal = app.doc.getElementById('voiceConsentModal');
    assert(!modal.classList.contains('hidden'), 'notice should open on first mic tap');
    assert(app.doc.getElementById('voiceBanner').classList.contains('hidden'), 'no recognition running');
  } finally { app.restore(); app.frame.remove(); }
});

test('manifest has the fields Android needs', async () => {
  const m = await (await fetch('../manifest.json', { cache: 'no-store' })).json();
  assertEqual(m.display, 'standalone', 'display');
  assert(m.start_url && m.name, 'name and start_url');
  assert(m.icons.some(i => i.sizes === '192x192'), '192 icon');
  assert(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'maskable 512 icon');
});

test('manifest has an "Open with test data" shortcut that opens ?demo=1 under any path', async () => {
  const m = await (await fetch('../manifest.json', { cache: 'no-store' })).json();
  const sc = (m.shortcuts || []).find(s => s.name === 'Open with test data');
  assert(sc, 'shortcut present');
  assertEqual(sc.url, './?demo=1', 'relative url, so it stays inside /RoundingOS/ on GitHub Pages');
  const resolved = new URL(sc.url, 'https://example.org/RoundingOS/manifest.json');
  assertEqual(resolved.pathname + resolved.search, '/RoundingOS/?demo=1', 'resolves inside the app scope');
});

test('service worker precaches every script and stylesheet the app loads', async () => {
  const sw = await (await fetch('../sw.js', { cache: 'no-store' })).text();
  const html = await (await fetch('../index.html', { cache: 'no-store' })).text();
  const scripts = [...html.matchAll(/<script src="([^"]+)"|<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1] || m[2]);
  assert(scripts.length > 5, 'found scripts in index.html');
  scripts.forEach(src => assert(sw.includes(`'${src}'`), `${src} missing from APP_FILES in sw.js`));
});

test('app scripts load and getDefaultAppState() returns an empty state', async () => {
  const app = await loadApp(null);
  try {
    const st = app.win.getDefaultAppState();
    assert(st && typeof st === 'object', 'state object');
    assertEqual(st.patients.length, 0, 'default patients');
    assertEqual(st.selectedPatientId, null, 'default selection');
    assertEqual(app.win.getInitialTestPatients().length, 14, 'test patients available');
  } finally { app.restore(); app.frame.remove(); }
});
