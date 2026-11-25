/* Phase 4: encryption (src/core/crypto.js, Store setup/unlock/seal, the lock screen). Fictional data only. */
(() => {
  const DB = 'roundingos-unit';
  const PASS = 'correct horse battery (fictional)';
  const hex = h => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)));

  /* A phase-3 database: 14 fictional test patients and one saved copy, all plain rows. */
  async function phase3Db() {
    Store.close();
    await Dexie.delete(DB);
    await Store.open(DB);
    const state = { ...getDefaultAppState(), patients: getInitialTestPatients(), providerName: 'Dr. Fictional' };
    state.selectedPatientId = state.patients[0].id;
    await Store.save(state);
    await Store.snapshot('before import', { ...state, patients: state.patients.slice(0, 3) });
    return state;
  }

  /* Everything the database holds on disk, as one string. */
  async function rawDump() {
    const d = new Dexie(DB);
    await d.open();
    try {
      const out = {};
      for (const t of d.tables) out[t.name] = await t.toArray();
      return JSON.stringify(out);
    } finally { d.close(); }
  }

  /* ---------- recovery words (BIP-39 test vectors, bitcoin/bips bip-0039 "vectors.json") ---------- */
  test('recovery words: match the BIP-39 reference vectors', async () => {
    assertEqual(BIP39_ENGLISH.length, 2048, 'word list size');
    const vectors = [
      ['00000000000000000000000000000000', 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'],
      ['7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f', 'legal winner thank year wave sausage worth useful legal winner thank yellow'],
      ['80808080808080808080808080808080', 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above'],
      ['ffffffffffffffffffffffffffffffff', 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong']
    ];
    for (const [ent, phrase] of vectors) {
      assertEqual((await RecoveryWords.fromEntropy(hex(ent))).join(' '), phrase, `words for ${ent}`);
      const back = await RecoveryWords.toEntropy(phrase);
      assertEqual([...back].map(b => b.toString(16).padStart(2, '0')).join(''), ent, `entropy for ${phrase}`);
    }
  });

  test('recovery words: typos, wrong count and a bad checksum are refused; spacing and case are not', async () => {
    const { words } = await RecoveryWords.generate();
    assertEqual(words.length, 12, 'twelve words');
    await RecoveryWords.toEntropy(`  ${words.map((w, i) => `${i + 1}. ${w.toUpperCase()}`).join(',\n')} `);
    const fails = async (input, what) => {
      let err = null;
      try { await RecoveryWords.toEntropy(input); } catch (e) { err = e; }
      assert(err, `${what} should be refused`);
    };
    await fails(words.slice(0, 11).join(' '), 'eleven words');
    await fails([...words.slice(0, 11), 'notaword'].join(' '), 'unknown word');
    await fails('abandon '.repeat(12), 'bad checksum');
  });

  /* ---------- backup files ---------- */
  test('backup files: new exports use 600,000 iterations; old 150,000 files still open', async () => {
    const data = { patients: [{ id: 'x1', name: 'Fictional Patient' }] };
    const env = JSON.parse(await BackupCrypto.encryptJson(data, PASS));
    assertEqual(env.iterations, 600000, 'iterations in new files');
    assertEqual(JSON.stringify(await BackupCrypto.decryptJson(env, PASS)), JSON.stringify(data), 'round trip');

    // an old file, made the way crypto.js did before phase 4
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await CryptoUtil.pbkdf2Key(PASS, salt, 150000);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    const old = { format: 'roundingos-encrypted-v1', kdf: 'PBKDF2-HMAC-SHA256', iterations: 150000, cipher: 'AES-256-GCM',
      salt: CryptoUtil.toBase64(salt), iv: CryptoUtil.toBase64(iv), ciphertext: CryptoUtil.toBase64(new Uint8Array(ct)) };
    assertEqual((await BackupCrypto.decryptJson(old, PASS)).patients[0].id, 'x1', 'old file opens');
    let err = null;
    try { await BackupCrypto.decryptJson(old, 'wrong passphrase'); } catch (e) { err = e; }
    assert(err, 'wrong passphrase fails');
  });

  /* ---------- the database ---------- */
  test('encryption: setup seals a phase-3 database; load() gives back the same state', async () => {
    try {
      await phase3Db();
      Store.close(); await Store.open(DB);
      const before = JSON.stringify(await Store.load());
      const snapsBefore = JSON.stringify((await Store.listSnapshots()).map(s => [s.reason, s.patientCount]));
      const { words } = await RecoveryWords.generate();
      const r = await Store.setup(PASS, words);
      assertEqual(r.sealed, 16, 'rows sealed (14 patients, settings, 1 saved copy)');
      assertEqual(JSON.stringify(await Store.load()), before, 'same state after sealing');
      Store.close(); await Store.open(DB);
      assertEqual(Store.status().encrypted, true, 'marked encrypted');
      assertEqual(Store.status().unlocked, false, 'opens locked');
      await Store.unlock(PASS);
      assertEqual(JSON.stringify(await Store.load()), before, 'same state after unlocking');
      assertEqual(JSON.stringify((await Store.listSnapshots()).map(s => [s.reason, s.patientCount])), snapsBefore, 'saved copies listed');
      const snapId = (await Store.listSnapshots())[0].id;
      assertEqual((await Store.restoreSnapshot(snapId)).patients.length, 3, 'saved copy opens');
    } finally { Store.close(); }
  });

  test('encryption: raw rows hold no patient name, room, MRN or note text', async () => {
    try {
      const state = await phase3Db();
      const plainDump = await rawDump();
      const p = state.patients[0];
      // the room as stored inside a plain row's JSON string (a bare "402A" could turn up in base64 by chance)
      const needles = [p.name, p.mrn, `room\\":\\"${p.room}`, 'Dr. Fictional', ...state.patients.map(x => x.name)].filter(Boolean);
      assert(needles.every(n => plainDump.includes(n)), 'the plain database does contain them (sanity check)');
      await Store.setup(PASS, null);
      await Store.save(state); // a normal save after setup
      await Store.snapshot('manual', state);
      const dump = await rawDump();
      needles.forEach(n => assert(!dump.includes(n), `found "${n}" in the stored bytes`));
      assert(!dump.includes('"fmt":"plain"'), 'no plain rows left');
    } finally { Store.close(); }
  });

  test('encryption: a wrong passphrase fails, the recovery words unlock and set a new passphrase', async () => {
    try {
      await phase3Db();
      const { words } = await RecoveryWords.generate();
      await Store.setup(PASS, words);
      Store.close(); await Store.open(DB);
      let err = null;
      try { await Store.unlock('not the passphrase'); } catch (e) { err = e; }
      assertEqual(err && err.message, 'Wrong passphrase', 'wrong passphrase refused');
      assertEqual(Store.status().unlocked, false, 'still locked');

      const other = (await RecoveryWords.generate()).words;
      err = null;
      try { await Store.unlockWithRecovery(other, 'a new passphrase 1'); } catch (e) { err = e; }
      assert(err, 'someone else\'s recovery words are refused');

      await Store.unlockWithRecovery(words.join(' '), 'a new passphrase 1');
      assertEqual((await Store.load()).patients.length, 14, 'data back after recovery');
      Store.close(); await Store.open(DB);
      err = null;
      try { await Store.unlock(PASS); } catch (e) { err = e; }
      assert(err, 'the forgotten passphrase no longer opens it');
      await Store.unlock('a new passphrase 1');
      assertEqual((await Store.load()).patients.length, 14, 'new passphrase works');
    } finally { Store.close(); }
  });

  test('encryption: without recovery words, only the passphrase opens it', async () => {
    try {
      await phase3Db();
      await Store.setup(PASS, null);
      assertEqual(Store.status().hasRecovery, false, 'no recovery slot');
      let err = null;
      try { await Store.unlockWithRecovery('abandon '.repeat(11) + 'about', 'whatever 12345'); } catch (e) { err = e; }
      assert(err, 'recovery refused');
    } finally { Store.close(); }
  });

  test('encryption: locked means no reads and no plain writes', async () => {
    try {
      const state = await phase3Db();
      await Store.setup(PASS, null);
      await Store.lock();
      let err = null;
      try { await Store.load(); } catch (e) { err = e; }
      assert(err && err.name === 'LockedError', 'load refused while locked');
      err = null;
      state.patients[0].subjective = 'Edited while locked (fictional).';
      try { await Store.save(state); } catch (e) { err = e; }
      assert(err && err.name === 'LockedError', 'save refused while locked');
      assert(!(await rawDump()).includes('Edited while locked'), 'nothing written');
    } finally { Store.close(); }
  });

  test('encryption: a failed check after sealing leaves the database as it was', async () => {
    try {
      await phase3Db();
      const before = await rawDump();
      let err = null;
      try {
        await Store.setup(PASS, null, { afterWrite: d => d.table('patients').update(getInitialTestPatients()[0].id, { payload: { fmt: 'aes-gcm-1', iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA' } }) });
      } catch (e) { err = e; }
      assert(err, 'setup should fail');
      assertEqual(await rawDump(), before, 'every row back as it was');
      Store.close(); await Store.open(DB);
      assertEqual(Store.status().encrypted, false, 'not marked encrypted');
      assertEqual((await Store.load()).patients.length, 14, 'still loads');
    } finally { Store.close(); }
  });

  test('encryption: a plain row that missed the pass is read, and sealed on the next unlock', async () => {
    try {
      const state = await phase3Db();
      await Store.setup(PASS, null);
      // simulate a leftover plain row (e.g. written by an old tab)
      const d = new Dexie(DB); await d.open();
      const p = { ...state.patients[1], subjective: 'Leftover plain row (fictional).' };
      await d.table('patients').put({ id: p.id, payload: { fmt: 'plain', json: JSON.stringify(p) } });
      d.close();
      Store.close(); await Store.open(DB);
      await Store.unlock(PASS);
      assertEqual((await Store.load()).patients.find(x => x.id === p.id).subjective, 'Leftover plain row (fictional).', 'read');
      assert(!(await rawDump()).includes('Leftover plain row'), 'sealed on unlock');
    } finally { Store.close(); }
  });

  /* ---------- the app ---------- */
  test('lock screen (app): a phase-3 install shows Setup, and the census is the same afterwards', async () => {
    await Dexie.delete(APP_TEST_DB);
    await withStore(APP_TEST_DB, s => s.save({ ...getDefaultAppState(), patients: getInitialTestPatients() }));
    let app = await loadApp(null, { keepDb: true, stopAtLock: true });
    try {
      assert(!app.doc.getElementById('lockSetupStep').classList.contains('hidden'), 'Setup shows');
      assert(!app.doc.getElementById('lockSetupExisting').classList.contains('hidden'), 'offers a backup first');
      assert(app.doc.getElementById('lockSetupCount').textContent.includes('14'), 'says how many patients');
    } finally { app.restore(); app.frame.remove(); }

    app = await loadApp(null, { keepDb: true });
    try {
      assertEqual(app.doc.documentElement.dataset.storeReady, 'db', 'opens on the database');
      assertEqual(app.recoveryWords && app.recoveryWords.length, 12, 'recovery words shown once');
      assert(app.doc.getElementById('lockModal').classList.contains('hidden'), 'lock screen gone');
      assert(app.doc.getElementById('storageErrorBanner').classList.contains('hidden'), 'no "can\'t store securely" banner');
      assert(app.doc.getElementById('storageBadgeText').textContent.includes('encrypted'), 'badge says encrypted');
      assert(!app.doc.getElementById('storageBadgeText').textContent.includes('not encrypted'), 'badge does not say not encrypted');
      assertEqual(app.doc.getElementById('lockWordsList').children.length, 0, 'words removed from the page');
      const saved = await readAppDb();
      assertEqual(saved.patients.length, 14, 'same census');
    } finally { app.restore(); app.frame.remove(); }
  });

  test('lock screen (app): Lock now hides the census until the passphrase is typed', async () => {
    let app = await loadApp(null);
    try {
      app.doc.getElementById('addTestPatientsBtn').click();
      await waitFor(async () => { const s = await readAppDb(); return s && s.patients.length === 14; }, 6000, '14 saved patients');
      const reloaded = new Promise(r => app.frame.addEventListener('load', r, { once: true }));
      app.doc.getElementById('lockNowBtn').click();
      await reloaded;
      const doc = app.frame.contentWindow.document;
      await waitFor(() => !doc.getElementById('lockModal').classList.contains('hidden'), 4000, 'lock screen');
      assert(!doc.getElementById('lockUnlockStep').classList.contains('hidden'), 'unlock step');
      assert(!doc.getElementById('lockForgotBtn').classList.contains('hidden'), 'recovery offered');
      assertEqual(doc.querySelectorAll('[data-patient-id], .patient-card').length, 0, 'no patients on screen');
      assert(!doc.body.textContent.includes(getInitialTestPatients()[0].name), 'no patient name in the page');

      doc.getElementById('lockPassInput').value = 'wrong passphrase';
      doc.getElementById('lockUnlockStep').requestSubmit();
      await waitFor(() => !doc.getElementById('lockUnlockError').classList.contains('hidden'), 6000, 'error shown');
      assert(!doc.documentElement.dataset.storeReady, 'still locked');
    } finally { app.restore(); app.frame.remove(); }

    app = await loadApp(null, { keepDb: true });
    try {
      assertEqual(app.doc.querySelectorAll('[data-patient-id], .patient-card').length > 0, true, 'census back after unlock');
    } finally { app.restore(); app.frame.remove(); }
  });
  /* HIPAA H8: auto-lock is 5 or 15 minutes; an older saved 30 or 60 becomes 15 */
  test('auto-lock (app): only 5 and 15 minutes are offered, a saved 60 becomes 15 (H8)', async () => {
    await Dexie.delete(APP_TEST_DB);
    await withStore(APP_TEST_DB, s => s.save({ ...getDefaultAppState(), autoLockMinutes: 60 }));
    const app = await loadApp(null, { keepDb: true });
    try {
      app.doc.getElementById('dataModalBtn').click();
      const sel = app.doc.getElementById('setAutoLock');
      assertEqual([...sel.options].map(o => o.value).join(), '5,15', 'choices');
      assertEqual(sel.value, '15', 'a saved 60 shows as 15');
      app.doc.getElementById('saveSettingsBtn').click();
      const saved = await waitFor(async () => { const s = await readAppDb(); return s && s.autoLockMinutes === 15 && s; }, 4000, 'saved as 15');
      assertEqual(saved.autoLockMinutes, 15, 'stored');
    } finally { app.restore(); app.frame.remove(); }
  });
})();
