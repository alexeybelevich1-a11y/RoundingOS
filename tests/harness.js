/* Tiny test harness: no dependencies. Usage: test('name', async () => { assert(cond, 'msg'); }); */
(() => {
  'use strict';
  const tests = [];
  window.test = (name, fn) => tests.push({ name, fn });
  window.assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  /* Marks a test as waiting for a value to be filled in: shown as TODO, does not fail the run. */
  window.todo = (msg) => { const e = new Error(msg); e.todo = true; throw e; };
  window.assertEqual = (a, b, msg) => {
    if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };

  /* Polls until fn() returns something truthy (fn may be async). */
  window.waitFor = async (fn, ms = 4000, what = 'condition') => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise(r => setTimeout(r, 50));
    }
  };

  /* The app loaded with ?testdb=1 saves to this database, never to the real `roundingos`. */
  window.APP_TEST_DB = 'roundingos-test';

  /* Opens a database with this page's copy of Store, runs fn(Store), closes it again. */
  window.withStore = async (name, fn) => {
    await Store.open(name);
    try { return await fn(Store); } finally { Store.close(); }
  };

  /* What the app in the iframe has saved (null until its first save lands). */
  window.readAppDb = () => withStore(APP_TEST_DB, s => s.load());

  /* Load the app in an iframe with an empty test database and a clean old-storage key.
     seed: undefined = leave localStorage as is, null = remove it, object = old save to migrate. */
  window.loadApp = async (seed, { keepDb = false, query = '' } = {}) => {
    if (!keepDb) await Dexie.delete(APP_TEST_DB);
    return new Promise((resolve, reject) => {
      const KEY = 'roundingos_hospitalist_v1';
      const backup = localStorage.getItem(KEY);
      if (seed === null) localStorage.removeItem(KEY); else if (seed) localStorage.setItem(KEY, JSON.stringify(seed));
      const frame = document.createElement('iframe');
      frame.className = 'app-frame';
      frame.src = `../index.html?testdb=1${query}`;
      const restore = () => { if (backup === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, backup); };
      const timer = setTimeout(() => { restore(); reject(new Error('app did not load in 10 s')); }, 10000);
      frame.addEventListener('load', () => {
        const w = frame.contentWindow;
        const check = () => {
          const list = w.document.getElementById('patientList') || w.document.querySelector('.census-pane');
          if (list && w.document.documentElement.dataset.storeReady) {
            clearTimeout(timer);
            resolve({ frame, win: w, doc: w.document, restore });
          } else setTimeout(check, 50);
        };
        check();
      });
      document.body.appendChild(frame);
    });
  };

  window.runTests = async () => {
    const out = document.getElementById('results');
    let pass = 0, fail = 0, todos = 0;
    for (const t of tests) {
      const li = document.createElement('li');
      try { await t.fn(); li.textContent = `✓ ${t.name}`; li.className = 'pass'; pass++; }
      catch (e) {
        if (e.todo) { li.textContent = `○ TODO ${t.name}: ${e.message}`; li.className = 'todo'; todos++; }
        else { li.textContent = `✗ ${t.name}: ${e.message}`; li.className = 'fail'; fail++; }
      }
      out.appendChild(li);
    }
    const sum = document.getElementById('summary');
    sum.textContent = `${pass} passed, ${fail} failed${todos ? `, ${todos} TODO` : ''}`;
    sum.className = fail ? 'fail' : 'pass';
    document.title = fail ? 'FAIL' : 'PASS';
  };
})();
