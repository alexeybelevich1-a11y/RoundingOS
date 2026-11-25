/**
 * RoundingOS — lock screen (phase 4): first-time setup, unlock, and unlock with recovery words.
 *
 * UI only. It collects what the person types and hands it to the callbacks app.js passes in
 * (which call Store.setup / Store.unlock / Store.unlockWithRecovery). A callback that throws
 * shows its message in the dialog, and the person tries again; the returned promise resolves
 * only once a callback succeeds. Markup: #lockModal in index.html.
 *
 * Recovery words can be dropped by passing withRecovery: false to runSetup() (app.js has one
 * switch, RECOVERY_WORDS): setup then skips the words and their check, and says plainly that a
 * forgotten passphrase loses this device's data.
 */
const LockScreen = (() => {
  const $ = id => document.getElementById(id);
  const MIN_PASSPHRASE = 10;
  const STEPS = ['lockUnlockStep', 'lockSetupStep', 'lockWordsStep', 'lockConfirmStep', 'lockRecoverStep'];
  let busy = false;

  function showStep(step, title) {
    $('lockModalTitle').textContent = title;
    STEPS.forEach(id => $(id).classList.toggle('hidden', id !== step));
    $('lockModal').classList.remove('hidden');
    const first = $(step).querySelector('input, textarea');
    if (first) setTimeout(() => first.focus(), 0);
  }

  function hide() {
    $('lockModal').classList.add('hidden');
    // nothing typed stays in the page
    $('lockModal').querySelectorAll('input, textarea').forEach(i => { i.value = ''; });
    $('lockWordsList').textContent = '';
  }

  const isOpen = () => !$('lockModal').classList.contains('hidden');

  function setError(id, msg) {
    const e = $(id);
    e.textContent = msg || '';
    e.classList.toggle('hidden', !msg);
  }

  /*
   * Passphrase strength (HIPAA H4). Someone who copies the database can guess offline, where only
   * the passphrase and the PBKDF2 rounds protect the data, so obvious choices are refused. All
   * local, no network. The list is short and hand-picked: well-known passwords that top public
   * breach lists, plus words an attacker would try first for this app. It is a floor, not a meter.
   */
  const COMMON_PASSWORDS = new Set([
    '1234567890', '12345678910', '0987654321', '1q2w3e4r5t', '1qaz2wsx3edc', 'qwertyuiop', 'asdfghjkl',
    'zxcvbnm', 'qwerty123', 'qwertyuiop123', 'password', 'password1', 'password12', 'password123',
    'password1234', 'passw0rd', 'iloveyou', 'iloveyou1', 'iloveyou12', 'princess', 'sunshine', 'football',
    'baseball', 'basketball', 'superman', 'batman', 'starwars', 'pokemon', 'whatever', 'trustno1',
    'letmein', 'welcome', 'welcome1', 'welcome123', 'admin', 'administrator', 'monkey', 'dragon', 'master',
    'shadow', 'michael', 'jennifer', 'jordan23', 'charlie', 'freedom', 'computer', 'internet', 'samsung',
    'liverpool', 'chelsea', 'arsenal', 'changeme', 'secret', 'abc123', 'abcd1234', 'qazwsx', 'hello',
    'helloworld', 'loveme', 'lovely', 'fuckyou', 'mustang', 'harley', 'ranger', 'soccer', 'hockey',
    'summer', 'winter', 'spring', 'autumn', 'january', 'december', 'blink182', 'myspace1', 'p4ssw0rd',
    'hospital', 'hospitalist', 'medicine', 'doctor', 'physician', 'nurse', 'patient', 'patients',
    'rounding', 'roundingos', 'rounds', 'epic', 'cerner', 'passphrase', 'mypassphrase', 'mypassword',
    'secretpassword', 'supersecret', 'opensesame', 'letmeinnow', 'iloveyoutoo', 'qwertyqwerty'
  ]);
  const KEYBOARD_RUNS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz', '1qaz2wsx3edc4rfv5tgb', 'qazwsxedcrfvtgbyhnujmikolp'];
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };

  /** True when s is one short unit repeated ("abcabcabc", "1111111111"). */
  function isRepeated(s) {
    for (let n = 1; n <= s.length / 2; n++) {
      if (s.length % n === 0 && s.slice(0, n).repeat(s.length / n) === s) return true;
    }
    return false;
  }

  /** True when s is a straight run up or down ("123456789", "zyxwvu"), or a piece of a keyboard row. */
  function isSequential(s) {
    if (s.length < 3) return false;
    const step = s.charCodeAt(1) - s.charCodeAt(0);
    if (Math.abs(step) === 1 && [...s].every((c, i) => i === 0 || s.charCodeAt(i) - s.charCodeAt(i - 1) === step)) return true;
    return KEYBOARD_RUNS.some(row => row.includes(s) || [...row].reverse().join('').includes(s));
  }

  /** Returns '' if the passphrase is acceptable, otherwise why not. Same rule for setup and backups. */
  function passphraseProblem(pass) {
    const p = String(pass || '');
    if (p.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
    const easy = 'Too easy to guess (a common password or a simple pattern). Try a few unrelated words.';
    const lower = p.toLowerCase();
    const compact = lower.replace(/\s+/g, '');
    const lettersOnly = compact.replace(/[^a-z]/g, '');
    // numbers/symbols swapped in for letters ("p@ssw0rd"), after dropping a trailing "2024!"
    const leet = [...compact.replace(/[^a-z]+$/, '')].map(c => LEET[c] || c).join('').replace(/[^a-z]/g, '');
    if ([compact, lettersOnly, leet].some(v => v && COMMON_PASSWORDS.has(v))) return easy;
    if (isRepeated(compact) || isSequential(compact)) return easy;
    // the same few characters over and over ("aaaaabbbbb", "1212121299")
    if (new Set(compact).size <= 3) return easy;
    // one character class only (all lowercase letters, all digits, …), unless it is long
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(re => re.test(p)).length;
    if (classes < 2 && p.length < 20) return 'Mix in another kind of character (a space, capital, number or symbol), or make it at least 20 characters.';
    return '';
  }

  function checkNewPassphrase(pass, confirmValue) {
    const problem = passphraseProblem(pass);
    if (problem) return problem;
    if (pass !== confirmValue) return 'Passphrases do not match.';
    return '';
  }

  /** Runs work() with the button showing `label`; returns the error message, or '' on success. */
  async function withBusy(button, label, work) {
    if (busy) return 'busy';
    busy = true;
    const old = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { await work(); return ''; } catch (e) { return (e && e.message) || 'Something went wrong'; }
    finally { busy = false; button.disabled = false; button.textContent = old; }
  }

  /** Wires one form's submit for the life of a run; returns a function that unwires it. */
  function onSubmit(formId, handler) {
    const form = $(formId);
    const fn = e => { e.preventDefault(); handler(); };
    form.addEventListener('submit', fn);
    return () => form.removeEventListener('submit', fn);
  }

  function onClick(id, handler) {
    const b = $(id);
    b.addEventListener('click', handler);
    return () => b.removeEventListener('click', handler);
  }

  /* ---------- first-time setup ---------- */
  /**
   * opts: { withRecovery, patientCount, onExportBackup (or null), complete(passphrase, words|null) }
   * Steps: passphrase twice → (recovery words → type 3 of them back) → complete().
   */
  function runSetup(opts) {
    return new Promise(resolve => {
      const unbind = [];
      let passphrase = '';
      let words = null;
      let picks = [];

      $('lockSetupExisting').classList.toggle('hidden', !opts.patientCount);
      $('lockSetupCount').textContent = opts.patientCount === 1 ? '1 patient' : `${opts.patientCount} patients`;
      $('lockSetupBackupBtn').classList.toggle('hidden', !opts.onExportBackup);
      $('lockSetupNoRecovery').classList.toggle('hidden', Boolean(opts.withRecovery));
      $('lockSetupNextBtn').textContent = opts.withRecovery ? 'Next' : 'Encrypt and continue';
      setError('lockSetupError', '');
      showStep('lockSetupStep', 'Protect this device');

      const finish = async button => {
        const msg = await withBusy(button, 'Encrypting…', () => opts.complete(passphrase, words));
        if (msg === 'busy') return false;
        if (msg) return msg;
        unbind.forEach(f => f());
        passphrase = '';
        words = null;
        hide();
        resolve();
        return true;
      };

      const showWords = () => {
        const ol = $('lockWordsList');
        ol.textContent = '';
        words.forEach(w => { const li = document.createElement('li'); li.textContent = w; ol.appendChild(li); });
        showStep('lockWordsStep', 'Recovery words');
      };

      unbind.push(onClick('lockSetupBackupBtn', () => { if (opts.onExportBackup) opts.onExportBackup(); }));

      unbind.push(onSubmit('lockSetupStep', async () => {
        const pass = $('lockSetupPass').value;
        const msg = checkNewPassphrase(pass, $('lockSetupConfirm').value);
        setError('lockSetupError', msg);
        if (msg) return;
        passphrase = pass;
        if (!opts.withRecovery) {
          const res = await finish($('lockSetupNextBtn'));
          if (typeof res === 'string') setError('lockSetupError', res);
          return;
        }
        if (!words) words = (await RecoveryWords.generate()).words;
        showWords();
      }));

      unbind.push(onSubmit('lockWordsStep', () => {
        // three different positions, in order
        const all = words.map((_, i) => i);
        picks = [];
        while (picks.length < 3) picks.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
        picks.sort((a, b) => a - b);
        picks.forEach((n, i) => {
          $(`lockConfirmLabel${i}`).textContent = `Word #${n + 1}`;
          $(`lockConfirmWord${i}`).value = '';
        });
        setError('lockConfirmError', '');
        showStep('lockConfirmStep', 'Check your recovery words');
      }));

      unbind.push(onClick('lockConfirmBackBtn', showWords));

      unbind.push(onSubmit('lockConfirmStep', async () => {
        const wrong = picks.filter((n, i) => RecoveryWords.normalize($(`lockConfirmWord${i}`).value)[0] !== words[n]);
        if (wrong.length) {
          setError('lockConfirmError', `Word #${wrong[0] + 1} does not match. Check your list, or go back to see the words again.`);
          return;
        }
        const res = await finish($('lockConfirmFinishBtn'));
        if (typeof res === 'string') setError('lockConfirmError', res);
      }));
    });
  }

  /* ---------- unlock ---------- */
  /** opts: { hasRecovery, unlock(passphrase), recover(words, newPassphrase) } */
  function runUnlock(opts) {
    return new Promise(resolve => {
      const unbind = [];
      const done = () => { unbind.forEach(f => f()); hide(); resolve(); };
      const showUnlock = () => {
        setError('lockUnlockError', '');
        $('lockForgotBtn').classList.toggle('hidden', !opts.hasRecovery);
        showStep('lockUnlockStep', 'RoundingOS is locked');
      };
      showUnlock();

      unbind.push(onSubmit('lockUnlockStep', async () => {
        const pass = $('lockPassInput').value;
        if (!pass) { setError('lockUnlockError', 'Enter the passphrase.'); return; }
        const msg = await withBusy($('lockUnlockBtn'), 'Unlocking…', () => opts.unlock(pass));
        if (msg === 'busy') return;
        if (msg) { setError('lockUnlockError', msg); $('lockPassInput').select(); return; }
        done();
      }));

      unbind.push(onClick('lockForgotBtn', () => {
        setError('lockRecoverError', '');
        showStep('lockRecoverStep', 'Use recovery words');
      }));
      unbind.push(onClick('lockRecoverBackBtn', showUnlock));

      unbind.push(onSubmit('lockRecoverStep', async () => {
        const pass = $('lockRecoverPass').value;
        const msg = checkNewPassphrase(pass, $('lockRecoverConfirm').value);
        if (msg) { setError('lockRecoverError', msg); return; }
        const err = await withBusy($('lockRecoverBtn'), 'Unlocking…', () => opts.recover($('lockRecoverWords').value, pass));
        if (err === 'busy') return;
        if (err) { setError('lockRecoverError', err); return; }
        done();
      }));
    });
  }

  /** Shown on the unlock screen when a reminder comes due while locked (no patient details). */
  function setReminderNote(show) {
    $('lockReminderNote').classList.toggle('hidden', !show);
  }

  return { runSetup, runUnlock, hide, isOpen, setReminderNote, MIN_PASSPHRASE, passphraseProblem };
})();
