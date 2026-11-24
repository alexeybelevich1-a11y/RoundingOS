/* Phase 2: calculator tests for calc.js.
 *
 * Two kinds of test:
 * 1. Rule and regression tests below KNOWN. They check behavior (null on missing input, the published
 *    bounds, the fixes listed in CHANGES.md) by comparing the app with itself, so they need no clinical value.
 * 2. KNOWN: known-answer cases. Each expected value must come from an outside source, never from the app.
 *    A case whose expected value is still null shows as TODO (it does not fail the run) and prints what the
 *    app currently gives. To fill one: enter the inputs in the named reference calculator, type its result
 *    in `expected`, and write where it came from in `source`, e.g. 'MDCalc, entered 2026-11-25'.
 *    All patients here are fictional numbers.
 */
const KNOWN = [
  // MDCalc "Sodium Correction for Hyperglycemia": use the Katz value (1.6) for glucose <= 400 and the
  // Hillier value (2.4) above 400. The cap is the app's rule (corrected Na when glucose > 200, else measured Na, + 8, or + 6 with high ODS risk).
  { calc: 'correctedNa', input: { na: 130, glucose: 100 }, expected: { corrected: null, cap: null }, source: '' },
  { calc: 'correctedNa', input: { na: 128, glucose: 300 }, expected: { corrected: null, cap: null }, source: '' },
  { calc: 'correctedNa', input: { na: 125, glucose: 600 }, expected: { corrected: null, cap: null }, source: '' },
  { calc: 'correctedNa', input: { na: 118, glucose: null, highOdsRisk: true }, expected: { corrected: null, cap: null }, source: '' },

  // MDCalc "Calcium Correction for Hypoalbuminemia" (normal albumin 4.0 g/dL).
  { calc: 'correctedCa', input: { ca: 9.0, albumin: 2.0 }, expected: { corrected: null, severity: null }, source: '' },
  { calc: 'correctedCa', input: { ca: 11.5, albumin: 2.5 }, expected: { corrected: null, severity: null }, source: '' },
  { calc: 'correctedCa', input: { ca: 13.0, albumin: 4.0 }, expected: { corrected: null, severity: null }, source: '' },
  { calc: 'correctedCa', input: { ca: 8.0, albumin: 4.5 }, expected: { corrected: null, severity: null }, source: '' },

  // MDCalc "Anion Gap" (albumin-corrected) and "Delta Gap / Delta Ratio" (normal AG 12, HCO3 24).
  { calc: 'anionGap', input: { na: 140, cl: 100, hco3: 10, albumin: 4.0 }, expected: { ag: null, corrAg: null, dd: null }, source: '' },
  { calc: 'anionGap', input: { na: 135, cl: 100, hco3: 12, albumin: 2.0 }, expected: { ag: null, corrAg: null, dd: null }, source: '' },
  { calc: 'anionGap', input: { na: 140, cl: 112, hco3: 14, albumin: 4.0 }, expected: { ag: null, corrAg: null, dd: null }, source: '' },
  { calc: 'anionGap', input: { na: 138, cl: 102, hco3: 24, albumin: 4.0 }, expected: { ag: null, corrAg: null, dd: null }, source: '' },

  // MDCalc "CURB-65 Score for Pneumonia Severity".
  { calc: 'curb65', input: { confusion: true, age65: true }, expected: { score: null }, source: '' },
  { calc: 'curb65', input: { bun: true, rr: true, bp: true }, expected: { score: null }, source: '' },
  { calc: 'curb65', input: { confusion: true, bun: true, rr: true, bp: true, age65: true }, expected: { score: null }, source: '' },

  // MDCalc "MELD 3.0" (or the OPTN MELD 3.0 calculator).
  { calc: 'meld3', input: { bili: 2.0, inr: 1.5, cr: 1.2, na: 132, albumin: 3.0, female: false }, expected: { meld3: null }, source: '' },
  { calc: 'meld3', input: { bili: 5.0, inr: 2.2, cr: 2.5, na: 128, albumin: 2.5, female: true }, expected: { meld3: null }, source: '' },
  { calc: 'meld3', input: { bili: 0.8, inr: 1.0, cr: 0.8, na: 140, albumin: 4.0, female: false }, expected: { meld3: null }, source: '' },
  { calc: 'meld3', input: { bili: 10, inr: 3.0, na: 124, albumin: 1.8, female: false, dialysis: true }, expected: { meld3: null }, source: '' },

  // MDCalc "CHA2DS2-VASc Score for Atrial Fibrillation Stroke Risk".
  { calc: 'cha2ds2vasc', input: { female: true }, expected: { score: null }, source: '' },
  { calc: 'cha2ds2vasc', input: { htn: true, diabetes: true, age65to74: true }, expected: { score: null }, source: '' },
  { calc: 'cha2ds2vasc', input: { chf: true, htn: true, age75: true, diabetes: true, strokeTia: true, vascular: true, female: true }, expected: { score: null }, source: '' },

  // No MDCalc equivalent: check against your hospital's insulin protocol or the ADA hospital chapter.
  { calc: 'insulinTdd', input: { weightKg: 80, factor: 0.4 }, expected: { tdd: null, basal: null, prandial: null }, source: '' },
  { calc: 'insulinTdd', input: { weightKg: 60, factor: 0.25 }, expected: { tdd: null, basal: null, prandial: null }, source: '' },
  { calc: 'insulinTdd', input: { weightKg: 120, factor: 0.55 }, expected: { tdd: null, basal: null, prandial: null }, source: '' },

  // Clore & Thurby-Hay 2009 (0.1 u/kg NPH per 10 mg prednisone, max 0.4 u/kg), or your hospital protocol.
  { calc: 'steroidNph', input: { weightKg: 70, factor: 0.2 }, expected: { nph: null }, source: '' },
  { calc: 'steroidNph', input: { weightKg: 90, factor: 0.4 }, expected: { nph: null }, source: '' },
  { calc: 'steroidNph', input: { weightKg: 30, factor: 0.1 }, expected: { nph: null }, source: '' },

  // MDCalc "Serum-Ascites Albumin Gradient (SAAG)". Inputs are [serum albumin, ascites albumin].
  { calc: 'saag', input: [3.0, 1.5], expected: { saag: null }, source: '' },
  { calc: 'saag', input: [2.8, 2.0], expected: { saag: null }, source: '' },
];

/* Numbers match when equal at the precision the expected value was written with. */
const sameValue = (actual, expected) => {
  if (typeof expected !== 'number') return actual === expected;
  const dp = (String(expected).split('.')[1] || '').length;
  return typeof actual === 'number' && Math.abs(actual - expected) < 0.5 * 10 ** -dp + 1e-9;
};

KNOWN.forEach((c) => {
  const args = Array.isArray(c.input) ? c.input : [c.input];
  test(`${c.calc} ${JSON.stringify(c.input)}`, () => {
    const r = Calc[c.calc](...args);
    assert(r, 'returned null');
    const fields = Object.keys(c.expected);
    const missing = fields.filter(f => c.expected[f] === null);
    if (missing.length || !c.source) {
      todo(`app gives ${fields.map(f => `${f} ${JSON.stringify(r[f])}`).join(', ')}; fill expected and source`);
    }
    fields.forEach(f => assert(sameValue(r[f], c.expected[f]), `${f}: expected ${c.expected[f]}, got ${r[f]} (source: ${c.source})`));
  });
});

/* ---- Missing or invalid input returns null, never 0 (CHANGES.md C6) ---- */
test('missing or invalid inputs return null', () => {
  const cases = [
    ['correctedNa', [{}]], ['correctedNa', [{ na: NaN }]], ['correctedNa', [{ na: '130' }]], ['correctedNa', [{ na: 130, glucose: NaN }]],
    ['correctedCa', [{ ca: 9 }]], ['correctedCa', [{ albumin: 3 }]],
    ['anionGap', [{ na: 140, cl: 100 }]], ['anionGap', [{ na: 140, hco3: 20 }]], ['anionGap', [{ na: 140, cl: 100, hco3: 20, albumin: NaN }]],
    ['meld3', [{ inr: 1.5, cr: 1, na: 135, albumin: 3 }]], ['meld3', [{ bili: 2, inr: 1.5, na: 135, albumin: 3 }]],
    ['meld3', [{ bili: 2, inr: 1.5, cr: 1, na: 135 }]],
    ['insulinTdd', [{ factor: 0.4 }]], ['insulinTdd', [{ weightKg: 10, factor: 0.4 }]], ['insulinTdd', [{ weightKg: 80 }]],
    ['steroidNph', [{ factor: 0.2 }]], ['steroidNph', [{ weightKg: 80, factor: 0 }]],
    ['saag', [3.0, undefined]], ['saag', [NaN, 1.0]],
  ];
  cases.forEach(([fn, args]) => assertEqual(Calc[fn](...args), null, `${fn}(${JSON.stringify(args)})`));
  ['correctedNa', 'correctedCa', 'anionGap', 'curb65', 'meld3', 'cha2ds2vasc', 'insulinTdd', 'steroidNph']
    .forEach(fn => { assertEqual(Calc[fn](), null, `${fn}()`); assertEqual(Calc[fn](null), null, `${fn}(null)`); });
});

test('blank glucose means no Na correction, blank albumin means no AG correction', () => {
  const na = Calc.correctedNa({ na: 131 });
  assertEqual(na.corrected, 131, 'corrected Na with no glucose');
  assertEqual(na.glucose, 100, 'glucose used');
  const ag = Calc.anionGap({ na: 140, cl: 100, hco3: 20 });
  assertEqual(ag.corrAg, ag.ag, 'corrected AG with no albumin');
  assertEqual(ag.albuminUsed, false, 'albuminUsed');
});

/* ---- Regression cases for the calculator fixes in CHANGES.md ---- */
test('regression: 24 h Na cap counts from corrected Na when glucose > 200', () => {
  const hi = Calc.correctedNa({ na: 124, glucose: 450 });
  assert(hi.capFromCorrected, 'cap from corrected Na at glucose 450');
  assertEqual(hi.cap, Math.round(hi.corrected + hi.limit), 'cap = corrected Na + limit');
  const lo = Calc.correctedNa({ na: 124, glucose: 180 });
  assert(!lo.capFromCorrected, 'cap from measured Na at glucose 180');
  assertEqual(lo.cap, Math.round(124 + lo.limit), 'cap = measured Na + limit');
  assertEqual(Calc.correctedNa({ na: 124, highOdsRisk: true }).limit + 2, Calc.correctedNa({ na: 124 }).limit, 'high ODS risk limit is 2 lower');
});

test('regression: delta-delta labels HAGMA + metabolic alkalosis when HCO3 is not reduced', () => {
  const r = Calc.anionGap({ na: 145, cl: 95, hco3: 28, albumin: 4.0 });
  assertEqual(r.dd, null, 'no ratio when HCO3 is not reduced');
  assertEqual(r.interp, 'HAGMA + metabolic alkalosis (HCO3 not reduced)', 'interpretation');
  assertEqual(Calc.anionGap({ na: 140, cl: 104, hco3: 24, albumin: 4.0 }).interp, 'Normal AG', 'normal gap');
});

/* CHANGES.md also lists "CHA2DS2-VASc no longer counts venous VTE as stroke". That fix lives in the
 * chart pre-fill in planbuilder.js, not in the score, so it is not covered here. */

/* ---- Published rules, checked by comparing the app with itself ---- */
test('MELD 3.0 applies the Kim 2021 bounds', () => {
  const base = { bili: 3, inr: 1.8, cr: 1.5, na: 130, albumin: 2.8, female: false };
  const m = p => Calc.meld3({ ...base, ...p }).meld3;
  assertEqual(m({ bili: 0.4 }), m({ bili: 1.0 }), 'bilirubin floor 1.0');
  assertEqual(m({ inr: 0.9 }), m({ inr: 1.0 }), 'INR floor 1.0');
  assertEqual(m({ cr: 0.6 }), m({ cr: 1.0 }), 'Cr floor 1.0');
  assertEqual(m({ cr: 6.0 }), m({ cr: 3.0 }), 'Cr ceiling 3.0');
  assertEqual(m({ cr: 0.6, dialysis: true }), m({ cr: 3.0 }), 'dialysis counts as Cr 3.0');
  assertEqual(Calc.meld3({ ...base, cr: undefined, dialysis: true }).meld3, m({ cr: 3.0 }), 'Cr may be blank on dialysis');
  assertEqual(m({ na: 118 }), m({ na: 125 }), 'Na floor 125');
  assertEqual(m({ na: 142 }), m({ na: 137 }), 'Na ceiling 137');
  assertEqual(m({ albumin: 1.0 }), m({ albumin: 1.5 }), 'albumin floor 1.5');
  assertEqual(m({ albumin: 4.2 }), m({ albumin: 3.5 }), 'albumin ceiling 3.5');
  assert(m({ female: true }) >= m({ female: false }), 'female adds points');
  const top = Calc.meld3({ bili: 40, inr: 9, cr: 8, na: 110, albumin: 1.0, female: true }).meld3;
  assert(top <= 40, 'result at most 40');
});

test('CHA2DS2-VASc counts age once and the sex point does not drive the recommendation', () => {
  assertEqual(Calc.cha2ds2vasc({ age75: true, age65to74: true }).score, Calc.cha2ds2vasc({ age75: true }).score, 'age counted once');
  assertEqual(Calc.cha2ds2vasc({ female: true }).rec, Calc.cha2ds2vasc({}).rec, 'female alone = same advice as nothing');
  assertEqual(Calc.cha2ds2vasc({}).score, 0, 'no criteria');
});

test('CURB-65 scores no criteria as 0 and counts one point each', () => {
  assertEqual(Calc.curb65({}).score, 0, 'no criteria');
  assertEqual(Calc.curb65({ confusion: true }).score, 1, 'one criterion');
});

test('insulin split and steroid NPH follow their rules', () => {
  const r = Calc.insulinTdd({ weightKg: 100, factor: 0.4 });
  assertEqual(r.basal, Math.round(r.tdd * 0.5), 'basal is half of TDD');
  assertEqual(r.prandial, Math.max(1, Math.round(r.tdd * 0.5 / 3)), 'prandial is the other half in 3 doses');
  const s = Calc.steroidNph({ weightKg: 100, factor: 0.3 });
  assertEqual(s.predMg, 30, 'factor 0.3 = 30 mg prednisone eq');
  assert(Calc.steroidNph({ weightKg: 25, factor: 0.1 }).nph >= 4, '4 unit minimum');
});

test('SAAG >= 1.1 reads as portal hypertension', () => {
  assertEqual(Calc.saag(3.0, 1.9).portalHtn, true, '1.1');
  assertEqual(Calc.saag(3.0, 2.0).portalHtn, false, '1.0');
});
