/* Phase 1 smoke tests: the app loads, a fresh install is empty, test patients still load. */
test('fresh install opens to an empty census', async () => {
  const app = await loadApp(null);
  try {
    const cards = app.doc.querySelectorAll('[data-patient-id], .patient-card');
    assertEqual(cards.length, 0, 'patient cards on first run');
    const saved = JSON.parse(app.win.localStorage.getItem('roundingos_hospitalist_v1'));
    assertEqual(saved.patients.length, 0, 'saved patients on first run');
    assertEqual(saved.voiceEnabled, false, 'voice is off by default');
  } finally { app.restore(); app.frame.remove(); }
});

test('"Add 14 test patients" still works', async () => {
  const app = await loadApp(null);
  try {
    app.doc.getElementById('addTestPatientsBtn').click();
    await new Promise(r => setTimeout(r, 100));
    const saved = JSON.parse(app.win.localStorage.getItem('roundingos_hospitalist_v1'));
    assertEqual(saved.patients.length, 14, 'patients after adding test data');
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
