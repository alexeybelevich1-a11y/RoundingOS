/* Phase 2: SpeechEngine.formatMedicalDictation. Protects the phase 4 voice work.
 * Expected text is the app's current behavior, including the fixes listed in CHANGES.md (Dictation). */
const DICTATION = [
  // "colon" and "period" stay words after anatomy or a clinical noun, and become punctuation otherwise
  ['mass in the sigmoid colon', 'mass in the sigmoid colon'],
  ['plan colon start lasix', 'plan: start furosemide'],
  ['refractory period', 'refractory period'],
  ['we will repeat period', 'we will repeat.'],
  // "as part of" is not insulin aspart; "as part" before a dose is
  ['as part of the workup', 'as part of the workup'],
  ['give as part 10 units', 'give aspart 10 units'],
  // "dig" becomes digoxin only before level / toxicity / a number
  ['check dig level tomorrow', 'check digoxin level tomorrow'],
  ['dig toxicity', 'digoxin toxicity'],
  // numbers, ratios and lab shorthand
  ['bp 120 over 80 heart rate 88', 'bp 120/80 HR 88'],
  ['potassium 3 point 4 replete', 'K 3.4 replete'],
  ['sodium 128 creatinine 1 point 2', 'Na 128 Cr 1.2'],
  ['troponin times 2', 'troponin x2'],
  ['lasix 40 mg iv', 'furosemide 40 mg iv'],
  ['new line follow up', '\n follow up'],
];

DICTATION.forEach(([spoken, expected]) => {
  test(`dictation: "${spoken}"`, () => {
    SpeechEngine.setCustomVocab([]);
    assertEqual(SpeechEngine.formatMedicalDictation(spoken), expected, 'formatted');
  });
});

test('dictation: empty input gives an empty string', () => {
  assertEqual(SpeechEngine.formatMedicalDictation(''), '', 'empty');
  assertEqual(SpeechEngine.formatMedicalDictation(null), '', 'null');
});

test('dictation: custom vocab replaces whole words, case-insensitive', () => {
  try {
    SpeechEngine.setCustomVocab([{ heard: 'hosp med', replace: 'Hospital Medicine' }, { heard: '', replace: 'ignored' }]);
    assertEqual(SpeechEngine.formatMedicalDictation('discussed with Hosp Med team'), 'discussed with Hospital Medicine team', 'custom rule');
    assertEqual(SpeechEngine.formatMedicalDictation('hospmed'), 'hospmed', 'only whole words');
  } finally { SpeechEngine.setCustomVocab([]); }
});

test('dictation: custom vocab runs before the built-in fixes', () => {
  try {
    // "zozen" -> "Zosyn" by the custom rule, then the built-in fixes turn Zosyn into the generic name
    SpeechEngine.setCustomVocab([{ heard: 'zozen', replace: 'Zosyn' }]);
    assertEqual(SpeechEngine.formatMedicalDictation('start zozen 4.5 g'), 'start piperacillin-tazobactam 4.5 g', 'custom then built-in');
  } finally { SpeechEngine.setCustomVocab([]); }
});
