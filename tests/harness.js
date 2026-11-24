/* Tiny test harness: no dependencies. Usage: test('name', async () => { assert(cond, 'msg'); }); */
(() => {
  'use strict';
  const tests = [];
  window.test = (name, fn) => tests.push({ name, fn });
  window.assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  window.assertEqual = (a, b, msg) => {
    if (a !== b) throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };

  /* Load the app in an iframe with a clean storage key, wait until it has rendered. */
  window.loadApp = (seed) => new Promise((resolve, reject) => {
    const KEY = 'roundingos_hospitalist_v1';
    const backup = localStorage.getItem(KEY);
    if (seed === null) localStorage.removeItem(KEY); else if (seed) localStorage.setItem(KEY, JSON.stringify(seed));
    const frame = document.createElement('iframe');
    frame.className = 'app-frame';
    frame.src = '../index.html';
    const restore = () => { if (backup === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, backup); };
    const timer = setTimeout(() => { restore(); reject(new Error('app did not load in 10 s')); }, 10000);
    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      const check = () => {
        const list = w.document.getElementById('patientList') || w.document.querySelector('.census-pane');
        if (list && w.document.getElementById('storageBadgeText')?.textContent.includes('Saved')) {
          clearTimeout(timer);
          resolve({ frame, win: w, doc: w.document, restore });
        } else setTimeout(check, 50);
      };
      check();
    });
    document.body.appendChild(frame);
  });

  window.runTests = async () => {
    const out = document.getElementById('results');
    let pass = 0, fail = 0;
    for (const t of tests) {
      const li = document.createElement('li');
      try { await t.fn(); li.textContent = `✓ ${t.name}`; li.className = 'pass'; pass++; }
      catch (e) { li.textContent = `✗ ${t.name}: ${e.message}`; li.className = 'fail'; fail++; }
      out.appendChild(li);
    }
    const sum = document.getElementById('summary');
    sum.textContent = `${pass} passed, ${fail} failed`;
    sum.className = fail ? 'fail' : 'pass';
    document.title = fail ? 'FAIL' : 'PASS';
  };
})();
