/* VTE prophylaxis and discharge planning in the progress note, sign-out and UI. Fictional data only. */
(() => {
  const REF_NOW = new Date(2026, 10, 24, 14, 30, 0); // Nov 24, 2026 local

  function basePatient(extra = {}) {
    return {
      id: 'pt-vte-test',
      room: '401A',
      name: 'Fictional Tester',
      age: 70,
      sex: 'F',
      hospitalDay: 2,
      codeStatus: 'Full Code',
      allergies: 'NKDA',
      priority: 'stable',
      primaryDx: 'Community-Acquired Pneumonia',
      oneLiner: '70F admitted with CAP, improving on ceftriaxone.',
      subjective: 'Breathing easier overnight.',
      vitalsSummary: 'Afebrile, SpO2 96% RA',
      ioSummary: 'Balanced',
      lastBm: 'Today',
      weightSummary: '68.0 kg',
      physicalExam: 'Pulm: mild RLL crackles.',
      labsSummary: 'WBC 9.1, Cr 0.9',
      imagingSummary: 'CXR RLL infiltrate',
      assessmentPlan: '# CAP\n- Continue ceftriaxone.',
      vtePpx: '',
      dcWhen: '',
      dcDate: '',
      dcPlace: '',
      disposition: '',
      tasks: [],
      consults: [],
      ...extra
    };
  }

  test('progress note: leaves *** blanks when VTE prophylaxis and discharge plan are unset', () => {
    const st = getDefaultAppState();
    const note = ProgressNoteEngine.buildProgressNote(st, basePatient(), { now: REF_NOW });
    assert(note.includes('- VTE Prophylaxis: ***'), 'VTE blank');
    assert(note.includes('- Discharge Plan: Anticipated *** | Destination: ***'), 'discharge plan blanks');
    assert(!note.includes('- Disposition / Barriers:'), 'no extra barriers line when empty');
  });

  test('progress note: formats each VTE prophylaxis and therapeutic anticoagulation option', () => {
    const st = getDefaultAppState();
    const cases = [
      ['enoxaparin', 'Pharmacologic — Enoxaparin (SC)'],
      ['heparin', 'Pharmacologic — Heparin (SC)'],
      ['doac', 'On therapeutic anticoagulation (DOAC)'],
      ['warfarin', 'On therapeutic anticoagulation (Warfarin)'],
      ['therap-heparin', 'On therapeutic anticoagulation (Heparin / Enoxaparin)'],
      ['mechanical', 'Mechanical prophylaxis only (SCDs)'],
      ['ambulatory', 'Ambulatory / low risk — pharmacologic prophylaxis not indicated']
    ];
    for (const [value, expected] of cases) {
      const note = ProgressNoteEngine.buildProgressNote(st, basePatient({ vtePpx: value }), { now: REF_NOW });
      assert(note.includes(`- VTE Prophylaxis: ${expected}`), `expected ${expected} for ${value}`);
    }
  });

  test('progress note: T, T+1, T+2 populate today and planned dates; >T+2 and TBD format cleanly', () => {
    const st = getDefaultAppState();
    const todayIso = ProgressNoteEngine.computeDcDateForWhen('T', REF_NOW);
    const t1Iso = ProgressNoteEngine.computeDcDateForWhen('T+1', REF_NOW);
    const t2Iso = ProgressNoteEngine.computeDcDateForWhen('T+2', REF_NOW);
    assertEqual(todayIso, '2026-11-24', 'T date');
    assertEqual(t1Iso, '2026-11-25', 'T+1 date');
    assertEqual(t2Iso, '2026-11-26', 'T+2 date');
    assertEqual(ProgressNoteEngine.computeDcDateForWhen('TBD', REF_NOW), '', 'TBD has no date');

    const todayPretty = ProgressNoteEngine.formatIsoDate('2026-11-24');
    const t1Pretty = ProgressNoteEngine.formatIsoDate('2026-11-25');
    const t2Pretty = ProgressNoteEngine.formatIsoDate('2026-11-26');
    const t4Pretty = ProgressNoteEngine.formatIsoDate('2026-11-28');

    const nToday = ProgressNoteEngine.buildProgressNote(
      st,
      basePatient({ vtePpx: 'enoxaparin', dcWhen: 'T', dcDate: todayIso, dcPlace: 'Home' }),
      { now: REF_NOW }
    );
    assert(
      nToday.includes(`- Discharge Plan: Anticipated Today (${todayPretty}) | Destination: Home`),
      `T (Today) line: ${nToday}`
    );

    const nT1 = ProgressNoteEngine.buildProgressNote(
      st,
      basePatient({ vtePpx: 'doac', dcWhen: 'T+1', dcDate: t1Iso, dcPlace: 'Home with services', disposition: 'Needs home O2' }),
      { now: REF_NOW }
    );
    assert(
      nT1.includes(`- Discharge Plan: Anticipated ${t1Pretty} (T+1) | Destination: Home with services`),
      `T+1 line: ${nT1}`
    );
    assert(nT1.includes('- Disposition / Barriers: Needs home O2'), 'barriers line preserved');

    const nT2 = ProgressNoteEngine.buildProgressNote(
      st,
      basePatient({ vtePpx: 'warfarin', dcWhen: 'T+2', dcDate: t2Iso, dcPlace: 'STR' }),
      { now: REF_NOW }
    );
    assert(
      nT2.includes(`- Discharge Plan: Anticipated ${t2Pretty} (T+2) | Destination: STR (Short-Term Rehab / SNF)`),
      `T+2 STR line: ${nT2}`
    );

    const nGt2NoDate = ProgressNoteEngine.buildProgressNote(
      st,
      basePatient({ vtePpx: 'heparin', dcWhen: '>T+2', dcDate: '', dcPlace: 'Acute Rehab (IRF)' }),
      { now: REF_NOW }
    );
    assert(
      nGt2NoDate.includes('- Discharge Plan: Anticipated >T+2 | Destination: Acute Rehab (IRF)'),
      `>T+2 without date: ${nGt2NoDate}`
    );

    const nGt2Date = ProgressNoteEngine.buildProgressNote(
      st,
      basePatient({ vtePpx: 'heparin', dcWhen: '>T+2', dcDate: '2026-11-28', dcPlace: 'LTACH' }),
      { now: REF_NOW }
    );
    assert(
      nGt2Date.includes(`- Discharge Plan: Anticipated ${t4Pretty} (>T+2) | Destination: LTACH`),
      `>T+2 with planned date: ${nGt2Date}`
    );

    const nTbd = ProgressNoteEngine.buildProgressNote(
      st,
      basePatient({ vtePpx: 'mechanical', dcWhen: 'TBD', dcDate: '', dcPlace: 'Hospice' }),
      { now: REF_NOW }
    );
    assert(
      nTbd.includes('- Discharge Plan: Anticipated TBD | Destination: Hospice'),
      `TBD Hospice line: ${nTbd}`
    );
  });

  test('progress note (app): selecting VTE ppx and T+1 / STR updates planned date, note preview and Summary tab', async () => {
    const pt = basePatient({ id: 'pt-ui-1' });
    const app = await loadApp({ ...getDefaultAppState(), patients: [pt], selectedPatientId: pt.id });
    try {
      const vteSel = app.doc.getElementById('rdVtePpx');
      const whenSel = app.doc.getElementById('rdDcWhen');
      const dateInp = app.doc.getElementById('rdDcDate');
      const placeSel = app.doc.getElementById('rdDcPlace');
      const preview = app.doc.getElementById('rightNotePreview');

      vteSel.value = 'doac';
      vteSel.dispatchEvent(new app.win.Event('change'));

      whenSel.value = 'T+1';
      whenSel.dispatchEvent(new app.win.Event('change'));

      placeSel.value = 'STR';
      placeSel.dispatchEvent(new app.win.Event('change'));

      const expectedIso = ProgressNoteEngine.computeDcDateForWhen('T+1');
      assertEqual(dateInp.value, expectedIso, 'planned date populated on T+1');
      assertEqual(app.doc.getElementById('ngStateDispo').textContent, '✓', 'dispo group marked complete');
      assertEqual((preview.value.match(/\*\*\*/g) || []).length, 0, 'zero *** blanks left when all fields filled');
      assert(preview.value.includes('On therapeutic anticoagulation (DOAC)'), 'note includes DOAC');
      assert(preview.value.includes('(T+1)'), 'note includes T+1 planned date');
      assert(preview.value.includes('STR (Short-Term Rehab / SNF)'), 'note includes STR');

      // Switch to Summary tab and confirm controls stay synced
      app.doc.querySelector('[data-pt-tab="plan"]').click();
      assertEqual(app.doc.getElementById('fVtePpx').value, 'doac', 'Summary VTE synced');
      assertEqual(app.doc.getElementById('fDcWhen').value, 'T+1', 'Summary When synced');
      assertEqual(app.doc.getElementById('fDcDate').value, expectedIso, 'Summary Planned date synced');
      assertEqual(app.doc.getElementById('fDcPlace').value, 'STR', 'Summary Place synced');

      // Selecting T (Today) from Summary updates date to today
      const fWhen = app.doc.getElementById('fDcWhen');
      fWhen.value = 'T';
      fWhen.dispatchEvent(new app.win.Event('change'));
      const todayIso = ProgressNoteEngine.computeDcDateForWhen('T');
      assertEqual(app.doc.getElementById('rdDcDate').value, todayIso, 'Note dock date updated to today');
      assert(preview.value.includes('Today ('), 'preview reflects Today');
    } finally {
      app.restore();
      app.frame.remove();
    }
  });
})();
