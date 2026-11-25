/**
 * RoundingOS — Progress Note Builder & 193+ Hospitalist DotPhrase Engine
 * Builds copy-paste-ready Epic/EMR progress notes from voice-dictated Subjective,
 * Physical Exam, pulled Labs/Outputs/Weights/Imaging, and condition DotPhrases.
 */

const ProgressNoteEngine = (() => {
  const DEFAULT_NORMAL_EXAM = [
    'General: Alert, oriented x3-4, resting comfortably, no acute distress.',
    'HEENT: Normocephalic, atraumatic, mucous membranes moist, no scleral icterus.',
    'CV: Regular rate and rhythm, normal S1/S2, no murmurs, rubs, or gallops; no JVD.',
    'Pulm: Clear to auscultation bilaterally, no wheezes, rales, or rhonchi; normal work of breathing.',
    'Abd: Soft, non-tender, non-distended, normoactive bowel sounds, no guarding or rebound.',
    'Ext: Warm, well-perfused, no peripheral edema, symmetric distal pulses.',
    'Neuro: Alert, follows commands, cranial nerves II-XII grossly intact, moves all extremities spontaneously without focal deficit.',
    'Skin: Warm, dry, intact, no rashes or acute breakdown.'
  ].join('\n');

  const QUICK_SUBJECTIVE_PRESETS = [
    'Resting comfortably overnight; denies chest pain, shortness of breath, nausea, vomiting, fever, or new complaints.',
    'Reports mild improvement in symptoms compared to yesterday; tolerating PO intake well.',
    'Overnight events reviewed with nursing; patient reports ongoing symptoms as detailed below.'
  ];

  function getAllPhrases(customPhrases = []) {
    const builtins = typeof BUILTIN_DOTPHRASES !== 'undefined' ? BUILTIN_DOTPHRASES : [];
    return [...customPhrases, ...builtins];
  }

  function getCategories(allPhrases) {
    const cats = new Set();
    allPhrases.forEach(p => { if (p.category) cats.add(p.category); });
    return ['All', ...Array.from(cats)];
  }

  function searchPhrases(allPhrases, query = '', category = 'All') {
    const q = query.trim().toLowerCase().replace(/^\./, '');
    return allPhrases.filter(p => {
      if (category !== 'All' && p.category !== category) return false;
      if (!q) return true;
      const trig = (p.trigger || '').toLowerCase();
      const title = (p.title || '').toLowerCase();
      const body = (p.body || '').toLowerCase();
      return trig.includes(q) || title.includes(q) || body.includes(q);
    });
  }

  /**
   * Auto-suggests relevant DotPhrases based on the patient's diagnosis, one-liner, labs & notes.
   */
  function suggestForPatient(patient, allPhrases) {
    if (!patient) return [];
    const blob = [
      patient.primaryDx,
      patient.oneLiner,
      patient.clinicalNotes,
      patient.labsSummary,
      patient.codeStatus
    ].filter(Boolean).join(' ').toLowerCase();

    const keywordRules = [
      { match: /sepsis|urosepsis|septic/, triggers: ['.GBHOSPSEPSISMANAGE', '.GBHOSPSEPSISWORKUP', '.GBHOSPUTIPYELOMANAGE'] },
      { match: /hfref|hfpef|adhf|heart failure|chf|volume overload|diures/, triggers: ['.GBHOSPADHFMANAGE', '.GBHOSPADHFWORKUP', '.GBCHRHFREF', '.GBDLYLYTES'] },
      { match: /pneumonia|\bcap\b|infiltrate/, triggers: ['.GBHOSPPNAMANAGE', '.GBHOSPPNAWORKUP'] },
      { match: /copd|hypercapni|bipap/, triggers: ['.GBHOSPCOPDEXACMANAGE', '.GBCHRCOPD', '.GBOXIAMB'] },
      { match: /\baki\b|acute kidney|cardiorenal|creatinine/, triggers: ['.GBHOSPAKIMANAGE', '.GBHOSPAKIWORKUP', '.GBCHRCKD'] },
      { match: /\buti\b|pyelonephritis|proteus|e\.\s*coli/, triggers: ['.GBHOSPUTIPYELOMANAGE', '.GBHOSPUTIPYELOWORKUP'] },
      { match: /cellulitis|ssti|abscess/, triggers: ['.GBHOSPCELLULITISMANAGE', '.GBHOSPCELLULITISWORKUP'] },
      { match: /afib|a[\s-]?fib|atrial fibrillation|rvr/, triggers: ['.GBHOSPAFIBMANAGE', '.GBCHRAF'] },
      { match: /nstemi|stemi|\bacs\b|chest pain|troponin/, triggers: ['.GBHOSPACSMANAGE', '.GBHOSPACSWORKUP', '.GBCHRCAD'] },
      { match: /stroke|lacunar|\btia\b|hemiparesis/, triggers: ['.GBHOSPSTROKETIAMANAGE', '.GBHOSPSTROKETIAWORKUP', '.GBCHRHXSTROKE'] },
      { match: /\bdka\b|ketoacidosis/, triggers: ['.GBHOSPDKAMANAGE', '.GBINSULINSTART', '.GBINSULINTITRATE', '.GBCHRT1DM'] },
      { match: /gi bleed|ugib|lgib|melena|hematemesis|egd/, triggers: ['.GBHOSPGIBMANAGE', '.GBHOSPGIBWORKUP', '.GBDLYANEMIA'] },
      { match: /hyponatremi|na\s*1[12]\d/, triggers: ['.GBHOSPHYPONATREMIAMANAGE', '.GBHOSPHYPONATREMIAWORKUP'] },
      { match: /alcohol|ciwa|withdrawal|\baud\b/, triggers: ['.GBHOSPETOHWITHDRAWALMANAGE', '.GBCHRAUD'] },
      { match: /syncope|orthostat/, triggers: ['.GBHOSPSYNCOPEMANAGE', '.GBHOSPSYNCOPEWORKUP'] },
      { match: /pulmonary embolism|\bpe\b|\bdvt\b|\bvte\b|eliquis|apixaban/, triggers: ['.GBHOSPVTEMANAGE', '.GBHOSPVTEWORKUP'] },
      { match: /delirium|encephalopathy|confusion|sundowning|agitation/, triggers: ['.GBHOSPDELIRIUMMANAGE', '.GBDLYAGITATION', '.GBCHRDEMENTIA'] },
      { match: /diabetic foot|osteomyelitis|metatarsal/, triggers: ['.GBHOSPDIABETICFOOTMANAGE', '.GBINSULINTITRATE'] },
      { match: /cirrhosis|ascites|\bsbp\b|varices/, triggers: ['.GBHOSPCIRRHOSISMANAGE', '.GBCHRCIRRHOSIS'] },
      { match: /hyperkalemi|k\s*[56]\.[3-9]/, triggers: ['.GBHOSPHYPERKMANAGE'] },
      { match: /hypokalemi|k\s*3\.[0-4]/, triggers: ['.GBHOSPHYPOKMANAGE', '.GBDLYLYTES'] },
      { match: /steroid|prednisone|dexamethasone/, triggers: ['.GBINSULINSTEROID'] },
      { match: /dm2|t2dm|diabetes|hyperglyc|insulin/, triggers: ['.GBINSULINTITRATE', '.GBCHRT2DM'] },
      { match: /dnr|dni|comfort/, triggers: ['.GBHOSPCODEDNRDNI', '.GBHOSPGOCCONVERSATION'] }
    ];

    const byTrig = new Map(allPhrases.map(p => [p.trigger.toUpperCase(), p]));
    const picked = [];
    const seen = new Set();

    const addTrig = (t) => {
      const up = t.toUpperCase();
      if (!seen.has(up) && byTrig.has(up)) {
        seen.add(up);
        picked.push(byTrig.get(up));
      }
    };

    // Rank by relevance: rules matching the primary diagnosis first, then the rest of the chart text
    // (so a syncope patient with "troponin neg" in the labs still sees syncope before ACS).
    const dxText = String(patient.primaryDx || '').toLowerCase();
    for (const rule of keywordRules) {
      if (rule.match.test(dxText)) rule.triggers.forEach(addTrig);
    }
    for (const rule of keywordRules) {
      if (rule.match.test(blob)) rule.triggers.forEach(addTrig);
    }

    // Always include a couple of high-utility hospitalist staples if room remains
    ['.GBDLYVTEPPX', '.GBDLYLYTES', '.GBDLYDISPO'].forEach(addTrig);
    return picked.slice(0, 8);
  }

  /**
   * Expands inline dotphrase triggers like `.GBHOSPADHFMANAGE` inside a text string.
   */
  function expandInlineTriggers(text, allPhrases, prefix = 'GB') {
    if (!text) return { text: '', expandedCount: 0 };
    const pfx = String(prefix || 'GB').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GB';
    const byTrig = new Map();
    allPhrases.forEach(p => {
      const up = p.trigger.toUpperCase();
      byTrig.set(up, p.body);
      // Also accept the user's custom prefix (e.g. .XYHOSPADHF for .GBHOSPADHF)
      if (up.startsWith('.GB') && pfx !== 'GB') byTrig.set('.' + pfx + up.slice(3), p.body);
    });
    const prefixes = pfx === 'GB' ? 'GB' : `(?:GB|${pfx})`;
    const re = new RegExp(`(^|\\s)(\\.${prefixes}[A-Z0-9]{3,})\\b`, 'gi');
    let count = 0;
    const replaced = text.replace(re, (full, lead, trig) => {
      const body = byTrig.get(trig.toUpperCase());
      if (!body) return full;
      count++;
      return `${lead}${body}`;
    });
    return { text: replaced, expandedCount: count };
  }

  /**
   * Jumps to and highlights the next `***` wildcard in a textarea (Epic F2 behavior).
   */
  function jumpToNextWildcard(textarea) {
    if (!textarea) return false;
    const val = textarea.value;
    const startSearch = textarea.selectionEnd || 0;
    let idx = val.indexOf('***', startSearch);
    if (idx === -1) {
      idx = val.indexOf('***', 0);
    }
    if (idx === -1) return false;
    textarea.focus();
    textarea.setSelectionRange(idx, idx + 3);
    // Scroll roughly into view
    const linesBefore = val.slice(0, idx).split('\n').length;
    textarea.scrollTop = Math.max(0, (linesBefore - 4) * 18);
    return true;
  }

  function stripEditorialNotes(text) {
    return text
      .replace(/\s*\[NOTE:[^\]]*\]/gi, '')
      .replace(/[ \t]+\n/g, '\n');
  }

  function detectConsultService(rawText) {
    const t = String(rawText || '');
    const rules = [
      [/\b(cardiology|cards|electrophysiology|\bep\b|interventional card|heart failure team)\b/i, 'Cardiology'],
      [/\b(nephrology|renal consult|dialysis service)\b/i, 'Nephrology'],
      [/\b(infectious disease|id consult|\bid\s+service\b)\b/i, 'Infectious Disease'],
      [/\b(gastroenterology|gi consult|hepatology|endoscopy)\b/i, 'GI'],
      [/\b(pulmonology|pulmonary|critical care|icu consult)\b/i, 'Pulmonary'],
      [/\b(vascular surgery|vascular consult)\b/i, 'Vascular Surgery'],
      [/\b(orthop(?:a)?edic|ortho consult)\b/i, 'Orthopedics'],
      [/\b(neurosurgery|nsgy)\b/i, 'Neurosurgery'],
      [/\b(general surgery|surgical consult|surgery service|acute care surgery)\b/i, 'Surgery'],
      [/\b(neurology|stroke team|neuro consult)\b/i, 'Neurology'],
      [/\b(hematology|oncology|heme\/?onc)\b/i, 'Heme/Onc'],
      [/\b(palliative|hospice|supportive care)\b/i, 'Palliative Care'],
      [/\b(urology|urologic)\b/i, 'Urology'],
      [/\b(endocrinology|endocrine|diabetes service)\b/i, 'Endocrinology'],
      [/\b(rheumatology|rheum)\b/i, 'Rheumatology'],
      [/\b(psychiatry|psych consult|addiction medicine)\b/i, 'Psychiatry'],
      [/\b(podiatry|podiatric)\b/i, 'Podiatry'],
      [/\b(otolaryngology|\bent\b)\b/i, 'ENT'],
      [/\b(ophthalmology|ophtho)\b/i, 'Ophthalmology'],
      [/\b(dermatology|derm)\b/i, 'Dermatology'],
      [/\b(interventional radiology|\bir\s+consult)\b/i, 'IR'],
      [/\b(wound care|wound ostomy)\b/i, 'Wound Care']
    ];
    for (const [re, label] of rules) {
      if (re.test(t)) return label;
    }
    return '';
  }

  /**
   * Locally condenses & rephrases raw pasted consult recommendations into
   * crisp, concise hospitalist progress-note prose (100% offline).
   */
  function condenseConsultRecommendations(rawText, serviceName = '') {
    const raw = String(rawText || '').trim();
    if (!raw) return '';

    // 1. If a full consult note was pasted, slice from Recommendations / Impression & Plan onward
    let working = raw.replace(/\r\n/g, '\n');
    const secMatch = working.match(/(?:^|\n)\s*(?:consult\s+)?(?:recommendations?|recs|assessment\s*(?:&|and)\s*plan|impression\s*(?:&|and)\s*plan|plan\s*&?\s*recommendations?|plan)\s*:?\s*\n?/i);
    if (secMatch && secMatch.index > 40) {
      working = working.slice(secMatch.index + secMatch[0].length);
    }

    const signedOff = /\b(signing off|sign off|will sign off|no further (?:acute )?(?:follow[- ]?up|intervention|recs?)|closing consult)\b/i.test(raw);

    // 2. Split into candidate lines / sentences
    const rawLines = working
      .split(/\n+/)
      .flatMap(ln => {
        const trimmed = ln.trim();
        if (!trimmed) return [];
        // Split long paragraph lines into sentences unless already short bullet
        if (trimmed.length > 160 && !/^[-•*▪◦\d]/.test(trimmed)) {
          return trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/);
        }
        return [trimmed];
      });

    const boilerplatePatterns = [
      /^thank you (?:very much )?for (?:this |the )?(?:kind |interesting )?(?:consult|referral|opportunity)/i,
      /^we (?:have )?(?:seen|evaluated|examined|reviewed|discussed|spoke)/i,
      /^(?:i|we) appreciate the opportunity/i,
      /^(?:we )?will (?:continue to )?follow(?: along| closely| with primary team)?/i,
      /^please (?:do not hesitate to |feel free to )?(?:contact|call|page|reach out)/i,
      /^call or page with/i,
      /^electronically signed|^signed by|^dictated by|^attending\s*:|^fellow\s*:|^resident\s*:|^pager\s*:|^date of service|^consult service\s*:/i,
      /^(?:dr\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+,?\s*(?:MD|DO|NP|PA-C|PA|MBBS|FACC|FACP)\b/i,
      /^(?:assessment|plan|impression|recommendations?|consult recommendations?|hospital course)\s*:?$/i,
      /^discussed (?:case |recommendations? )?with (?:primary team|hospitalist|attending|patient|family)/i,
      /^patient (?:is a|was seen|evaluated at bedside)/i
    ];

    const condensedItems = [];
    const seen = new Set();

    for (let line of rawLines) {
      // Strip leading bullets / numbering
      line = line.replace(/^\s*(?:[-•*▪◦>]+|\d+[.)]\s*|[a-z][.)]\s*)/i, '').trim();
      if (!line || line.length < 3) continue;

      if (boilerplatePatterns.some(re => re.test(line))) continue;

      // Skip standalone sign-off chatter (we append concise tag at end if detected)
      if (/^(?:we are )?(?:signing off|sign off|will sign off|closing consult)/i.test(line)) continue;

      // Rephrase verbose consult-speak -> direct hospitalist action phrasing
      let s = line
        .replace(/^(?:we\s+)?(?:would\s+)?(?:strongly\s+)?(?:recommend|suggest|advise)\s+(?:that\s+(?:the\s+team|you|patient)\s+)?/i, '')
        .replace(/^(?:our\s+recommendations?\s+(?:is|are)\s+to\s+)/i, '')
        .replace(/^(?:please\s+)(?:continue|start|initiate|obtain|check|trend|monitor|hold|avoid|stop|discontinue|give|administer|order|keep|maintain|refer|follow|consult|repeat|recheck|titrate|wean|taper|transition|switch|change|increase|decrease|reduce|add|remove|replace|schedule|arrange|perform|proceed|transfuse|replete|ensure)\b/i, m => m.replace(/^please\s+/i, ''))
        .replace(/^(?:we\s+)?(?:agree|concur)\s+with\s+/i, 'Continue ')
        .replace(/^would\s+(?:continue|start|initiate|obtain|check|trend|monitor|hold|avoid|stop|give|keep|repeat|recheck|consider|recommend)\b/i, m => m.replace(/^would\s+/i, ''))
        .replace(/^continuing\b/i, 'Continue')
        .replace(/^starting\b/i, 'Start')
        .replace(/^initiating\b|^initiation of\b/i, 'Start')
        .replace(/^obtaining\b/i, 'Obtain')
        .replace(/^checking\b/i, 'Check')
        .replace(/^trending\b/i, 'Trend')
        .replace(/^monitoring\b/i, 'Monitor')
        .replace(/^holding\b/i, 'Hold')
        .replace(/^avoiding\b/i, 'Avoid')
        .replace(/^stopping\b|^discontinuing\b|^discontinuation of\b/i, 'Stop')
        .replace(/^keeping\b|^maintaining\b/i, 'Keep')
        .replace(/^repeating\b|^rechecking\b/i, 'Repeat')
        .replace(/^titrating\b/i, 'Titrate')
        .replace(/^repleting\b/i, 'Replete')
        .replace(/^transfusing\b/i, 'Transfuse')
        .replace(/^scheduling\b|^arranging\b/i, 'Arrange')
        .replace(/^ordering\b/i, 'Order')
        .replace(/^switching\b|^transitioning\b/i, 'Transition')
        .replace(/^Continue\s+holding\b/i, 'Hold')
        .replace(/^Continue\s+avoiding\b/i, 'Avoid')
        .replace(/^Continue\s+continuing\b/i, 'Continue')
        .replace(/^Continue\s+starting\b/i, 'Start')
        .replace(/^Continue\s+stopping\b/i, 'Stop');

      // Condense verbose clinical phrases & standard medical abbreviations
      s = s
        .replace(/\bat (?:this|the present) time\b/gi, '')
        .replace(/\bas clinically indicated\b/gi, 'PRN')
        .replace(/\bin the setting of\b/gi, 'for')
        .replace(/\bwith regards? to\b/gi, 're:')
        .replace(/\bin order to\b/gi, 'to')
        .replace(/\bfor further evaluation of\b/gi, 'to evaluate')
        .replace(/\bon a daily basis\b/gi, 'daily')
        .replace(/\bprior to discharge\b/gi, 'before DC')
        .replace(/\bpost[- ]discharge\b/gi, 'post-DC')
        .replace(/\bfollow[- ]?up\b/gi, 'f/u')
        .replace(/\bintravenous(?:ly)?\b/gi, 'IV')
        .replace(/\bby mouth\b|\borally\b/gi, 'PO')
        .replace(/\bsubcutaneous(?:ly)?\b/gi, 'SQ')
        .replace(/\btwice daily\b|\btwice a day\b/gi, 'BID')
        .replace(/\bthree times daily\b|\bthree times a day\b/gi, 'TID')
        .replace(/\bfour times daily\b/gi, 'QID')
        .replace(/\bonce daily\b|\bevery day\b/gi, 'daily')
        .replace(/\bevery (\d+)\s*hours?\b/gi, 'q$1h')
        .replace(/\bdiscontinue\b/gi, 'stop')
        .replace(/\badminister\b/gi, 'give')
        .replace(/\butilize\b/gi, 'use')
        .replace(/\bpatient is cleared for\b/gi, 'Cleared for')
        .replace(/\bno further\s+(?:[a-z]+\s+)?intervention(?:s)?\s+(?:needed|required|warranted|indicated)\b/gi, 'No acute intervention needed')
        .replace(/\bwith goal\b/gi, 'goal')
        .replace(/\s*[,;]\s*$/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\.$/, '')
        .trim();

      if (!s || s.length < 3) continue;
      // Capitalize first character
      s = s.charAt(0).toUpperCase() + s.slice(1);

      const normKey = s.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!seen.has(normKey)) {
        seen.add(normKey);
        condensedItems.push(s);
      }
    }

    if (signedOff && !condensedItems.some(x => /sign(?:ing)?\s+off/i.test(x))) {
      condensedItems.push('Signing off');
    }

    if (condensedItems.length === 0) {
      // Fallback: trim whitespace & cap length cleanly
      const fallback = raw.replace(/\s+/g, ' ').trim();
      return fallback.length > 260 ? fallback.slice(0, 257) + '...' : fallback;
    }

    return condensedItems.slice(0, 8).join('; ') + '.';
  }

  function toLocalNoon(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day, 12, 0, 0, 0);
    }
    const dt = d instanceof Date ? new Date(d.getTime()) : (d ? new Date(d) : new Date());
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 12, 0, 0, 0);
  }

  function localIsoDate(baseDate = new Date(), offsetDays = 0) {
    const dt = toLocalNoon(baseDate);
    dt.setDate(dt.getDate() + offsetDays);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatIsoDate(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
    return toLocalNoon(isoStr).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit'
    });
  }

  function computeDcDateForWhen(whenVal, baseDate = new Date()) {
    const opts = typeof DC_WHEN_OPTIONS !== 'undefined' ? DC_WHEN_OPTIONS : [];
    const found = opts.find(o => o.value === whenVal);
    if (found && typeof found.offsetDays === 'number') {
      return localIsoDate(baseDate, found.offsetDays);
    }
    return '';
  }

  function inferDcWhenFromDate(isoStr, baseDate = new Date()) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
    const diff = Math.round((toLocalNoon(isoStr) - toLocalNoon(baseDate)) / 86400000);
    if (diff < 0) return '';
    if (diff === 0) return 'T';
    if (diff === 1) return 'T+1';
    if (diff === 2) return 'T+2';
    return '>T+2';
  }

  function formatVtePpx(patient) {
    const val = (patient?.vtePpx || '').trim();
    if (!val) return '';
    const opts = typeof VTE_PPX_OPTIONS !== 'undefined' ? VTE_PPX_OPTIONS : [];
    const found = opts.find(o => o.value === val);
    return found ? found.noteText : val;
  }

  function formatDischargeTiming(patient, baseDate = new Date()) {
    if (!patient) return '';
    const when = (patient.dcWhen || '').trim();
    const rawDate = (patient.dcDate || '').trim();
    if (when === 'TBD') return 'TBD';

    const iso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : computeDcDateForWhen(when, baseDate);

    if (iso) {
      const pretty = formatIsoDate(iso);
      const diff = Math.round((toLocalNoon(iso) - toLocalNoon(baseDate)) / 86400000);
      if (diff === 0) return `Today (${pretty})`;
      if (diff === 1) return `${pretty} (T+1)`;
      if (diff === 2) return `${pretty} (T+2)`;
      if (diff > 2) return `${pretty} (>T+2)`;
      return pretty;
    }

    if (when === '>T+2') return '>T+2';
    return when;
  }

  function formatDischargePlace(patient) {
    const val = (patient?.dcPlace || '').trim();
    if (!val) return '';
    const opts = typeof DC_PLACE_OPTIONS !== 'undefined' ? DC_PLACE_OPTIONS : [];
    const found = opts.find(o => o.value === val);
    return found ? found.label : val;
  }

  function formatDispositionSummary(patient, baseDate = new Date()) {
    if (!patient) return '';
    const timing = formatDischargeTiming(patient, baseDate);
    const place = formatDischargePlace(patient);
    const notes = (patient.disposition || '').trim();
    const structured = [
      place ? `Place: ${place}` : '',
      timing ? `Target: ${timing}` : ''
    ].filter(Boolean).join(' · ');
    if (structured && notes) return `${structured} — ${notes}`;
    return structured || notes;
  }

  function buildProgressNote(state, patient, opts = {}) {
    if (!patient) return '';
    const {
      includeConsults = true,
      includeOpenTasks = true,
      includeContingencies = false,
      stripNotes = true,
      now = new Date()
    } = opts;

    const todayStr = toLocalNoon(now).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit'
    });

    const lines = [];
    lines.push(`HOSPITALIST DAILY PROGRESS NOTE`);
    lines.push(`Date: ${todayStr} | Service: ${state.serviceName || 'Hospitalist Medicine'} | Provider: ${state.providerName || 'Hospitalist'}`);
    lines.push(`Patient: ${patient.name} (${patient.age}${patient.sex}) | Room: ${patient.room} | Hospital Day #${patient.hospitalDay} | Code Status: ${patient.codeStatus}`);
    lines.push(`Allergies: ${patient.allergies?.trim() || '*** (not recorded)'}`);
    lines.push('');

    // SUBJECTIVE
    lines.push(`SUBJECTIVE / OVERNIGHT EVENTS:`);
    lines.push(patient.subjective?.trim()
      ? patient.subjective.trim()
      : `Patient seen and examined at bedside. ***`);
    lines.push('');

    // OBJECTIVE
    lines.push(`OBJECTIVE:`);
    lines.push(`Vitals / Telemetry: ${patient.vitalsSummary?.trim() || '***'}`);
    lines.push(`Intake / Output:    ${patient.ioSummary?.trim() || '***'}`);
    lines.push(`Last BM:            ${patient.lastBm?.trim() || '***'}`);
    lines.push(`Weight:             ${patient.weightSummary?.trim() || '***'}`);
    lines.push('');
    lines.push(`Physical Exam:`);
    // Never document an exam that was not entered (use the explicit 'Normal exam' button instead)
    lines.push(patient.physicalExam?.trim() || '***');
    lines.push('');

    // DATA REVIEWED (Labs, Imaging, Consults)
    lines.push(`DATA REVIEWED:`);
    lines.push(`Labs / Micro: ${patient.labsSummary?.trim() || 'Reviewed in chart; ***'}`);
    lines.push(`Imaging / Diagnostics: ${patient.imagingSummary?.trim() || '***'}`);
    if (includeConsults && patient.consults?.length) {
      lines.push(`Consult Recommendations (Condensed):`);
      patient.consults.forEach(c => {
        const recText = (c.condensedNotes || '').trim()
          || (c.rawRecs ? condenseConsultRecommendations(c.rawRecs, c.service) : '')
          || (c.notes || '').trim();
        lines.push(`- ${c.service} [${c.status}]${recText ? ': ' + recText : ''}`);
      });
    }
    lines.push('');

    // ASSESSMENT & PLAN
    lines.push(`ASSESSMENT & PLAN:`);
    if (patient.oneLiner?.trim()) {
      lines.push(patient.oneLiner.trim());
      lines.push('');
    }

    if (patient.assessmentPlan?.trim()) {
      lines.push(patient.assessmentPlan.trim());
    } else {
      lines.push(`# ${patient.primaryDx || '***'}`);
      if (patient.clinicalNotes?.trim()) {
        lines.push(patient.clinicalNotes.trim());
      } else {
        lines.push(`- ***`);
      }
    }

    if (includeOpenTasks) {
      const openTasks = (patient.tasks || []).filter(t => !t.done);
      if (openTasks.length > 0) {
        lines.push('');
        lines.push(`# Pending Action Items Today:`);
        openTasks.forEach(t => {
          lines.push(`- ${t.urgent ? '[STAT] ' : ''}(${t.category}) ${t.text}`);
        });
      }
    }

    const vteText = formatVtePpx(patient);
    const dcTiming = formatDischargeTiming(patient, now);
    const dcPlace = formatDischargePlace(patient);
    const dispoNotes = (patient.disposition || '').trim();

    lines.push('');
    lines.push(`DISPOSITION & PROPHYLAXIS:`);
    lines.push(`- VTE Prophylaxis: ${vteText || '***'}`);
    lines.push(`- Discharge Plan: Anticipated ${dcTiming || '***'} | Destination: ${dcPlace || '***'}`);
    if (dispoNotes) {
      lines.push(`- Disposition / Barriers: ${dispoNotes}`);
    }
    lines.push(`- Code Status: ${patient.codeStatus || '***'}`);

    if (includeContingencies && patient.contingencies?.trim()) {
      lines.push(`- Contingencies: ${patient.contingencies.trim()}`);
    }

    let finalNote = lines.join('\n');
    if (stripNotes) {
      finalNote = stripEditorialNotes(finalNote);
    }
    return finalNote;
  }

  return {
    DEFAULT_NORMAL_EXAM,
    QUICK_SUBJECTIVE_PRESETS,
    getAllPhrases,
    getCategories,
    searchPhrases,
    suggestForPatient,
    expandInlineTriggers,
    jumpToNextWildcard,
    detectConsultService,
    condenseConsultRecommendations,
    localIsoDate,
    formatIsoDate,
    computeDcDateForWhen,
    inferDcWhenFromDate,
    formatVtePpx,
    formatDischargeTiming,
    formatDischargePlace,
    formatDispositionSummary,
    buildProgressNote
  };
})();

