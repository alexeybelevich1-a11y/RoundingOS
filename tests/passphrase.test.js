/* HIPAA H4: passphrase strength check for setup, new passphrases and encrypted backups. */
(() => {
  const ok = p => LockScreen.passphraseProblem(p) === '';

  test('passphrase: at least 10 characters', () => {
    assert(!ok('Ab3$efg'), 'short refused');
    assert(/at least 10/.test(LockScreen.passphraseProblem('Ab3$e')), 'says why');
  });

  test('passphrase: common passwords are refused, including leetspeak and added digits', () => {
    ['password123', 'Password2024!', 'P@ssw0rd2024', 'qwertyuiop', 'iloveyou12', 'Welcome2026!', 'roundingos1', 'Hospitalist2026']
      .forEach(p => assert(!ok(p), `${p} refused`));
  });

  test('passphrase: repeated and sequential patterns are refused', () => {
    ['aaaaaaaaaaaa', '1111111111', 'abcabcabcabc', '1234567890', '9876543210', 'abcdefghijk', 'asdfghjkl;', 'Ab1Ab1Ab1Ab1', '1212121299']
      .forEach(p => assert(!ok(p), `${p} refused`));
  });

  test('passphrase: one character class only is refused unless it is long', () => {
    assert(!ok('bluehorsegreen'), 'lowercase only, 14 chars');
    assert(!ok('83750294618'), 'digits only');
    assert(ok('bluehorsegreenlampshade'), 'lowercase only but 23 chars');
  });

  test('passphrase: reasonable passphrases pass', () => {
    [TEST_PASSPHRASE, 'correct horse battery', 'Blue-Lamp-Seven-River', 'tulip Kettle 42 marble']
      .forEach(p => assert(ok(p), `${p} accepted: ${LockScreen.passphraseProblem(p)}`));
  });

  test('passphrase (app): an encrypted backup refuses a weak passphrase', async () => {
    const app = await loadApp(null);
    try {
      app.doc.getElementById('exportEncryptedBtn')?.click();
      await waitFor(() => !app.doc.getElementById('passModal').classList.contains('hidden'), 4000, 'passphrase dialog');
      app.doc.getElementById('passInput').value = 'password123';
      app.doc.getElementById('passConfirm').value = 'password123';
      app.doc.getElementById('passForm').requestSubmit();
      const err = app.doc.getElementById('passError');
      assert(!err.classList.contains('hidden') && /easy to guess/.test(err.textContent), `refused: ${err.textContent}`);
      assert(!app.doc.getElementById('passModal').classList.contains('hidden'), 'dialog stays open');
      app.doc.getElementById('passCancelBtn').click();
    } finally { app.restore(); app.frame.remove(); }
  });

  test('passphrase (app): setup refuses a weak passphrase', async () => {
    const app = await loadApp(null, { stopAtLock: true });
    try {
      const doc = app.doc;
      await waitFor(() => !doc.getElementById('lockSetupStep').classList.contains('hidden'), 4000, 'setup step');
      doc.getElementById('lockSetupPass').value = '1234567890';
      doc.getElementById('lockSetupConfirm').value = '1234567890';
      doc.getElementById('lockSetupStep').requestSubmit();
      const err = doc.getElementById('lockSetupError');
      assert(!err.classList.contains('hidden') && /easy to guess/.test(err.textContent), `refused: ${err.textContent}`);
      assert(!doc.getElementById('lockSetupStep').classList.contains('hidden'), 'still on setup');
    } finally { app.restore(); app.frame.remove(); }
  });
})();
