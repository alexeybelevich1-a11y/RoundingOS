/**
 * Hospitalist Workflow Tracker — Data Schema & 14 Realistic Test Patients
 * All patient records below are 100% fictional test data for initial workflow setup.
 */

const CHECKLIST_DEFINITIONS = {
  preround: [
    { id: 'overnight', label: 'Overnight Events', short: 'O/N', hint: 'Nursing notes, PRNs, cross-cover calls' },
    { id: 'vitals', label: 'Vitals & Tele', short: 'Vit', hint: '24h trends, O2 requirement, rhythm' },
    { id: 'outputs', label: 'Outputs / I&Os', short: 'I&O', hint: 'Urine output, drains, stool, net fluid balance' },
    { id: 'bm', label: 'Last BM', short: 'BM', hint: 'Last bowel movement date & bowel regimen' },
    { id: 'labs', label: 'Reviewed Labs', short: 'Labs', hint: 'CBC, BMP/CMP, coags, micro, biomarkers' },
    { id: 'imaging', label: 'Imaging / Micro', short: 'Img', hint: 'Radiology reads, ECGs, pending cultures' },
    { id: 'consults', label: 'Consult Notes', short: 'Cons', hint: 'Specialist notes & recs reconciled' },
    { id: 'meds', label: 'MAR / Med Rec', short: 'Med', hint: 'Abx day count, DVT/GI ppx, home meds' }
  ],
  encounter: [
    { id: 'seen', label: 'Patient Seen', short: 'Seen', hint: 'Bedside exam & plan discussed with patient' },
    { id: 'orders', label: 'Orders Placed', short: 'Ord', hint: 'Labs, meds, consults, diet, dispo orders' },
    { id: 'note', label: 'Note Written', short: 'Note', hint: 'Progress note / H&P / DC summary signed' },
    { id: 'family', label: 'Family / RN Sync', short: 'Sync', hint: 'Nurse loop closed & family updated if needed' }
  ]
};

const PRIORITY_META = {
  sick: {
    key: 'sick',
    label: 'Sick / Critical',
    shortLabel: 'SICK',
    rank: 1,
    description: 'Unstable or high risk of decompensation — see FIRST'
  },
  watcher: {
    key: 'watcher',
    label: 'Watcher',
    shortLabel: 'WATCHER',
    rank: 2,
    description: 'Active issues requiring close monitoring — see EARLY'
  },
  discharge: {
    key: 'discharge',
    label: 'Discharge Ready',
    shortLabel: 'D/C TODAY',
    rank: 3,
    description: 'Target discharge today — prioritize orders & barriers'
  },
  stable: {
    key: 'stable',
    label: 'Stable',
    shortLabel: 'STABLE',
    rank: 4,
    description: 'Clinically stable, routine progression'
  }
};

const TASK_CATEGORIES = [
  'Lab',
  'Consult',
  'Imaging',
  'Order',
  'Dispo',
  'Family',
  'Procedure',
  'General'
];

const VTE_PPX_OPTIONS = [
  { value: 'enoxaparin', label: 'Enoxaparin (SC)', noteText: 'Pharmacologic — Enoxaparin (SC)' },
  { value: 'heparin', label: 'Heparin (SC)', noteText: 'Pharmacologic — Heparin (SC)' },
  { value: 'doac', label: 'Therapeutic AC — DOAC', noteText: 'On therapeutic anticoagulation (DOAC)' },
  { value: 'warfarin', label: 'Therapeutic AC — Warfarin', noteText: 'On therapeutic anticoagulation (Warfarin)' },
  { value: 'therap-heparin', label: 'Therapeutic AC — Heparin / Enoxaparin', noteText: 'On therapeutic anticoagulation (Heparin / Enoxaparin)' },
  { value: 'mechanical', label: 'Mechanical / SCDs only', noteText: 'Mechanical prophylaxis only (SCDs)' },
  { value: 'ambulatory', label: 'Ambulatory / none needed', noteText: 'Ambulatory / low risk — pharmacologic prophylaxis not indicated' }
];

const DC_WHEN_OPTIONS = [
  { value: 'T', label: 'T (Today)', offsetDays: 0 },
  { value: 'T+1', label: 'T+1', offsetDays: 1 },
  { value: 'T+2', label: 'T+2', offsetDays: 2 },
  { value: '>T+2', label: '>T+2', offsetDays: null },
  { value: 'TBD', label: 'TBD', offsetDays: null }
];

const DC_PLACE_OPTIONS = [
  { value: 'Home', label: 'Home' },
  { value: 'Home with services', label: 'Home with services' },
  { value: 'STR', label: 'STR (Short-Term Rehab / SNF)' },
  { value: 'Acute Rehab (IRF)', label: 'Acute Rehab (IRF)' },
  { value: 'ALF', label: 'Assisted Living (ALF)' },
  { value: 'LTACH', label: 'LTACH' },
  { value: 'Hospice', label: 'Hospice' }
];

function createEmptyChecklist() {
  const result = {};
  [...CHECKLIST_DEFINITIONS.preround, ...CHECKLIST_DEFINITIONS.encounter].forEach(item => {
    result[item.id] = false;
  });
  return result;
}

function getInitialTestPatients() {
  const now = new Date().toISOString();
  const localDateOffset = days => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return [
    {
      id: 'pt-01',
      room: '402A',
      name: 'Margaret Holloway',
      age: 74,
      sex: 'F',
      mrn: 'TEST-10421',
      hospitalDay: 2,
      codeStatus: 'Full Code',
      allergies: 'Penicillin (rash)',
      priority: 'sick',
      primaryDx: 'Urosepsis / Acute Hypoxic Respiratory Failure',
      oneLiner: '74F w/ DM2, CKD3b admitted for E. coli urosepsis; overnight tachycardia to 118 and new 4L NC O2 req after 2L crystalloid.',
      vitalsSummary: 'T 38.4°C | HR 114 | BP 96/58 (MAP 71) | RR 22 | SpO2 93% on 4L NC',
      ioSummary: 'In: 2.8L / Out: 0.9L (Net +1.9L) | UOP 35 mL/hr',
      weightSummary: '71.8 kg (+1.6 kg from admit)',
      labsSummary: 'WBC 17.4 ↑, Cr 2.1 (base 1.4), Lactate 2.8 → pending repeat, K 4.3, Procal 8.2',
      clinicalNotes: 'Started cefepime + vancomycin yesterday; urine cx preliminary GNRs. Borderline MAPs overnight — monitor closely for pressor need / ICU upgrade. CXR ordered for mild bibasilar crackles.',
      contingencies: 'IF MAP < 65 or SBP < 90 despite 500 mL LR bolus -> call ICU for pressor eval & transfer. IF O2 req > 6L NC -> obtain ABG, stat CXR, consider BiPAP/HFNC.',
      vtePpx: 'heparin',
      dcWhen: 'TBD',
      dcDate: '',
      dcPlace: '',
      disposition: 'Acute medical care; high risk for stepdown/ICU transfer',
      checklist: {
        labs: true, outputs: true, bm: false, consults: false,
        vitals: true, imaging: false, overnight: true, meds: true,
        seen: false, note: false, orders: false, family: false
      },
      consults: [
        { id: 'c-101', service: 'Infectious Disease', status: 'Pending', notes: 'Consulted for ESBL risk given prior hospitalizations' },
        { id: 'c-102', service: 'Critical Care', status: 'Aware / Curbside', notes: 'Low threshold for MICU transfer if lactate rises' }
      ],
      tasks: [
        { id: 't-101', text: 'Follow up repeat lactate & BMP at 10:00', category: 'Lab', urgent: true, done: false, createdAt: now },
        { id: 't-102', text: 'Review portable CXR for volume overload vs PNA', category: 'Imaging', urgent: true, done: false, createdAt: now },
        { id: 't-103', text: 'Check blood & urine culture susceptibilities', category: 'Lab', urgent: false, done: false, createdAt: now },
        { id: 't-104', text: 'Update daughter (POA) regarding tenuous status', category: 'Family', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-02',
      room: '405B',
      name: 'Robert Castellano',
      age: 68,
      sex: 'M',
      mrn: 'TEST-10422',
      hospitalDay: 3,
      codeStatus: 'Full Code',
      allergies: 'NKDA',
      priority: 'sick',
      primaryDx: 'Acute Decompensated HFrEF (EF 25%) / Cardiorenal',
      oneLiner: '68M w/ ICM (EF 25%), ICD, CKD3 admitted w/ volume overload; poor response to Lasix 80mg IV BID, Cr bumping to 2.4.',
      vitalsSummary: 'T 36.7°C | HR 92 (AFib) | BP 102/64 | RR 20 | SpO2 94% on 3L NC',
      ioSummary: 'In: 1.1L / Out: 0.85L (Net +250 mL) — subtherapeutic diuresis',
      weightSummary: '96.4 kg (+0.3 kg vs yesterday; goal 89 kg)',
      labsSummary: 'Cr 2.4 (up from 1.9), K 3.4, Mg 1.6, BNP 2480, Na 131',
      clinicalNotes: 'Still JVD to jaw, 2+ pitting edema to knees. Cardiology recommends Lasix drip 10 mg/hr + metolazone 5 mg PO prior to AM dose. Strict 1.5L fluid restriction.',
      contingencies: 'IF UOP < 100 mL/hr after Lasix drip start -> escalate drip per Cards protocol. IF symptomatic hypotension (SBP < 85) -> hold afterload reducers, check lactate/ScvO2, notify Cards.',
      vtePpx: 'heparin',
      dcWhen: '>T+2',
      dcDate: '',
      dcPlace: 'Home with services',
      disposition: 'Inpatient diuresis; likely 3-4 more days',
      checklist: {
        labs: true, outputs: true, bm: true, consults: true,
        vitals: true, imaging: true, overnight: true, meds: false,
        seen: true, note: false, orders: true, family: false
      },
      consults: [
        { id: 'c-201', service: 'Cardiology (HF)', status: 'Recs Reviewed', notes: 'Start Bumex/Lasix infusion, replete K > 4.0 and Mg > 2.0' }
      ],
      tasks: [
        { id: 't-201', text: 'Replete KCl 40 mEq & MgSO4 2g IV; recheck BMP at 16:00', category: 'Order', urgent: true, done: false, createdAt: now },
        { id: 't-202', text: 'Verify 6-hour urine output after starting Lasix gtt', category: 'General', urgent: true, done: false, createdAt: now },
        { id: 't-203', text: 'Hold lisinopril while Cr trending up', category: 'Order', urgent: false, done: true, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-03',
      room: '408A',
      name: 'David Kowalski',
      age: 61,
      sex: 'M',
      mrn: 'TEST-10423',
      hospitalDay: 1,
      codeStatus: 'Full Code',
      allergies: 'Sulfonamides',
      priority: 'sick',
      primaryDx: 'Upper GI Bleed (Melena) — Pending EGD',
      oneLiner: '61M w/ NSAID use for OA, cirrhosis (Child A) admitted overnight w/ melena & Hgb drop 11.2 -> 7.6; NPO for urgent EGD.',
      vitalsSummary: 'T 36.8°C | HR 106 | BP 104/62 | RR 18 | SpO2 98% RA',
      ioSummary: 'In: 1.5L / Out: 0.7L | 2 dark melenic stools overnight',
      weightSummary: '84.0 kg (admit weight)',
      labsSummary: 'Hgb 7.6 (post 1u pRBC pending), Plt 112, INR 1.3, BUN 42, Cr 1.0',
      clinicalNotes: 'On Pantoprazole IV BID and Octreotide drip empirically given history of compensated cirrhosis + Ceftriaxone 1g IV daily. GI scheduled EGD for 13:30 today. Type & Cross 2u pRBC active.',
      contingencies: 'IF hematemesis, brisk melena, HR > 120, or SBP < 90 -> transfuse 1-2u pRBC immediately, repeat STAT CBC, call GI fellow on call & ICU.',
      vtePpx: 'mechanical',
      dcWhen: 'T+2',
      dcDate: localDateOffset(2),
      dcPlace: 'Home',
      disposition: 'Monitor post-EGD; minimum 24-48h observation',
      checklist: {
        labs: true, outputs: false, bm: false, consults: true,
        vitals: true, imaging: false, overnight: true, meds: true,
        seen: true, note: false, orders: true, family: true
      },
      consults: [
        { id: 'c-301', service: 'Gastroenterology', status: 'Recs Reviewed', notes: 'NPO after midnight, EGD at 13:30, keep Hgb > 7' }
      ],
      tasks: [
        { id: 't-301', text: 'Check post-transfusion Hgb/Hct at 11:00', category: 'Lab', urgent: true, done: false, createdAt: now },
        { id: 't-302', text: 'Confirm consent signed & 2 large-bore IVs working pre-EGD', category: 'Procedure', urgent: true, done: false, createdAt: now },
        { id: 't-303', text: 'Review EGD findings & advance diet only if GI approves', category: 'Consult', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-04',
      room: '410A',
      name: 'Elena Morales',
      age: 57,
      sex: 'F',
      mrn: 'TEST-10424',
      hospitalDay: 2,
      codeStatus: 'Full Code',
      allergies: 'Iodine contrast (hives)',
      priority: 'watcher',
      primaryDx: 'NSTEMI — Awaiting Left Heart Cath',
      oneLiner: '57F w/ HTN, HLD, active smoker admitted w/ substernal chest pain, hs-Troponin peak 420, lateral T-wave inversions.',
      vitalsSummary: 'T 36.6°C | HR 74 | BP 128/76 | RR 16 | SpO2 97% RA (Tele: NSR)',
      ioSummary: 'In: 1.2L / Out: 1.1L (Net +100 mL)',
      weightSummary: '76.2 kg (stable)',
      labsSummary: 'hs-Trop 420 -> 380, Cr 0.9, Hgb 12.8, aPTT 68 (therapeutic on heparin gtt)',
      clinicalNotes: 'Chest pain free since ED nitro/heparin. On ASA 81, atorvastatin 80, metoprolol 25 BID, heparin infusion. Contrast allergy premedication protocol ordered for cath tomorrow AM.',
      contingencies: 'IF recurrent chest pain -> STAT 12-lead ECG, SL nitro x3, repeat hs-Troponin, notify Cardiology immediately.',
      vtePpx: 'therap-heparin',
      dcWhen: 'T+2',
      dcDate: localDateOffset(2),
      dcPlace: 'Home',
      disposition: 'Cath tomorrow AM; discharge 24h post-PCI if uncomplicated',
      checklist: {
        labs: true, outputs: false, bm: true, consults: true,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: false, note: false, orders: false, family: false
      },
      consults: [
        { id: 'c-401', service: 'Interventional Cardiology', status: 'Recs Reviewed', notes: 'LHC tomorrow AM; give prednisone/Benadryl prep for contrast allergy' }
      ],
      tasks: [
        { id: 't-401', text: 'Verify contrast allergy steroid prep doses timed for cath', category: 'Order', urgent: true, done: false, createdAt: now },
        { id: 't-402', text: 'Follow up TTE results (ordered today)', category: 'Imaging', urgent: false, done: false, createdAt: now },
        { id: 't-403', text: 'Order NPO after midnight tonight + hold heparin 4h pre-cath per Cards', category: 'Order', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-05',
      room: '412B',
      name: 'Arthur Pendelton',
      age: 79,
      sex: 'M',
      mrn: 'TEST-10425',
      hospitalDay: 4,
      codeStatus: 'DNR / DNI',
      allergies: 'NKDA',
      priority: 'watcher',
      primaryDx: 'COPD Exacerbation / Acute Hypercapnic Resp Failure',
      oneLiner: '79M w/ GOLD Stage IV COPD (2L home O2) admitted w/ worsening dyspnea & CO2 retention (pCO2 64); weaned off daytime BiPAP.',
      vitalsSummary: 'T 36.9°C | HR 88 | BP 134/78 | RR 20 | SpO2 90% on 3L NC (goal 88-92%)',
      ioSummary: 'In: 1.4L / Out: 1.2L',
      weightSummary: '64.5 kg (-0.4 kg)',
      labsSummary: 'VBG pH 7.36 / pCO2 56 (improving), WBC 11.2 (on steroids), K 4.1',
      clinicalNotes: 'Day 4 of prednisone 40mg PO daily & doxycycline (5-day course). Continues scheduled DuoNebs q4h and nocturnal BiPAP. Still slightly dyspneic with ambulation to bathroom.',
      contingencies: 'IF somnolent, RR > 28, or SpO2 < 86% -> place on BiPAP, obtain STAT VBG, avoid over-oxygenation (>92%). Respect DNR/DNI status.',
      vtePpx: 'enoxaparin',
      dcWhen: 'T+1',
      dcDate: localDateOffset(1),
      dcPlace: 'Home with services',
      disposition: 'Likely home with home health PT & oxygen re-qual in 1-2 days',
      checklist: {
        labs: true, outputs: false, bm: false, consults: false,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: true, note: true, orders: true, family: false
      },
      consults: [
        { id: 'c-501', service: 'Pulmonology', status: 'Signed Off', notes: 'Complete 5d steroid/abx; outpatient PFT follow-up' },
        { id: 'c-502', service: 'Physical Therapy', status: 'Pending', notes: 'Eval for home safety & ambulation O2 titration' }
      ],
      tasks: [
        { id: 't-501', text: 'Check 6-minute walk O2 saturation with RT/PT', category: 'Dispo', urgent: false, done: false, createdAt: now },
        { id: 't-502', text: 'Reconcile home inhalers (Trelegy) & confirm insurance coverage', category: 'Dispo', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-06',
      room: '414A',
      name: 'Priya Nair',
      age: 42,
      sex: 'F',
      mrn: 'TEST-10426',
      hospitalDay: 2,
      codeStatus: 'Full Code',
      allergies: 'Latex',
      priority: 'watcher',
      primaryDx: 'DKA (Gap Closed) — Transitioning to SubQ Insulin',
      oneLiner: '42F w/ T1DM (pump malfunction) admitted in moderate DKA (pH 7.18, AG 24); gap closed this AM, transitioned to Lantus + lispro.',
      vitalsSummary: 'T 36.8°C | HR 84 | BP 118/72 | RR 16 | SpO2 99% RA',
      ioSummary: 'In: 3.6L / Out: 3.1L (Net +500 mL)',
      weightSummary: '61.0 kg (+0.8 kg — rehydrated)',
      labsSummary: 'BMP: Na 138, K 3.8, HCO3 21, AG 11, Gluc 186, Phos 2.6',
      clinicalNotes: 'Insulin drip discontinued 2h after Lantus 24u subQ given. Tolerating diabetic diet well. Needs diabetes educator & pump replacement coordination prior to discharge.',
      contingencies: 'IF BG > 300 or nausea/vomiting recurs -> check STAT BMP & beta-hydroxybutyrate to ensure no rebound DKA. IF BG < 70 -> hypoglycemia protocol.',
      vtePpx: 'enoxaparin',
      dcWhen: 'T+1',
      dcDate: localDateOffset(1),
      dcPlace: 'Home',
      disposition: 'Discharge tomorrow once 24h stable on basal/bolus & pump plan set',
      checklist: {
        labs: true, outputs: true, bm: true, consults: false,
        vitals: true, imaging: false, overnight: true, meds: true,
        seen: false, note: false, orders: true, family: false
      },
      consults: [
        { id: 'c-601', service: 'Endocrinology / CDE', status: 'Pending', notes: 'Insulin pump troubleshooting & bridge regimen' }
      ],
      tasks: [
        { id: 't-601', text: 'Check 14:00 BMP to verify anion gap stays closed', category: 'Lab', urgent: true, done: false, createdAt: now },
        { id: 't-602', text: 'Confirm CDE teaching completed before discharge', category: 'Consult', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-07',
      room: '416B',
      name: 'Marcus Vance',
      age: 53,
      sex: 'M',
      mrn: 'TEST-10427',
      hospitalDay: 2,
      codeStatus: 'Full Code',
      allergies: 'NKDA',
      priority: 'watcher',
      primaryDx: 'Alcohol Withdrawal Syndrome (CIWA Protocol)',
      oneLiner: '53M w/ AUD (1 pint vodka/day) admitted w/ tremor, diaphoresis, CIWA peak 18; requiring intermittent IV lorazepam.',
      vitalsSummary: 'T 37.2°C | HR 96 | BP 146/88 | RR 18 | SpO2 97% RA',
      ioSummary: 'In: 1.8L / Out: 1.4L',
      weightSummary: '81.2 kg',
      labsSummary: 'K 3.5, Mg 1.5, Phos 2.3, AST 148, ALT 72, Plt 128, EtOH <10',
      clinicalNotes: 'Received 6 mg IV Ativan in past 24h (last CIWA 9 at 06:00). On IV thiamine 500 mg TID, folate, MVI. Repleting K/Mg/Phos aggressively. Mild anxiety, no hallucinations.',
      contingencies: 'IF CIWA > 15 or visual/tactile hallucinations -> escalate to front-loaded phenobarbital protocol or scheduled diazepam; consider ICU if refractory.',
      vtePpx: 'enoxaparin',
      dcWhen: 'TBD',
      dcDate: '',
      dcPlace: 'Home',
      disposition: 'Monitor until 24h minimal CIWA (<8); offer Addiction Medicine & naltrexone',
      checklist: {
        labs: true, outputs: false, bm: false, consults: false,
        vitals: true, imaging: false, overnight: true, meds: false,
        seen: false, note: false, orders: false, family: false
      },
      consults: [
        { id: 'c-701', service: 'Addiction Medicine', status: 'Pending', notes: 'Discuss MAT options & outpatient rehab resources' }
      ],
      tasks: [
        { id: 't-701', text: 'Order MgSO4 2g IV & KPhos repletion', category: 'Order', urgent: true, done: false, createdAt: now },
        { id: 't-702', text: 'Review 24h CIWA trend & total benzo requirement', category: 'General', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-08',
      room: '419A',
      name: 'Dorothy Jenkins',
      age: 83,
      sex: 'F',
      mrn: 'TEST-10428',
      hospitalDay: 3,
      codeStatus: 'DNR / Full Intubation',
      allergies: 'Codeine (nausea)',
      priority: 'watcher',
      primaryDx: 'Acute Metabolic Encephalopathy / Delirium / UTI',
      oneLiner: '83F w/ mild dementia admitted from ALF w/ acute confusion & Proteus UTI; sundowning overnight requiring sitter.',
      vitalsSummary: 'T 37.0°C | HR 78 | BP 136/72 | RR 16 | SpO2 96% RA',
      ioSummary: 'In: 1.0L / Out: 0.9L (voiding in briefs, PVR 45 mL)',
      weightSummary: '58.4 kg',
      labsSummary: 'WBC 10.4 (down from 14.8), Na 136, Cr 0.9, TSH/B12 WNL',
      clinicalNotes: 'Day 3 ceftriaxone; urine cx pan-sensitive Proteus -> ready to switch to PO cephalexin. Non-pharmacologic delirium bundle in place (glasses, hearing aids, window open, avoid benzos/anticholinergics).',
      contingencies: 'IF severe agitation posing safety risk -> avoid benzos/Benadryl; try redirection first, low-dose haloperidol 0.5 mg IV/PO PRN only if QTc < 500.',
      vtePpx: 'enoxaparin',
      dcWhen: 'T+1',
      dcDate: localDateOffset(1),
      dcPlace: 'ALF',
      disposition: 'Return to Assisted Living once mentation closer to baseline (1-2 days)',
      checklist: {
        labs: true, outputs: true, bm: false, consults: false,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: true, note: false, orders: false, family: false
      },
      consults: [
        { id: 'c-801', service: 'Case Management', status: 'Recs Reviewed', notes: 'ALF bed held; needs updated med list & TB clearance' }
      ],
      tasks: [
        { id: 't-801', text: 'Transition ceftriaxone IV to PO cephalexin (complete 7d)', category: 'Order', urgent: false, done: false, createdAt: now },
        { id: 't-802', text: 'Call son to assess cognitive baseline vs current status', category: 'Family', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-09',
      room: '421A',
      name: 'Samuel Okafor',
      age: 64,
      sex: 'M',
      mrn: 'TEST-10429',
      hospitalDay: 4,
      codeStatus: 'Full Code',
      allergies: 'NKDA',
      priority: 'discharge',
      primaryDx: 'Right Lower Extremity Cellulitis — Ready for PO Stepdown',
      oneLiner: '64M w/ DM2, venous stasis admitted for RLE non-purulent cellulitis; afebrile x48h, erythema receded well inside ink borders.',
      vitalsSummary: 'T 36.6°C | HR 72 | BP 126/74 | RR 16 | SpO2 98% RA',
      ioSummary: 'In: 1.6L / Out: 1.5L',
      weightSummary: '91.0 kg',
      labsSummary: 'WBC 7.8 (down from 15.2), Cr 1.0, Blood cx NGTD x72h',
      clinicalNotes: 'Completed 3 days IV cefazolin. Pain and swelling markedly improved. Ready for discharge today on PO cephalexin 500mg QID x 5 more days + leg elevation & compression follow-up.',
      contingencies: 'Routine discharge today; return precautions for spreading redness, fever, or worsening pain.',
      vtePpx: 'enoxaparin',
      dcWhen: 'T',
      dcDate: localDateOffset(0),
      dcPlace: 'Home',
      disposition: 'HOME TODAY — wife picking up at 14:00',
      checklist: {
        labs: true, outputs: true, bm: true, consults: true,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: true, note: false, orders: false, family: true
      },
      consults: [],
      tasks: [
        { id: 't-901', text: 'E-prescribe cephalexin to Walgreens & complete discharge med rec', category: 'Dispo', urgent: true, done: false, createdAt: now },
        { id: 't-902', text: 'Write & sign Discharge Summary before 12:00', category: 'Dispo', urgent: true, done: false, createdAt: now },
        { id: 't-903', text: 'Place discharge order & PCP 1-week follow-up', category: 'Order', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-10',
      room: '423B',
      name: 'Linda Chen-Patel',
      age: 49,
      sex: 'F',
      mrn: 'TEST-10430',
      hospitalDay: 2,
      codeStatus: 'Full Code',
      allergies: 'Aspirin (GI upset)',
      priority: 'discharge',
      primaryDx: 'Vasovagal Syncope — Negative Cardiac/Neuro Workup',
      oneLiner: '49F admitted after witnessed syncopal episode while standing; orthostatics resolved w/ IVF, tele NSR x36h, normal TTE.',
      vitalsSummary: 'T 36.5°C | HR 68 | BP 116/70 (no orthostasis) | RR 14 | SpO2 99% RA',
      ioSummary: 'In: 1.9L / Out: 1.7L',
      weightSummary: '63.2 kg',
      labsSummary: 'CBC/BMP normal, Troponin neg x2, TSH 1.8',
      clinicalNotes: 'TTE shows EF 60%, no structural heart disease or valvular pathology. Telemetry clean without pauses or arrhythmias. Ambulating independently without dizziness.',
      contingencies: 'Low risk. Discharge with Zio patch ordered for outpatient reassurance + hydration/compression stockings counseling.',
      vtePpx: 'ambulatory',
      dcWhen: 'T',
      dcDate: localDateOffset(0),
      dcPlace: 'Home',
      disposition: 'HOME TODAY — independent, driving self home',
      checklist: {
        labs: true, outputs: false, bm: false, consults: true,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: false, note: false, orders: false, family: false
      },
      consults: [
        { id: 'c-1001', service: 'Cardiology', status: 'Signed Off', notes: 'Low-risk syncope, OK for DC with 14-day outpatient event monitor' }
      ],
      tasks: [
        { id: 't-1001', text: 'Ensure Zio patch applied before patient leaves floor', category: 'Dispo', urgent: true, done: false, createdAt: now },
        { id: 't-1002', text: 'Finalize discharge instructions & PCP follow-up', category: 'Dispo', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-11',
      room: '425A',
      name: 'Carlos Ramirez',
      age: 71,
      sex: 'M',
      mrn: 'TEST-10431',
      hospitalDay: 5,
      codeStatus: 'Full Code',
      allergies: 'NKDA',
      priority: 'stable',
      primaryDx: 'Submassive PE (Low-Intermediate Risk) — Transitioning to DOAC',
      oneLiner: '71M w/ recent knee arthroscopy admitted w/ bilateral segmental PEs, mild RV strain on CT, normal troponin/BNP; stable on Eliquis.',
      vitalsSummary: 'T 36.7°C | HR 76 | BP 124/76 | RR 16 | SpO2 96% on RA (weaned off 2L)',
      ioSummary: 'In: 1.5L / Out: 1.4L',
      weightSummary: '88.1 kg',
      labsSummary: 'Hgb 12.1 (stable), Cr 0.9, Plt 210',
      clinicalNotes: 'Switched from heparin gtt to apixaban 10 mg BID x7 days then 5 mg BID. Off supplemental oxygen for 18 hours. Awaiting insurance prior authorization for Eliquis co-pay card.',
      contingencies: 'IF acute hypoxia, tachycardia, or signs of bleeding -> evaluate immediately, hold DOAC if major bleed.',
      vtePpx: 'doac',
      dcWhen: 'T+1',
      dcDate: localDateOffset(1),
      dcPlace: 'Home',
      disposition: 'Home tomorrow once Eliquis meds-to-beds confirmed',
      checklist: {
        labs: true, outputs: false, bm: false, consults: false,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: false, note: false, orders: false, family: false
      },
      consults: [],
      tasks: [
        { id: 't-1101', text: 'Check with pharmacy on Eliquis prior auth / starter pack', category: 'Dispo', urgent: false, done: false, createdAt: now },
        { id: 't-1102', text: 'Confirm ambulatory SpO2 > 94% on room air', category: 'General', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-12',
      room: '427A',
      name: 'Beatrice Vance-Miller',
      age: 66,
      sex: 'F',
      mrn: 'TEST-10432',
      hospitalDay: 3,
      codeStatus: 'Full Code',
      allergies: 'Morphine (pruritus)',
      priority: 'stable',
      primaryDx: 'Acute Kidney Injury (Pre-renal / ATN) — Recovering',
      oneLiner: '66F w/ HTN, OA admitted w/ Cr 3.8 (base 1.0) after gastroenteritis + lisinopril/ibuprofen; Cr trending down nicely on IVF.',
      vitalsSummary: 'T 36.6°C | HR 70 | BP 132/76 | RR 15 | SpO2 98% RA',
      ioSummary: 'In: 2.0L / Out: 2.2L (robust non-oliguric UOP)',
      weightSummary: '73.4 kg (-0.3 kg)',
      labsSummary: 'Cr 3.8 -> 2.9 -> 2.1 today, K 4.2, HCO3 23, Renal US no hydronephrosis',
      clinicalNotes: 'Stopped maintenance IVF as PO intake is excellent. Nephrology recommends avoiding NSAIDs permanently and holding ACEi until Cr < 1.5 at outpatient check.',
      contingencies: 'IF UOP drops < 0.5 mL/kg/hr or K > 5.3 -> repeat STAT BMP & notify team.',
      vtePpx: 'heparin',
      dcWhen: 'T+1',
      dcDate: localDateOffset(1),
      dcPlace: 'Home',
      disposition: 'Home tomorrow if AM Cr continues downward trend (< 1.8)',
      checklist: {
        labs: true, outputs: true, bm: true, consults: true,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: true, note: true, orders: true, family: false
      },
      consults: [
        { id: 'c-1201', service: 'Nephrology', status: 'Recs Reviewed', notes: 'Stop IVF, trend daily BMP, strict NSAID avoidance' }
      ],
      tasks: [
        { id: 't-1201', text: 'Order AM BMP for tomorrow', category: 'Lab', urgent: false, done: true, createdAt: now },
        { id: 't-1202', text: 'Provide nephrotoxin avoidance sheet at discharge', category: 'Dispo', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-13',
      room: '429B',
      name: 'Harold Zimmerman',
      age: 76,
      sex: 'M',
      mrn: 'TEST-10433',
      hospitalDay: 6,
      codeStatus: 'Full Code',
      allergies: 'NKDA',
      priority: 'stable',
      primaryDx: 'Left MCA Lacunar Stroke — Awaiting Acute Rehab Placement',
      oneLiner: '76M w/ HTN, DM2 admitted w/ mild right hemiparesis (4/5); MRI confirmed L internal capsule lacunar infarct, workup complete.',
      vitalsSummary: 'T 36.7°C | HR 74 | BP 138/78 | RR 16 | SpO2 97% RA',
      ioSummary: 'In: 1.5L / Out: 1.3L',
      weightSummary: '79.5 kg',
      labsSummary: 'A1c 7.9%, LDL 128, BMP/CBC normal',
      clinicalNotes: 'On DAPT (ASA 81 + Plavix 75 x21 days per CHANCE/POINT) & atorvastatin 80. Carotid duplex <50% stenosis; TTE normal. Passed bedside swallow eval. PT/OT recommend Acute Inpatient Rehab.',
      contingencies: 'IF any new focal neuro deficit or worsening weakness -> call Code Stroke / STAT head CT.',
      vtePpx: 'enoxaparin',
      dcWhen: 'TBD',
      dcDate: '',
      dcPlace: 'Acute Rehab (IRF)',
      disposition: 'Pending Acute Rehab insurance authorization (Case Mgmt following)',
      checklist: {
        labs: true, outputs: false, bm: false, consults: true,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: false, note: false, orders: false, family: false
      },
      consults: [
        { id: 'c-1301', service: 'Neurology', status: 'Signed Off', notes: 'DAPT x21d then ASA monotherapy; permissive HTN ended' },
        { id: 'c-1302', service: 'PT / OT / SLP', status: 'Recs Reviewed', notes: 'Regular diet; recommend Acute Inpatient Rehab' }
      ],
      tasks: [
        { id: 't-1301', text: 'Check with Case Management on Acute Rehab auth & bed date', category: 'Dispo', urgent: false, done: false, createdAt: now },
        { id: 't-1302', text: 'Update spouse on expected transfer timeline', category: 'Family', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    },
    {
      id: 'pt-14',
      room: '431A',
      name: 'Tanya Brooks',
      age: 59,
      sex: 'F',
      mrn: 'TEST-10434',
      hospitalDay: 4,
      codeStatus: 'Full Code',
      allergies: 'Vancomycin (Red Man — slow infusion OK)',
      priority: 'stable',
      primaryDx: 'Diabetic Foot Infection / Osteomyelitis (5th Metatarsal)',
      oneLiner: '59F w/ uncontrolled DM2, neuropathy admitted w/ L 5th MT osteomyelitis; Podiatry debrided HD2, awaiting PICC for OPAT.',
      vitalsSummary: 'T 36.8°C | HR 78 | BP 126/74 | RR 16 | SpO2 98% RA',
      ioSummary: 'In: 1.7L / Out: 1.5L',
      weightSummary: '86.3 kg',
      labsSummary: 'WBC 8.6 (normalized), CRP 24 (down from 96), Cr 0.8, Bone cx MSSA',
      clinicalNotes: 'ID narrowed to IV cefazolin (6-week OPAT course) after bone biopsy grew MSSA. Vascular ABI normal (0.98). Wound clean, dry, offloading boot fitted.',
      contingencies: 'IF fever > 38.0°C, worsening erythema, or hyperglycemia > 300 -> re-examine foot & adjust insulin sliding scale.',
      vtePpx: 'enoxaparin',
      dcWhen: 'T+1',
      dcDate: localDateOffset(1),
      dcPlace: 'Home with services',
      disposition: 'Home w/ Home Infusion OPAT after PICC placed tomorrow',
      checklist: {
        labs: true, outputs: false, bm: true, consults: true,
        vitals: true, imaging: true, overnight: true, meds: true,
        seen: false, note: false, orders: true, family: false
      },
      consults: [
        { id: 'c-1401', service: 'Infectious Disease', status: 'Recs Reviewed', notes: 'Cefazolin 2g IV q8h x 6 weeks via PICC; weekly CBC/CMP/CRP' },
        { id: 'c-1402', service: 'Podiatry', status: 'Recs Reviewed', notes: 'NWB on L heel; clinic follow-up in 2 weeks' }
      ],
      tasks: [
        { id: 't-1401', text: 'Confirm PICC line scheduled with Vascular Access team', category: 'Procedure', urgent: false, done: false, createdAt: now },
        { id: 't-1402', text: 'Send OPAT weekly lab orders & home infusion script to Case Mgmt', category: 'Dispo', urgent: false, done: false, createdAt: now }
      ],
      updatedAt: now
    }
  ];
}

function getDefaultUiState() {
  return {
    uiVersion: 4,
    censusCollapsed: false,
    patientPaneCollapsed: false, // Center column: Active Patient workspace
    rightPaneCollapsed: false,   // 3rd column: Progress Note dock
    patientTab: 'plan',          // 'plan' (Summary) | 'consults' | 'tasks' | 'ifthen'
    preroundOpen: false,         // Pre-round checklist expanded under the meter
    noteSection: 'subj',         // Open field group in the note dock: 'subj' | 'obj' | 'ap'
    noteOpts: { consults: true, tasks: true, contingencies: false, stripNotes: true },
    markNoteOnCopy: false        // 'Mark note written on copy' (off until the user ticks it; remembered)
  };
}

function getDefaultAppState() {
  return {
    version: 1,
    providerName: 'Dr. Hospitalist (Day Team A)',
    serviceName: 'Internal Medicine — Hospitalist Service',
    shiftDate: new Date().toISOString().slice(0, 10),
    selectedPatientId: null,
    theme: 'light',
    sortBy: 'priority',
    filterBy: 'all',
    ui: getDefaultUiState(),
    customDotPhrases: [],
    starredDotPhrases: [],
    planBuilderSettings: null,
    reminders: [],
    customMedicalVocab: [],
    voiceEnabled: false, // cloud speech: off until the user agrees to the notice
    patients: [], // test patients load only from the Test data menu
    lastSavedAt: new Date().toISOString()
  };
}

