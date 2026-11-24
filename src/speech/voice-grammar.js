/**
 * RoundingOS — closed vocabulary for the on-device command engine (Vosk), and the
 * clean-up that turns what Vosk hears ("set dispo s n f", "select room twelve oh four")
 * into the text SpeechEngine.parseVoiceCommand understands ("set dispo SNF", "select room 1204").
 *
 * Pure functions, no DOM, no audio. Patient data only comes in as arguments and never leaves.
 */
const VoiceGrammar = (() => {
  'use strict';

  /* Command phrases parseVoiceCommand understands (see src/speech/speech.js). Vosk joins
     these into a word graph, so it also accepts mixes like "mark labs and vitals done". */
  const COMMAND_PHRASES = [
    'stop listening', 'stop voice', 'mute mic', 'turn off mic',
    'generate sign out', 'open sign out', 'show sign out', 'create sign out',
    'open handoff', 'generate handoff', 'open transfer handoff',
    'select room', 'open room', 'go to room', 'switch to room', 'select bed', 'select patient', 'open patient', 'go to patient',
    'next patient', 'next room', 'previous patient', 'last patient', 'previous room',
    'add task', 'add urgent task', 'add stat task', 'new task', 'add to do',
    'add consult', 'new consult', 'order consult',
    'set vitals', 'update vitals', 'log vitals', 'set labs', 'update labs', 'log labs',
    'set outputs', 'set i and o', 'set last bm', 'set bowel movement', 'set weight', 'log weight',
    'set dispo', 'update dispo', 'set disposition', 'update disposition',
    'set room', 'room', 'dispo to', 'disposition to',
    'add contingency', 'add if then', 'add sign out note', 'add note', 'add clinical note', 'append note',
    'remind me in', 'remind me at', 'set alarm at', 'set reminder in', 'set a reminder in', 'set an alarm at',
    'mark sick', 'mark critical', 'mark unstable', 'mark watcher', 'mark stable', 'mark discharge ready',
    'mark patient sick', 'mark patient stable', 'mark as watcher', 'set stable', 'flag sick', 'flag watcher',
    'search', 'find',
    'check all pre round', 'mark all pre round', 'complete all pre round',
    'check', 'uncheck', 'mark', 'unmark', 'clear', 'done', 'reviewed', 'completed', 'seen',
    'labs', 'outputs', 'i and o', 'bm', 'bowel movement', 'consults', 'vitals', 'telemetry', 'imaging',
    'overnight events', 'meds', 'med rec', 'patient seen', 'note', 'progress note', 'orders', 'family', 'nurse',
    'and', 'to', 'for', 'in', 'at', 'minutes', 'minute', 'hours', 'hour', 'a m', 'p m',
  ];

  /* Values commonly spoken after "set dispo". Vosk drops any word missing from its model. */
  const DISPO_WORDS = [
    'home', 'home with home health', 'home health', 'snf', 's n f', 'skilled nursing', 'rehab', 'acute rehab',
    'inpatient rehab', 'l tach', 'ltach', 'hospice', 'home hospice', 'assisted living', 'pending', 'pending p t',
    'pending placement', 'discharge', 'discharge to', 'discharge today', 'tomorrow', 'unknown',
  ];

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const NUMBER_WORDS = [...ONES, ...TENS.filter(Boolean), 'oh', 'hundred', 'thousand', 'point',
    'a', 'b', 'c', 'd'];

  /** The grammar for Vosk's KaldiRecognizer: a JSON-able list of phrases, ending with "[unk]". */
  function buildCommandGrammar(patients = []) {
    const names = new Set();
    for (const p of patients) {
      for (const w of String(p.name || '').toLowerCase().split(/[^a-z']+/)) if (w.length > 1) names.add(w);
    }
    return [...new Set([...COMMAND_PHRASES, ...DISPO_WORDS, ...NUMBER_WORDS, ...names])].concat('[unk]');
  }

  /* "twelve oh four" → "1204", "four fifteen b" → "415 b", "twenty three" → "23",
     "one hundred twenty" → "120". Other words pass through unchanged. */
  function numberWordsToDigits(text) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const isNum = (w, inRun) => ONES.includes(w) || TENS.indexOf(w) >= 2 || (inRun && (w === 'oh' || w === 'hundred'));
    const out = [];
    let i = 0;
    while (i < words.length) {
      if (!isNum(words[i], false)) { out.push(words[i++]); continue; }
      let digits = '';
      let hundreds = null;
      while (i < words.length && isNum(words[i], true)) {
        const w = words[i];
        const t = TENS.indexOf(w);
        const nextOne = ONES.indexOf(words[i + 1] || '');
        if (w === 'hundred') { hundreds = Number(digits || 1) * 100; digits = ''; i++; }
        else if (w === 'oh') { digits += '0'; i++; }
        else if (t >= 2 && nextOne >= 1 && nextOne <= 9) { digits += String(t * 10 + nextOne); i += 2; }
        else if (t >= 2) { digits += String(t * 10); i++; }
        else { digits += String(ONES.indexOf(w)); i++; }
      }
      out.push(hundreds !== null ? String(hundreds + Number(digits || 0)) : digits);
    }
    return out.join(' ');
  }

  /** Turns Vosk's lower-case words into text parseVoiceCommand reads the same way as typed text. */
  function normalizeSpokenCommand(raw) {
    let t = String(raw || '').toLowerCase().replace(/\[unk\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    t = numberWordsToDigits(t);
    t = t
      .replace(/\b(\d+) (a|p) m\b/g, '$1 $2m')          // "3 p m" → "3 pm"
      .replace(/\b(\d+) (a|b|c|d)\b/g, '$1$2')           // "415 b" → "415b"
      .replace(/\bs n f\b|\bsnf\b/g, 'SNF')
      .replace(/\bl ?tach\b/g, 'LTACH')
      .replace(/\bp t\b/g, 'PT')
      .replace(/\bb p\b/g, 'bp');
    return t.trim();
  }

  /** "set room 12 dispo to SNF" → { room: '12', command: 'set dispo SNF' }; otherwise null.
      The app selects the room first, then runs the rest as a normal command. */
  function splitRoomPrefix(text) {
    const m = String(text || '').match(/^(?:set|update|for)\s+(?:room|bed)\s+(\d{1,4}[a-z]?)\s+(.+)$/i);
    if (!m) return null;
    let rest = m[2].trim();
    rest = rest.replace(/^(dispo|disposition|vitals?|labs?|weights?|outputs?)\s+to\s+/i, '$1 ');
    if (!/^(set|update|log|mark|add|check|uncheck)\b/i.test(rest)) rest = `set ${rest}`;
    return { room: m[1].toLowerCase(), command: rest };
  }

  return { buildCommandGrammar, normalizeSpokenCommand, numberWordsToDigits, splitRoomPrefix, COMMAND_PHRASES };
})();
