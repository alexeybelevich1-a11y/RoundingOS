/**
 * RoundingOS — calculators as pure functions.
 *
 * Numbers (or booleans) in, a plain result object out. No DOM access, no state.
 * A missing or invalid required input returns null, never 0.
 * planbuilder.js reads the inputs from the screen, calls Calc.*, and renders the result.
 *
 * Every formula and threshold names its source. Lines marked TODO(clinical) are values
 * the app already used before this file existed, kept unchanged, whose source still needs
 * to be confirmed by a clinician.
 */
const Calc = (() => {
  'use strict';

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const round1 = (v) => parseFloat(v.toFixed(1));

  /**
   * Glucose-corrected sodium and the 24 h correction limit.
   * - Correction 1.6 mEq/L per 100 mg/dL glucose above 100: Katz MA, N Engl J Med 1973;289:843-844.
   * - Correction 2.4 per 100 mg/dL: Hillier TA et al., Am J Med 1999;106:399-403. The app uses it
   *   only when glucose > 400. TODO(clinical): confirm the 400 mg/dL switch point.
   * - 24 h limit 8 mEq/L, or 6 with high osmotic demyelination risk; cf. Verbalis JG et al.,
   *   Am J Med 2013;126(10 Suppl 1):S1-S42. TODO(clinical): confirm these limits against the source.
   * - When glucose > 200 the cap is counted from the corrected Na (CHANGES.md, calculator fixes).
   *   TODO(clinical): confirm the 200 mg/dL threshold.
   * @param {{na:number, glucose?:number|null, highOdsRisk?:boolean}} p  glucose blank = no correction
   * @returns {{na:number, glucose:number, corrected:number, limit:number, cap:number, capFromCorrected:boolean}|null}
   */
  function correctedNa(p) {
    if (!p || !isNum(p.na)) return null;
    if (p.glucose != null && !isNum(p.glucose)) return null;
    const glucose = isNum(p.glucose) ? p.glucose : 100;
    const factor = glucose > 400 ? 2.4 : 1.6;
    const corrected = round1(p.na + Math.max(0, (glucose - 100) / 100) * factor);
    const limit = p.highOdsRisk ? 6 : 8;
    const capFromCorrected = glucose > 200;
    const cap = Math.round((capFromCorrected ? corrected : p.na) + limit);
    return { na: p.na, glucose, corrected, limit, cap, capFromCorrected };
  }

  /**
   * Albumin-corrected calcium: Ca + 0.8 × (4.0 − albumin), mg/dL and g/dL.
   * Source: Payne RB et al., Br Med J 1973;4:643-646 (the 0.8 form as used by MDCalc "Calcium Correction for Hypoalbuminemia").
   * Severity bands > 10.5 mild, >= 12 moderate, > 14 severe. TODO(clinical): needs source.
   * @param {{ca:number, albumin:number}} p
   * @returns {{ca:number, albumin:number, corrected:number, severity:string}|null}
   */
  function correctedCa(p) {
    if (!p || !isNum(p.ca) || !isNum(p.albumin)) return null;
    const corrected = round1(p.ca + 0.8 * (4.0 - p.albumin));
    const severity = corrected > 14 ? 'Severe' : corrected >= 12 ? 'Moderate' : corrected > 10.5 ? 'Mild' : 'Normal';
    return { ca: p.ca, albumin: p.albumin, corrected, severity };
  }

  /**
   * Anion gap, albumin-corrected AG and delta-delta.
   * - AG = Na − (Cl + HCO3), rounded to a whole number.
   * - Corrected AG = AG + 2.5 × (4.0 − albumin): Figge J et al., Crit Care Med 1998;26:1807-1810.
   *   Blank albumin = no correction.
   * - Delta-delta = (corrected AG − 12) / (24 − HCO3), with bands < 0.4, < 0.8, <= 2.0, > 2.0.
   *   TODO(clinical): needs source for the normal AG of 12, HCO3 of 24 and the bands.
   * - AG raised with HCO3 not reduced reads as HAGMA + metabolic alkalosis (CHANGES.md, calculator fixes).
   * @param {{na:number, cl:number, hco3:number, albumin?:number|null}} p
   * @returns {{ag:number, corrAg:number, dd:number|null, interp:string, albuminUsed:boolean}|null}
   */
  function anionGap(p) {
    if (!p || !isNum(p.na) || !isNum(p.cl) || !isNum(p.hco3)) return null;
    if (p.albumin != null && !isNum(p.albumin)) return null;
    const albuminUsed = isNum(p.albumin);
    const alb = albuminUsed ? p.albumin : 4.0;
    const ag = Math.round(p.na - (p.cl + p.hco3));
    const corrAg = round1(ag + 2.5 * (4.0 - alb));
    const dAg = corrAg - 12;
    const dHco3 = 24 - p.hco3;
    let dd = null;
    let interp = 'Normal AG';
    if (dAg > 0 && dHco3 > 0) {
      dd = dAg / dHco3;
      interp = dd < 0.4 ? 'Pure NAGMA' : dd < 0.8 ? 'HAGMA + NAGMA' : dd <= 2.0 ? 'Pure HAGMA' : 'HAGMA + met alk/chronic resp acid';
    } else if (dAg > 0) {
      interp = 'HAGMA + metabolic alkalosis (HCO3 not reduced)';
    }
    return { ag, corrAg, dd, interp, albuminUsed };
  }

  /**
   * CURB-65: one point each for confusion, BUN > 19 mg/dL, RR >= 30, SBP < 90 or DBP <= 60, age >= 65.
   * Source: Lim WS et al., Thorax 2003;58:377-382 (0–1 low risk, 2 moderate, 3–5 severe).
   * Each criterion is a boolean; an absent criterion scores 0.
   * @returns {{score:number, risk:string}|null}
   */
  function curb65(p) {
    if (!p || typeof p !== 'object') return null;
    const score = ['confusion', 'bun', 'rr', 'bp', 'age65'].reduce((acc, k) => acc + (p[k] ? 1 : 0), 0);
    const risk = score <= 1 ? 'Low risk (outpt)' : score === 2 ? 'Moderate (inpatient)' : 'Severe (consider ICU)';
    return { score, risk };
  }

  /**
   * MELD 3.0. Source: Kim WR et al., Gastroenterology 2021;161:1887-1895.
   * Bounds: bilirubin, INR and Cr at least 1.0; Cr at most 3.0, and 3.0 on dialysis (twice in the
   * past week); Na 125–137; albumin 1.5–3.5. Result rounded and kept within 6–40.
   * Cr may be blank when dialysis is true.
   * @param {{bili:number, inr:number, cr?:number, na:number, albumin:number, female?:boolean, dialysis?:boolean}} p
   * @returns {{meld3:number}|null}
   */
  function meld3(p) {
    if (!p) return null;
    const dialysis = Boolean(p.dialysis);
    if (!isNum(p.bili) || !isNum(p.inr) || !isNum(p.na) || !isNum(p.albumin)) return null;
    if (!dialysis && !isNum(p.cr)) return null;
    const bili = Math.max(1.0, p.bili);
    const inr = Math.max(1.0, p.inr);
    const cr = dialysis ? 3.0 : Math.min(3.0, Math.max(1.0, p.cr));
    const na = Math.min(137, Math.max(125, p.na));
    const alb = Math.min(3.5, Math.max(1.5, p.albumin));
    const fem = p.female ? 1 : 0;
    const raw = 1.33 * fem
      + 4.56 * Math.log(bili)
      + 0.82 * (137 - na)
      - 0.24 * (137 - na) * Math.log(bili)
      + 9.09 * Math.log(inr)
      + 11.14 * Math.log(cr)
      + 1.85 * (3.5 - alb)
      - 1.83 * (3.5 - alb) * Math.log(cr)
      + 6;
    return { meld3: Math.min(40, Math.max(6, Math.round(raw))) };
  }

  /**
   * Serum-ascites albumin gradient. >= 1.1 g/dL suggests portal hypertension.
   * Source: Runyon BA et al., Ann Intern Med 1992;117:215-220.
   * @returns {{saag:number, portalHtn:boolean}|null}
   */
  function saag(serumAlb, ascitesAlb) {
    if (!isNum(serumAlb) || !isNum(ascitesAlb)) return null;
    const s = round1(serumAlb - ascitesAlb);
    return { saag: s, portalHtn: s >= 1.1 };
  }

  /**
   * CHA2DS2-VASc. Source: Lip GY et al., Chest 2010;137:263-272.
   * Points: CHF 1, hypertension 1, age >= 75 2, diabetes 1, stroke/TIA/thromboembolism 2,
   * vascular disease 1, age 65–74 1, female 1. Age 65–74 is ignored when age >= 75 is set.
   * Recommendation from the score without the sex point: >= 2 OAC recommended, 1 consider OAC,
   * 0 low risk; cf. Joglar JA et al., 2023 ACC/AHA/ACCP/HRS AF guideline, Circulation 2024;149:e1-e156.
   * Each criterion is a boolean; an absent criterion scores 0.
   * @returns {{score:number, rec:string}|null}
   */
  function cha2ds2vasc(p) {
    if (!p || typeof p !== 'object') return null;
    const age65 = p.age65to74 && !p.age75;
    const score = (p.chf ? 1 : 0) + (p.htn ? 1 : 0) + (p.age75 ? 2 : 0) + (p.diabetes ? 1 : 0)
      + (p.strokeTia ? 2 : 0) + (p.vascular ? 1 : 0) + (age65 ? 1 : 0) + (p.female ? 1 : 0);
    const nonSex = score - (p.female ? 1 : 0);
    const rec = nonSex >= 2 ? 'OAC recommended' : nonSex === 1 ? 'Consider OAC' : 'Low risk (no OAC)';
    return { score, rec };
  }

  /**
   * Weight-based inpatient insulin: TDD = weight × factor, split 50% basal / 50% prandial,
   * prandial given in 3 doses (at least 1 u).
   * Basal-bolus 50/50 split: Umpierrez GE et al. (RABBIT 2), Diabetes Care 2007;30:2181-2186;
   * ADA Standards of Care, section 16 "Diabetes Care in the Hospital".
   * TODO(clinical): needs source for the 0.25 / 0.4 / 0.55 u/kg tiers offered in the UI.
   * Weight under 25 kg is treated as not entered (input guard, not a clinical value).
   * @param {{weightKg:number, factor:number}} p
   * @returns {{wt:number, f:number, tdd:number, basal:number, prandial:number}|null}
   */
  function insulinTdd(p) {
    if (!p || !isNum(p.weightKg) || !(p.weightKg >= 25)) return null;
    if (!isNum(p.factor) || p.factor <= 0) return null;
    const tdd = Math.round(p.weightKg * p.factor);
    const basal = Math.round(tdd * 0.5);
    const prandial = Math.max(1, Math.round((tdd * 0.5) / 3));
    return { wt: p.weightKg, f: p.factor, tdd, basal, prandial };
  }

  /**
   * Steroid-induced hyperglycemia: morning NPH = weight × factor, where the factor is 0.1 u/kg per
   * 10 mg prednisone-equivalent, up to 0.4 u/kg at >= 40 mg.
   * Source: Clore JN, Thurby-Hay L, Endocr Pract 2009;15:469-474.
   * TODO(clinical): needs source for the 4 unit minimum dose.
   * Weight under 25 kg is treated as not entered (input guard, not a clinical value).
   * @param {{weightKg:number, factor:number}} p
   * @returns {{wt:number, f:number, predMg:number, nph:number}|null}
   */
  function steroidNph(p) {
    if (!p || !isNum(p.weightKg) || !(p.weightKg >= 25)) return null;
    if (!isNum(p.factor) || p.factor <= 0) return null;
    const predMg = Math.round(p.factor * 100);
    const nph = Math.max(4, Math.round(p.weightKg * p.factor));
    return { wt: p.weightKg, f: p.factor, predMg, nph };
  }

  return { correctedNa, correctedCa, anionGap, curb65, meld3, saag, cha2ds2vasc, insulinTdd, steroidNph };
})();
