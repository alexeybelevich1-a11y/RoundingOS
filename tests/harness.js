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

  /* Passphrase the harness types into the app's lock screen (setup and unlock). */
  window.TEST_PASSPHRASE = 'fictional test passphrase';

  /* Opens a database with this page's copy of Store, runs fn(Store), closes it again.
     An encrypted database is unlocked with TEST_PASSPHRASE first. */
  window.withStore = async (name, fn) => {
    await Store.open(name);
    try {
      if (Store.status().encrypted) await Store.unlock(TEST_PASSPHRASE);
      return await fn(Store);
    } finally { Store.close(); }
  };

  /* What the app in the iframe has saved (null until its first save lands). */
  window.readAppDb = () => withStore(APP_TEST_DB, s => s.load());

  /* Fills in whichever lock-screen step is showing: Setup (passphrase, recovery words, the check)
     or Unlock. Each step is answered once. Returns the recovery words once they were shown. */
  function driveLockScreen(doc, seen) {
    const modal = doc.getElementById('lockModal');
    if (!modal || modal.classList.contains('hidden')) return;
    const visible = id => { const f = doc.getElementById(id); return f && !f.classList.contains('hidden') && f; };
    const once = (form, fn) => { if (form.dataset.testDone) return; form.dataset.testDone = '1'; fn(); form.requestSubmit(); };
    let f;
    if ((f = visible('lockSetupStep'))) once(f, () => {
      doc.getElementById('lockSetupPass').value = TEST_PASSPHRASE;
      doc.getElementById('lockSetupConfirm').value = TEST_PASSPHRASE;
    });
    else if ((f = visible('lockWordsStep'))) once(f, () => {
      seen.words = [...doc.querySelectorAll('#lockWordsList li')].map(li => li.textContent);
    });
    else if ((f = visible('lockConfirmStep'))) once(f, () => {
      [0, 1, 2].forEach(i => {
        const n = Number(doc.getElementById(`lockConfirmLabel${i}`).textContent.replace(/\D/g, ''));
        doc.getElementById(`lockConfirmWord${i}`).value = seen.words[n - 1];
      });
    });
    else if ((f = visible('lockUnlockStep'))) once(f, () => {
      doc.getElementById('lockPassInput').value = TEST_PASSPHRASE;
    });
  }

  /* Load the app in an iframe with an empty test database and a clean old-storage key.
     seed: undefined = leave localStorage as is, null = remove it, object = old save to migrate.
     The harness answers the lock screen (setup or unlock) unless stopAtLock is set, in which
     case it resolves as soon as the lock screen shows. */
  window.loadApp = async (seed, { keepDb = false, stopAtLock = false } = {}) => {
    if (!keepDb) await Dexie.delete(APP_TEST_DB);
    return new Promise((resolve, reject) => {
      const KEY = 'roundingos_hospitalist_v1';
      const backup = localStorage.getItem(KEY);
      if (seed === null) localStorage.removeItem(KEY); else if (seed) localStorage.setItem(KEY, JSON.stringify(seed));
      const frame = document.createElement('iframe');
      frame.className = 'app-frame';
      frame.src = '../index.html?testdb=1';
      const restore = () => { if (backup === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, backup); };
      const timer = setTimeout(() => { restore(); reject(new Error('app did not load in 10 s')); }, 10000);
      const seen = {};
      frame.addEventListener('load', () => {
        const w = frame.contentWindow;
        const check = () => {
          const lock = w.document.getElementById('lockModal');
          if (stopAtLock && lock && !lock.classList.contains('hidden')) {
            clearTimeout(timer);
            resolve({ frame, win: w, doc: w.document, restore, seen });
            return;
          }
          if (!stopAtLock) driveLockScreen(w.document, seen);
          const list = w.document.getElementById('patientList') || w.document.querySelector('.census-pane');
          if (list && w.document.documentElement.dataset.storeReady) {
            clearTimeout(timer);
            resolve({ frame, win: w, doc: w.document, restore, recoveryWords: seen.words || null });
          } else setTimeout(check, 50);
        };
        check();
      }, { once: true });
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
