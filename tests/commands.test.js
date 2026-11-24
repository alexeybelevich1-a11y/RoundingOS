/* Phase 2: SpeechEngine.parseVoiceCommand, one case per command type. Protects the phase 4 voice work.
 * Fictional patients only. */
const CMD_PATIENTS = [
  { id: 'p1', room: '412', name: 'Testpatient Alpha' },
  { id: 'p2', room: '415B', name: 'Fictional Bravo' },
];
const parse = (text) => SpeechEngine.parseVoiceCommand(text, CMD_PATIENTS);
const COMMANDS = [
  ['select room 412', { type: 'SELECT_PATIENT', patientId: 'p1', label: 'Room 412 (Testpatient Alpha)' }],
  ['open patient bravo', { type: 'SELECT_PATIENT', patientId: 'p2', label: 'Fictional Bravo (Rm 415B)' }],
  ['next patient', { type: 'STEP_PATIENT', delta: 1 }],
  ['previous patient', { type: 'STEP_PATIENT', delta: -1 }],
  ['add urgent task recheck potassium at 6', { type: 'ADD_TASK', text: 'recheck potassium at 6', urgent: true, category: 'Lab' }],
  ['add consult cardiology for chest pain', { type: 'ADD_CONSULT', service: 'cardiology', notes: 'chest pain' }],
  // must set dispo, not acuity (CHANGES.md, Voice)
  ['set dispo discharge to SNF', { type: 'SET_FIELD', field: 'disposition', label: 'Disposition', text: 'discharge to SNF' }],
  ['set vitals bp 120 over 80', { type: 'SET_FIELD', field: 'vitalsSummary', label: 'Vitals', text: 'bp 120/80' }],
  ['add contingency if febrile get blood cultures', { type: 'APPEND_FIELD', field: 'contingencies', text: 'if febrile get blood cultures' }],
  ['add note family updated', { type: 'APPEND_FIELD', field: 'clinicalNotes', text: 'family updated' }],
  ['remind me in 2 hours check potassium', { type: 'ADD_REMINDER_REL', minutes: 120, text: 'check potassium' }],
  ['set alarm at 3 pm repeat troponin', { type: 'ADD_REMINDER_AT', timeStr: '15:00', text: 'repeat troponin' }],
  ['mark patient sick', { type: 'SET_PRIORITY', priority: 'sick' }],
  ['mark as watcher', { type: 'SET_PRIORITY', priority: 'watcher' }],
  ['search sepsis', { type: 'SEARCH', query: 'sepsis' }],
  ['check all pre round', { type: 'CHECK_ALL_PREROUND' }],
  ['labs reviewed', { type: 'SET_CHECKLIST', ids: ['labs'], value: true }],
  ['uncheck vitals', { type: 'SET_CHECKLIST', ids: ['vitals'], value: false }],
  ['generate sign out', { type: 'OPEN_SIGNOUT', mode: 'shift' }],
  ['open transfer handoff', { type: 'OPEN_SIGNOUT', mode: 'transfer' }],
  ['stop listening', { type: 'STOP_LISTENING' }],
  ['blah blah blah', { type: 'UNRECOGNIZED', raw: 'blah blah blah' }],
];

COMMANDS.forEach(([spoken, expected]) => {
  test(`command: "${spoken}" → ${expected.type}`, () => {
    assertEqual(JSON.stringify(parse(spoken)), JSON.stringify(expected), 'parsed');
  });
});

test('command: a room that is not on the census is not selected', () => {
  assert(parse('select room 999').type !== 'SELECT_PATIENT', 'unknown room');
});
