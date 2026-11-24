/* Phase 5: text clean-up between the on-device command engine (Vosk) and parseVoiceCommand.
 * Pure text in, text out. Fictional patients only. */
(() => {
  const N = VoiceGrammar.normalizeSpokenCommand;
  const CASES = [
    ['set room twelve dispo to s n f', 'set room 12 dispo to SNF'],
    ['select room twelve oh four', 'select room 1204'],
    ['select room four fifteen b', 'select room 415b'],
    ['remind me in two hours check potassium', 'remind me in 2 hours check potassium'],
    ['set alarm at three p m repeat troponin', 'set alarm at 3 pm repeat troponin'],
    ['set vitals b p one twenty over eighty', 'set vitals bp 120 over 80'],
    ['set vitals heart rate one hundred', 'set vitals heart rate 100'],
    ['mark labs reviewed [unk]', 'mark labs reviewed'],
    ['set dispo l tach', 'set dispo LTACH'],
    ['', ''],
  ];
  for (const [heard, want] of CASES) {
    test(`voice grammar: "${heard}" → "${want}"`, () => assertEqual(N(heard), want));
  }

  test('voice grammar: "set room 12 dispo to SNF" selects the room, then sets dispo', () => {
    const split = VoiceGrammar.splitRoomPrefix('set room 12 dispo to SNF');
    assertEqual(split.room, '12');
    assertEqual(split.command, 'set dispo SNF');
    const cmd = SpeechEngine.parseVoiceCommand(split.command, []);
    assertEqual(cmd.type, 'SET_FIELD');
    assertEqual(cmd.field, 'disposition');
    assertEqual(cmd.text, 'SNF');
  });

  test('voice grammar: commands without a room prefix are left alone', () => {
    assertEqual(VoiceGrammar.splitRoomPrefix('set dispo SNF'), null);
    assertEqual(VoiceGrammar.splitRoomPrefix('select room 1204'), null);
  });

  test('voice grammar: the vocabulary has the command words, census first names and [unk] last', () => {
    const g = VoiceGrammar.buildCommandGrammar([{ name: 'Testpatient Alpha' }]);
    assert(g.includes('set dispo') && g.includes('next patient') && g.includes('twelve'), 'command words missing');
    assert(g.includes('alpha') && g.includes('testpatient'), 'census names missing');
    assertEqual(g[g.length - 1], '[unk]');
    assertEqual(new Set(g).size, g.length, 'duplicate entries');
  });
})();
