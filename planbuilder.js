/**
 * RoundingOS — Interactive Workup & Management DotPhrase Mental Checklist Builder
 * 100% local, zero external CDN dependencies.
 * Supports 193+ structured hospitalist templates, paired Workup/Manage/Combined A&P,
 * 2025/2026 guideline pearls, contextual insulin/steroid calculators, Epic SmartLists,
 * inline *** wildcard quick-fills, custom phrases, and multi-problem Rounding A&P Cart.
 */

const PlanBuilder = (() => {
  const DEFAULT_SETTINGS = {
    prefix: 'GB',
    leadingDot: true,
    showTriggerHeader: true,
    compactLayout: false,
    stripWildcards: false
  };

  let hooks = null;
  let activeCategory = 'All';
  let searchQuery = '';
  let selectedId = null;
  let pairViewMode = 'single'; // 'single' | 'combined'
  let outputMode = 'note';     // 'note' | 'epic'
  let guidelineOpen = false;
  let settingsOpen = false;

  // Per-session ephemeral checklist state per phrase key (id or pairKey__combined)
  const checklistStates = {};
  // Multi-problem Rounding A&P Cart: [{ id, title, trigger, text }]
  // One cart per patient, so problems built from Patient A's chart can never be inserted into Patient B
  const carts = {};
  function cartKey() { return hooks?.getActivePatient?.()?.id || '__none__'; }
  function getCart() { if (!carts[cartKey()]) carts[cartKey()] = []; return carts[cartKey()]; }
  function clearCart() { carts[cartKey()] = []; }

  // Custom phrase modal state
  let editingCustomId = null;

  function init(config) {
    hooks = config;
    bindStaticEvents();
  }

  function getSettings() {
    const st = hooks?.getState?.();
    return Object.assign({}, DEFAULT_SETTINGS, st?.planBuilderSettings || {});
  }

  function updateSettings(patch) {
    const st = hooks?.getState?.();
    if (!st) return;
    st.planBuilderSettings = Object.assign({}, DEFAULT_SETTINGS, st.planBuilderSettings || {}, patch);
    hooks.saveState();
    renderAll();
  }

  function getStarredSet() {
    const st = hooks?.getState?.();
    return new Set(Array.isArray(st?.starredDotPhrases) ? st.starredDotPhrases : []);
  }

  function toggleStar(id) {
    const st = hooks?.getState?.();
    if (!st) return;
    const set = getStarredSet();
    if (set.has(id)) set.delete(id);
    else set.add(id);
    st.starredDotPhrases = Array.from(set);
    hooks.saveState();
    renderCatalog();
    renderBuilderHeader();
  }

  function getSmartLists() {
    return (typeof DOTPHRASE_STRUCTURED_DATA !== 'undefined' && DOTPHRASE_STRUCTURED_DATA.smartlists)
      ? DOTPHRASE_STRUCTURED_DATA.smartlists
      : {};
  }

  function normalizeCustomStructured(c) {
    if (c.structured) {
      return Object.assign({}, c.structured, { isCustom: true, id: c.structured.id || c.id || c.trigger.replace(/^\./, '') });
    }
    const cleanTrig = String(c.trigger || 'CUSTOM').replace(/^\./, '').toUpperCase();
    const lines = String(c.body || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const assessment = lines[0] || c.title || cleanTrig;
    const workup = [];
    const plan = [];
    let redFlags = '';
    let sec = 'plan';
    for (let i = 1; i < lines.length; i++) {
      const ln = lines[i];
      if (/^workup:?$/i.test(ln)) { sec = 'workup'; continue; }
      if (/^plan:?$/i.test(ln)) { sec = 'plan'; continue; }
      if (/^(disposition\/red flags|red flags):/i.test(ln)) {
        redFlags = ln.replace(/^(disposition\/red flags|red flags):\s*/i, '');
        continue;
      }
      const cleanLine = ln.replace(/^[-•*]\s*/, '');
      if (sec === 'workup') workup.push(cleanLine);
      else plan.push(cleanLine);
    }
    return {
      id: c.id || cleanTrig,
      trigger: cleanTrig,
      title: c.title || cleanTrig,
      category: c.category || 'Custom',
      pairKey: '',
      role: '',
      assessment,
      workup,
      plan,
      redFlags,
      notes: [],
      isCustom: true
    };
  }

  function getAllStructuredPhrases() {
    const builtins = (typeof DOTPHRASE_STRUCTURED_DATA !== 'undefined' && Array.isArray(DOTPHRASE_STRUCTURED_DATA.phrases))
      ? DOTPHRASE_STRUCTURED_DATA.phrases
      : [];
    const st = hooks?.getState?.();
    const customs = (st?.customDotPhrases || []).map(normalizeCustomStructured);
    return [...customs, ...builtins];
  }

  function formatTrigger(rawTrigger) {
    const s = getSettings();
    const clean = String(rawTrigger || '').replace(/^\./, '');
    const pfx = (s.prefix || 'GB').trim().toUpperCase();
    const replaced = clean.startsWith('GB') && pfx ? pfx + clean.slice(2) : clean;
    return (s.leadingDot ? '.' : '') + replaced;
  }

  function getPairPhrases(phrase, all) {
    if (!phrase || !phrase.pairKey) return null;
    const w = all.find(p => p.pairKey === phrase.pairKey && p.role === 'workup');
    const m = all.find(p => p.pairKey === phrase.pairKey && p.role === 'manage');
    if (!w || !m) return null;
    return { workup: w, manage: m };
  }

  function getActiveModel() {
    const all = getAllStructuredPhrases();
    let base = all.find(p => p.id === selectedId);
    if (!base && all.length) {
      base = all[0];
      selectedId = base.id;
    }
    if (!base) return null;

    const pair = getPairPhrases(base, all);
    if (pair && pairViewMode === 'combined') {
      const cleanTitle = base.title.replace(/\s*-\s*(workup|management)$/i, '');
      const notes = Array.from(new Set([...(pair.workup.notes || []), ...(pair.manage.notes || [])]));
      return {
        stateKey: `${base.pairKey}__combined`,
        base,
        pair,
        isCombined: true,
        id: `${base.pairKey}COMBINED`,
        trigger: `${pair.workup.trigger} + ${pair.manage.trigger}`,
        title: `${cleanTitle} — Combined Workup & Management`,
        category: base.category,
        assessment: `${pair.workup.assessment} ${pair.manage.assessment}`.trim(),
        workup: [...(pair.workup.workup || []), ...(pair.manage.workup || [])],
        plan: [...(pair.manage.plan || []), ...(pair.workup.plan || []).filter(x => !/see manage/i.test(x))],
        redFlags: pair.manage.redFlags || pair.workup.redFlags || '',
        guideline: pair.manage.guideline || pair.workup.guideline || null,
        notes,
        isCustom: false
      };
    }

    return {
      stateKey: base.id,
      base,
      pair,
      isCombined: false,
      id: base.id,
      trigger: base.trigger,
      title: base.title,
      category: base.category,
      assessment: base.assessment || '',
      workup: [...(base.workup || [])],
      plan: [...(base.plan || [])],
      redFlags: base.redFlags || '',
      guideline: base.guideline || null,
      notes: base.notes || [],
      isCustom: Boolean(base.isCustom)
    };
  }

  function getChecklistState(model) {
    if (!model) return null;
    const activePt = hooks?.getActivePatient?.();
    const scopedKey = `${activePt?.id || 'none'}::${model.stateKey}`;
    if (!checklistStates[scopedKey]) {
      const smartlists = getSmartLists();
      const slValues = {};
      Object.keys(smartlists).forEach(k => {
        slValues[k] = [...(smartlists[k].default || [])];
      });
      const cs = {
        scopedKey,
        workupChecked: model.workup.map(() => true),
        planChecked: model.plan.map(() => true),
        includeRedFlags: Boolean(model.redFlags),
        fills: {},
        autoFilledCount: 0,
        customLines: [],
        smartlists: slValues
      };
      if (activePt) {
        cs.autoFilledCount = autoFillFromChart(model, cs, { onlyEmpty: true });
      }
      checklistStates[scopedKey] = cs;
    }
    const cs = checklistStates[scopedKey];
    // Keep lengths synced if edited
    while (cs.workupChecked.length < model.workup.length) cs.workupChecked.push(true);
    while (cs.planChecked.length < model.plan.length) cs.planChecked.push(true);
    return cs;
  }

  function extractSmartListKeys(model) {
    if (!model) return [];
    const blob = [model.assessment, ...model.workup, ...model.plan, model.redFlags].join(' ');
    const found = [];
    const re = /\{(GB[A-Z0-9]+)\}/g;
    let m;
    while ((m = re.exec(blob)) !== null) {
      if (!found.includes(m[1]) && getSmartLists()[m[1]]) found.push(m[1]);
    }
    return found;
  }

  function resolveTextLine(raw, keyPrefix, cs, mode, stripWildcards) {
    let out = String(raw || '');
    let idx = 0;
    out = out.replace(/\*\*\*/g, () => {
      const val = (cs.fills[`${keyPrefix}_${idx}`] || '').trim();
      idx++;
      if (val) return val;
      if (mode === 'note' && stripWildcards) return '';
      return '***';
    });

    if (mode === 'note') {
      out = out.replace(/\{(GB[A-Z0-9]+)\}/g, (full, key) => {
        const vals = cs.smartlists?.[key];
        if (vals && vals.length) return vals.join(', ');
        return full;
      });
      if (stripWildcards) {
        out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
      }
    }
    return out;
  }

  function buildOutputText(model) {
    if (!model) return '';
    const cs = getChecklistState(model);
    const s = getSettings();
    const lines = [];

    if (outputMode === 'epic' && s.showTriggerHeader) {
      if (model.isCombined && model.pair) {
        lines.push(`${formatTrigger(model.pair.workup.trigger)} + ${formatTrigger(model.pair.manage.trigger)} — ${model.title}`);
      } else {
        lines.push(`${formatTrigger(model.trigger)} — ${model.title}`);
      }
    }

    const assess = resolveTextLine(model.assessment, 'a', cs, outputMode, s.stripWildcards);
    if (assess) lines.push(assess);

    const activeWorkup = [];
    model.workup.forEach((w, i) => {
      if (cs.workupChecked[i]) {
        const t = resolveTextLine(w, `w${i}`, cs, outputMode, s.stripWildcards);
        if (t) activeWorkup.push(t);
      }
    });

    const activePlan = [];
    model.plan.forEach((p, i) => {
      if (cs.planChecked[i]) {
        const t = resolveTextLine(p, `p${i}`, cs, outputMode, s.stripWildcards);
        if (t) activePlan.push(t);
      }
    });
    (cs.customLines || []).forEach(cl => {
      if (cl.trim()) activePlan.push(cl.trim());
    });

    if (activeWorkup.length) {
      if (!s.compactLayout) lines.push('Workup:');
      activeWorkup.forEach(w => lines.push('- ' + w));
    }

    if (activePlan.length) {
      if (!s.compactLayout && (activeWorkup.length || model.redFlags)) lines.push('Plan:');
      activePlan.forEach(p => lines.push('- ' + p));
    }

    if (model.redFlags && cs.includeRedFlags) {
      const rf = resolveTextLine(model.redFlags, 'rf', cs, outputMode, s.stripWildcards);
      if (rf) lines.push('Disposition/red flags: ' + rf);
    }

    return lines.join('\n');
  }

  function getSuggestedIdsForActivePatient() {
    const p = hooks?.getActivePatient?.();
    if (!p || typeof ProgressNoteEngine === 'undefined') return [];
    const allFlat = typeof BUILTIN_DOTPHRASES !== 'undefined' ? BUILTIN_DOTPHRASES : [];
    const suggested = ProgressNoteEngine.suggestForPatient(p, allFlat);
    return suggested.map(x => x.id || x.trigger.replace(/^\./, ''));
  }

  function parsePatientWeightKg() {
    const p = hooks?.getActivePatient?.();
    if (!p || !p.weightSummary) return null;
    const kgMatch = String(p.weightSummary).match(/(\d+(?:\.\d+)?)\s*kg/i);
    if (kgMatch) return Math.round(parseFloat(kgMatch[1]));
    const lbMatch = String(p.weightSummary).match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)/i);
    if (lbMatch) return Math.round(parseFloat(lbMatch[1]) / 2.20462);
    return null;
  }

  /**
   * Parses Cr, K, Na, Hgb, Lactate, Glucose, Ca, Albumin, Bili, INR, Mg, HCO3, Cl, BUN,
   * SpO2, O2 device, BP/MAP, HR, RR, EF, Weight, I&O, Code Status, Age, Sex, and Hospital Day
   * from the active patient's chart fields.
   */
  function extractChartSnapshot(patient) {
    if (!patient) return {};
    const labs = String(patient.labsSummary || '');
    const vitals = String(patient.vitalsSummary || '');
    const io = String(patient.ioSummary || '');
    const wt = String(patient.weightSummary || '');
    const img = String(patient.imagingSummary || '');
    const ctx = [patient.primaryDx, patient.oneLiner, patient.clinicalNotes, img].filter(Boolean).join(' ');
    const allText = [vitals, labs, io, wt, ctx].join(' | ');

    const grabNum = (str, re) => {
      const m = str.match(re);
      return m ? m[1] : null;
    };

    const weightKg = parsePatientWeightKg();
    const cr = grabNum(labs, /\b(?:cr|creatinine)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const baselineCr = grabNum(labs + ' ' + ctx, /\b(?:baseline|bl|prior)\s*(?:cr\s*)?[:=]?\s*(\d+(?:\.\d+)?)/i)
      || grabNum(labs, /\bcr\s*\d+(?:\.\d+)?\s*\((?:bl|baseline|from)\s*(\d+(?:\.\d+)?)\)/i);
    const k = grabNum(labs, /\b(?:k\+?|potassium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const na = grabNum(labs, /\b(?:na\+?|sodium)\s*[:=]?\s*(1[0-7]\d|\d{2,3}(?:\.\d+)?)/i);
    const hgb = grabNum(labs, /\b(?:hgb|hb|hemoglobin)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const lactate = grabNum(labs, /\b(?:lactate|lac)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const glucose = grabNum(labs + ' ' + vitals, /\b(?:bg|glucose|gluc|fsbg)\s*[:=]?\s*(\d{2,4})/i);
    const ca = grabNum(labs, /\b(?:ca\+?\+?|calcium|ionized\s*ca)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const alb = grabNum(labs, /\b(?:alb|albumin)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const bili = grabNum(labs, /\b(?:t?bili|bilirubin)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const inr = grabNum(labs, /\binr\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const mg = grabNum(labs, /\b(?:mg|magnesium)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const hco3 = grabNum(labs, /\b(?:hco3|bicarb|co2)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const cl = grabNum(labs, /\b(?:cl|chloride)\s*[:=]?\s*(\d{2,3})/i);
    const bun = grabNum(labs, /\bbun\s*[:=]?\s*(\d+(?:\.\d+)?)/i);

    const bpMatch = vitals.match(/\b(?:bp\s*[:=]?\s*)?(\d{2,3})\s*\/\s*(\d{2,3})\b/i);
    const sbp = bpMatch ? parseInt(bpMatch[1], 10) : null;
    const dbp = bpMatch ? parseInt(bpMatch[2], 10) : null;
    const bp = bpMatch ? `${sbp}/${dbp}` : null;
    const explicitMap = grabNum(vitals, /\bmap\s*[:=]?\s*(\d{2,3})/i);
    const map = explicitMap || (sbp && dbp ? String(Math.round((sbp + 2 * dbp) / 3)) : null);

    const hr = grabNum(vitals, /\b(?:hr|heart\s*rate|pulse)\s*[:=]?\s*(\d{2,3})/i);
    const rr = grabNum(vitals, /\b(?:rr|resp(?:iratory)?\s*rate)\s*[:=]?\s*(\d{1,2})/i);
    const spo2Num = grabNum(vitals, /\b(?:spo2|o2\s*sat|sat|sats)\s*[:=]?\s*(\d{2,3})\s*%?/i);
    const spo2 = spo2Num ? `${spo2Num}%` : null;
    const o2Match = vitals.match(/\b(\d+(?:\.\d+)?\s*L\s*(?:NC|nasal\s*cannula|HFNC|NRB|FM)?|room\s*air|\bRA\b|BiPAP|CPAP|HFNC(?:\s*\d+%?)?)\b/i);
    const o2Device = o2Match ? o2Match[1].trim() : null;

    const efMatch = allText.match(/\b(?:lv)?ef\s*[:=]?\s*(\d{2}\s*(?:-\s*\d{2})?\s*%?)/i);
    const ef = efMatch ? (efMatch[1].includes('%') ? efMatch[1].trim() : `${efMatch[1].trim()}%`) : null;

    const netMatch = io.match(/\bnet\s*[:=]?\s*([+\-]?\s*\d+(?:\.\d+)?\s*(?:mL|L)?)/i);
    const netIo = netMatch ? netMatch[1].replace(/\s+/g, ' ').trim() : null;
    const uopMatch = io.match(/\b(?:uop|urine(?:\s*output)?)\s*[:=]?\s*(\d+(?:\.\d+)?\s*(?:mL\/h|mL|L)?)/i);
    const uop = uopMatch ? uopMatch[1].trim() : null;

    const lowerCtx = ctx.toLowerCase();
    return {
      weightKg: weightKg ? String(weightKg) : null,
      cr, baselineCr, k, na, hgb, lactate, glucose, ca, alb, bili, inr, mg, hco3, cl, bun,
      bp, sbp, dbp, map, hr, rr, spo2, spo2Num: spo2Num ? parseInt(spo2Num, 10) : null, o2Device,
      ef, netIo, uop,
      codeStatus: patient.codeStatus || null,
      hospitalDay: patient.hospitalDay ? String(patient.hospitalDay) : null,
      age: patient.age ? Number(patient.age) : null,
      sex: (patient.sex || '').toUpperCase(),
      hasChf: /\b(hfref|hfpef|adhf|chf|heart\s+failure|cardiomyopathy)\b/i.test(lowerCtx),
      hasHtn: /\b(htn|hypertension)\b/i.test(lowerCtx),
      hasDm: /\b(t1dm|t2dm|dm1|dm2|diabetes|dka|hhs)\b/i.test(lowerCtx),
      hasStroke: /\b(stroke|tia|cva|systemic\s+embol\w*|arterial\s+thromboembol\w*)\b/i.test(lowerCtx),
      hasVasc: /\b(cad|pad|mi\b|nstemi|stemi|aortic\s+plaque|cabg)\b/i.test(lowerCtx),
      hasCancer: /\b(cancer|malignancy|carcinoma|lymphoma|leukemia|metastat)\b/i.test(lowerCtx),
      hasCardioPulm: /\b(copd|asthma|ild|hfref|hfpef|chf|heart\s+failure|cad)\b/i.test(lowerCtx)
    };
  }

  function matchChartValueForSlot(beforeRaw, afterRaw, snap) {
    const before = String(beforeRaw || '').toLowerCase();
    const after = String(afterRaw || '').toLowerCase();

    if (/\bbaseline\s*$/.test(before) && snap.baselineCr) return snap.baselineCr;
    if (/\b(?:cr|creatinine)\s*[:=]?\s*$/.test(before) && snap.cr) return snap.cr;
    if (/\b(?:k\+?|potassium)\s*[:=]?\s*$/.test(before) && snap.k) return snap.k;
    if (/\b(?:na\+?|sodium)\s*[:=]?\s*$/.test(before) && snap.na) return snap.na;
    if (/\b(?:hgb|hb|hemoglobin)\s*[:=]?\s*$/.test(before) && snap.hgb) return snap.hgb;
    if (/\blactate\s*[:=]?\s*$/.test(before) && snap.lactate) return snap.lactate;
    if (/\b(?:glucose|bg)\s*[:=]?\s*$/.test(before) && snap.glucose) return snap.glucose;
    if (/\b(?:corrected\/ionized\s*ca|ca)\s*[:=]?\s*$/.test(before) && snap.ca) {
      if (snap.alb && !isNaN(parseFloat(snap.ca)) && !isNaN(parseFloat(snap.alb))) {
        const corr = (parseFloat(snap.ca) + 0.8 * (4.0 - parseFloat(snap.alb))).toFixed(1);
        return `${corr} (measured ${snap.ca}, alb ${snap.alb})`;
      }
      return snap.ca;
    }
    if (/\bmg\s*[:=]?\s*$/.test(before) && snap.mg) return snap.mg;
    if (/\bmap\s*[:=]?\s*$/.test(before) && snap.map) return snap.map;
    if (/\bbp\s*[:=]?\s*$/.test(before) && snap.bp) return snap.bp;
    if (/\bhr\s*[:=]?\s*$/.test(before) && snap.hr) return snap.hr;
    if (/\bspo2\s*[:=]?\s*$/.test(before) && snap.spo2) return snap.spo2;
    if (/\bon\s*$/.test(before) && /spo2/i.test(before) && snap.o2Device) return snap.o2Device;
    if (/\b(?:today's\s+weight|weight)\s*[:=]?\s*$/.test(before) && snap.weightKg) {
      return /^\s*kg\b/.test(after) ? snap.weightKg : `${snap.weightKg} kg`;
    }
    if (/\bef\s*[:=]?\s*$/.test(before) && snap.ef) return snap.ef;
    if (/\bnet\s*[:=]?\s*$/.test(before) && snap.netIo) return snap.netIo;
    if (/\buop\s*[:=]?\s*$/.test(before) && snap.uop) return snap.uop;
    if (/\bcode\s*status\s*[:=]?\s*$/.test(before) && snap.codeStatus) return snap.codeStatus;
    if (/\bhospital\s*day\s*$/.test(before) && snap.hospitalDay) return snap.hospitalDay;
    if (/\bage\s*[:=]?\s*$/.test(before) && snap.age) return String(snap.age);
    return null;
  }

  function autoFillFromChart(model, cs, { onlyEmpty = true } = {}) {
    const p = hooks?.getActivePatient?.();
    if (!p || !model || !cs) return 0;
    const snap = extractChartSnapshot(p);
    let filled = 0;

    const scanLine = (raw, keyPrefix) => {
      if (!raw || !raw.includes('***')) return;
      const parts = String(raw).split('***');
      for (let i = 0; i < parts.length - 1; i++) {
        const key = `${keyPrefix}_${i}`;
        if (onlyEmpty && (cs.fills[key] || '').trim()) continue;
        const val = matchChartValueForSlot(parts[i], parts[i + 1] || '', snap);
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          cs.fills[key] = String(val);
          filled++;
        }
      }
    };

    scanLine(model.assessment, 'a');
    (model.workup || []).forEach((w, i) => scanLine(w, `w${i}`));
    (model.plan || []).forEach((pl, i) => scanLine(pl, `p${i}`));
    scanLine(model.redFlags, 'rf');

    // Also pre-select Epic SmartList {GBCODESTATUS} from patient's chart codeStatus
    if (snap.codeStatus && cs.smartlists?.GBCODESTATUS) {
      const choices = getSmartLists().GBCODESTATUS?.choices || [];
      const csLower = snap.codeStatus.toLowerCase();
      const matched = choices.find(ch =>
        (csLower.includes('comfort') && /comfort/i.test(ch)) ||
        (csLower.includes('dnr') && csLower.includes('dni') && /dnr\/dni$/i.test(ch)) ||
        (csLower.includes('dnr') && !csLower.includes('dni') && /dnr,\s*ok/i.test(ch)) ||
        (csLower.includes('full') && /full code/i.test(ch))
      );
      if (matched) cs.smartlists.GBCODESTATUS = [matched];
    }

    return filled;
  }

  /**
   * Helper for calculators to push a value into matching *** slots in assessment/plan,
   * or upsert a clean tagged line in customLines if the current view lacks that wildcard.
   */
  function pushCalcToModel(model, cs, beforeRegex, value, fallbackTag = null) {
    let matched = false;
    const applyToLine = (raw, prefix) => {
      if (!raw || !raw.includes('***')) return;
      const parts = String(raw).split('***');
      for (let k = 0; k < parts.length - 1; k++) {
        if (beforeRegex.test(parts[k])) {
          cs.fills[`${prefix}_${k}`] = String(value);
          matched = true;
        }
      }
    };
    applyToLine(model.assessment, 'a');
    (model.plan || []).forEach((ln, i) => applyToLine(ln, `p${i}`));
    if (!matched && fallbackTag) {
      const prefixStr = `${fallbackTag}:`;
      const existingIdx = (cs.customLines || []).findIndex(l => l.startsWith(prefixStr));
      const newLine = `${prefixStr} ${value}`;
      if (existingIdx >= 0) cs.customLines[existingIdx] = newLine;
      else cs.customLines.push(newLine);
    }
    return matched;
  }

  /* ========================================================================
     Rendering
     ======================================================================== */
  function renderAll() {
    renderPatientBanner();
    renderCategoryPills();
    renderCatalog();
    renderBuilder();
    renderPreview();
    renderCart();
  }

  function renderPatientBanner() {
    const bannerEl = document.getElementById('pbActivePatientChip');
    const insertBtn = document.getElementById('pbInsertToPatientBtn');
    const cartInsertBtn = document.getElementById('pbCartInsertAllBtn');
    const p = hooks?.getActivePatient?.();
    if (bannerEl) {
      if (p) {
        bannerEl.className = `pb-patient-banner acuity-${hooks.esc(p.priority || 'stable')}`;
        bannerEl.innerHTML = `Writing for <strong>Rm ${hooks.esc(p.room)} · ${hooks.esc(p.name)}</strong>`;
      } else {
        bannerEl.className = 'pb-patient-banner';
        bannerEl.innerHTML = `No patient selected — copy only`;
      }
    }
    if (insertBtn) {
      insertBtn.disabled = !p;
      insertBtn.textContent = p ? `Insert into Rm ${p.room} note` : 'Select a patient to insert';
    }
    if (cartInsertBtn) {
      cartInsertBtn.disabled = !p || getCart().length === 0;
    }
  }

  function renderCategoryPills() {
    const wrap = document.getElementById('pbCatPills');
    if (!wrap) return;
    const all = getAllStructuredPhrases();
    const starred = getStarredSet();
    const suggestedIds = getSuggestedIdsForActivePatient();
    const customCount = all.filter(p => p.isCustom).length;

    const counts = { All: all.length };
    all.forEach(p => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });

    const cats = ['All'];
    if (suggestedIds.length) cats.push('Suggested');
    const order = [
      'Top 30 Acute',
      'Rapid Response',
      'Chronic Conditions',
      'Daily Problems',
      'GOC & Code Status',
      'Insulin & Glycemic',
      'Home Oximetry',
      'Results SmartLinks'
    ];
    order.forEach(c => { if (counts[c]) cats.push(c); });
    Object.keys(counts).forEach(c => {
      if (c !== 'All' && !cats.includes(c)) cats.push(c);
    });
    cats.push('Starred');
    if (customCount > 0) cats.push('Custom');

    wrap.innerHTML = cats.map(c => {
      let label = c;
      let cnt = counts[c] || 0;
      if (c === 'Suggested') { label = 'For patient'; cnt = suggestedIds.length; }
      else if (c === 'Starred') { label = 'Starred'; cnt = starred.size; }
      else if (c === 'Custom') { label = 'Custom'; cnt = customCount; }
      const isAct = activeCategory === c;
      return `<button type="button" class="pb-cat-pill ${isAct ? 'active' : ''}" data-pb-cat="${hooks.esc(c)}">${hooks.esc(label)} <span class="pb-cat-cnt">${cnt}</span></button>`;
    }).join('');

    wrap.querySelectorAll('[data-pb-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.pbCat;
        renderCategoryPills();
        renderCatalog();
      });
    });
  }

  function getFilteredPhrases() {
    const all = getAllStructuredPhrases();
    const starred = getStarredSet();
    const suggestedIds = getSuggestedIdsForActivePatient();
    const q = searchQuery.trim().toLowerCase().replace(/^\./, '');

    let list = all.filter(p => {
      if (activeCategory === 'Suggested') {
        if (!suggestedIds.includes(p.id)) return false;
      } else if (activeCategory === 'Starred') {
        if (!starred.has(p.id)) return false;
      } else if (activeCategory === 'Custom') {
        if (!p.isCustom) return false;
      } else if (activeCategory !== 'All' && p.category !== activeCategory) {
        return false;
      }

      if (!q) return true;
      const hay = [
        p.title,
        p.trigger,
        formatTrigger(p.trigger),
        p.category,
        p.assessment,
        ...(p.workup || []),
        ...(p.plan || []),
        p.redFlags || '',
        p.guideline?.badge || ''
      ].join(' ').toLowerCase();
      return q.split(/\s+/).every(tok => hay.includes(tok));
    });

    if (activeCategory === 'Suggested') {
      const idxMap = new Map(suggestedIds.map((id, i) => [id, i]));
      list.sort((a, b) => (idxMap.get(a.id) ?? 999) - (idxMap.get(b.id) ?? 999));
    }
    return list;
  }

  function renderCatalog() {
    const listEl = document.getElementById('pbPhraseList');
    const countEl = document.getElementById('pbMatchCount');
    if (!listEl) return;

    const list = getFilteredPhrases();
    const starred = getStarredSet();
    if (countEl) countEl.textContent = `${list.length} template${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
      listEl.innerHTML = `<div class="pb-empty-state">No templates match "${hooks.esc(searchQuery)}". Try "sepsis", "adhf", "stroke", "insulin", or "hyponatremia".</div>`;
      return;
    }

    listEl.innerHTML = list.map(p => {
      const isSel = p.id === selectedId;
      const isStar = starred.has(p.id);
      const roleTag = p.role === 'workup'
        ? `<span class="pb-role-tag role-workup">Workup</span>`
        : p.role === 'manage'
          ? `<span class="pb-role-tag role-manage">Manage</span>`
          : '';
      const customTag = p.isCustom ? `<span class="pb-role-tag role-custom">Custom</span>` : '';

      return `
        <div class="pb-phrase-card ${isSel ? 'selected' : ''}" data-pb-select="${hooks.esc(p.id)}">
          <div class="pb-phrase-card-top">
            <code class="pb-trig-code">${hooks.esc(formatTrigger(p.trigger))}</code>
            <div class="pb-phrase-tags">
              ${customTag || roleTag}
              <button type="button" class="pb-star-mini ${isStar ? 'starred' : ''}" data-pb-star="${hooks.esc(p.id)}" title="${isStar ? 'Unstar' : 'Star favorite'}">${isStar ? '★' : '☆'}</button>
            </div>
          </div>
          <div class="pb-phrase-title">${hooks.esc(p.title)}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-pb-select]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-pb-star]')) return;
        selectedId = card.dataset.pbSelect;
        pairViewMode = 'single';
        guidelineOpen = false;
        renderCatalog();
        renderBuilder();
        renderPreview();
      });
    });

    listEl.querySelectorAll('[data-pb-star]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleStar(btn.dataset.pbStar);
      });
    });
  }

  function renderBuilderHeader() {
    const model = getActiveModel();
    const titleEl = document.getElementById('pbBuilderTitle');
    const trigEl = document.getElementById('pbBuilderTrigger');
    const starBtn = document.getElementById('pbStarActiveBtn');
    const customBtns = document.getElementById('pbCustomActions');
    if (!model) return;

    if (titleEl) titleEl.textContent = model.title;
    if (trigEl) {
      trigEl.textContent = model.isCombined && model.pair
        ? `${formatTrigger(model.pair.workup.trigger)} + ${formatTrigger(model.pair.manage.trigger)}`
        : formatTrigger(model.trigger);
    }
    const isStar = getStarredSet().has(model.base.id);
    if (starBtn) {
      starBtn.textContent = isStar ? '★ Starred' : '☆ Star';
      starBtn.classList.toggle('starred', isStar);
    }
    if (customBtns) {
      customBtns.innerHTML = model.isCustom
        ? `<button type="button" class="btn btn-xs btn-secondary" id="pbEditCustomBtn">Edit</button>
           <button type="button" class="btn btn-xs btn-danger-ghost" id="pbDeleteCustomBtn">Delete</button>`
        : `<button type="button" class="btn btn-xs btn-ghost" id="pbDupCustomBtn" title="Duplicate as editable custom phrase">Duplicate</button>`;

      document.getElementById('pbEditCustomBtn')?.addEventListener('click', () => openCustomModal(model.base));
      document.getElementById('pbDupCustomBtn')?.addEventListener('click', () => openCustomModal(model.base, true));
      document.getElementById('pbDeleteCustomBtn')?.addEventListener('click', () => deleteCustomPhrase(model.base.id));
    }
  }

  function renderWildcardInputs(rawText, keyPrefix, cs) {
    const count = (String(rawText || '').match(/\*\*\*/g) || []).length;
    if (count === 0) return '';
    // Build compact contextual labels around each ***
    const parts = String(rawText).split('***');
    let html = '<div class="pb-wc-row">';
    for (let i = 0; i < count; i++) {
      const before = (parts[i] || '').replace(/^.*[,;:]\s*/, '').trim().slice(-24);
      const label = before || `Field ${i + 1}`;
      const val = cs.fills[`${keyPrefix}_${i}`] || '';
      html += `
        <label class="pb-wc-pill">
          <span class="pb-wc-lbl">${hooks.esc(label)}</span>
          <input type="text" class="pb-wc-input" data-pb-fill="${hooks.esc(keyPrefix)}_${i}" value="${hooks.esc(val)}" placeholder="***" />
        </label>
      `;
    }
    html += '</div>';
    return html;
  }

  function renderCalculatorHtml(model) {
    const trig = model.base.trigger;
    const pk = model.base.pairKey || '';
    const snap = extractChartSnapshot(hooks?.getActivePatient?.());
    const defaultWt = snap.weightKg || '';
    const wtNote = snap.weightKg ? ` (chart: ${snap.weightKg} kg)` : '';

    // 1. Insulin TDD (GBINSULINSTART / GBINSULINTITRATE)
    if (trig === 'GBINSULINSTART' || trig === 'GBINSULINTITRATE') {
      return `
        <div class="pb-calc-box" id="pbInsulinCalcBox">
          <div class="pb-calc-head">
            <strong>Inpatient Weight-Based Insulin TDD Calculator</strong>
            <span class="small-muted">ADA 2026${hooks.esc(wtNote)}</span>
          </div>
          <div class="pb-calc-grid">
            <label class="pb-calc-field">
              <span>Weight (kg)</span>
              <input type="number" id="pbCalcWt" value="${defaultWt}" min="30" max="250" step="1" />
            </label>
            <label class="pb-calc-field">
              <span>Sensitivity Tier</span>
              <select id="pbCalcFactor">
                <option value="0.25">0.25 u/kg — Elderly / CKD / Frail / NPO</option>
                <option value="0.4" selected>0.4 u/kg — Standard Inpatient</option>
                <option value="0.55">0.55 u/kg — Obese / High IR / Steroids</option>
              </select>
            </label>
            <div class="pb-calc-result" id="pbCalcInsResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyInsCalcBtn">Apply to Plan</button>
          </div>
        </div>
      `;
    }

    // 2. Steroid-Induced NPH (GBINSULINSTEROID)
    if (trig === 'GBINSULINSTEROID') {
      return `
        <div class="pb-calc-box" id="pbSteroidCalcBox">
          <div class="pb-calc-head">
            <strong>Steroid-Induced Hyperglycemia NPH Calculator</strong>
            <span class="small-muted">0.1–0.4 u/kg AM NPH${hooks.esc(wtNote)}</span>
          </div>
          <div class="pb-calc-grid">
            <label class="pb-calc-field">
              <span>Weight (kg)</span>
              <input type="number" id="pbCalcStWt" value="${defaultWt}" min="30" max="250" step="1" />
            </label>
            <label class="pb-calc-field">
              <span>Prednisone Eq (mg/d)</span>
              <select id="pbCalcStFactor">
                <option value="0.1">10 mg (0.1 u/kg)</option>
                <option value="0.2" selected>20 mg (0.2 u/kg)</option>
                <option value="0.3">30 mg (0.3 u/kg)</option>
                <option value="0.4">>=40 mg (0.4 u/kg)</option>
              </select>
            </label>
            <div class="pb-calc-result" id="pbCalcStResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyStCalcBtn">Apply to Plan</button>
          </div>
        </div>
      `;
    }

    // 3. Hyponatremia — Corrected Na & 24h Correction Limit (GBHOSPHYPONATREMIA)
    if (pk === 'GBHOSPHYPONATREMIA' || /^GBHOSPHYPONATREMIA/.test(trig)) {
      const defNa = snap.na || '';
      const defGluc = snap.glucose || '';
      const highOdsAuto = defNa !== '' && Number(defNa) <= 105;
      return `
        <div class="pb-calc-box" id="pbNaCalcBox">
          <div class="pb-calc-head">
            <strong>Corrected Na (Katz) &amp; 24h Safe Correction Limit</strong>
            <span class="small-muted">Na + 1.6 × (Gluc − 100)/100</span>
          </div>
          <div class="pb-calc-grid">
            <label class="pb-calc-field">
              <span>Measured Na</span>
              <input type="number" id="pbNaVal" value="${defNa}" min="95" max="150" step="1" />
            </label>
            <label class="pb-calc-field">
              <span>Glucose (mg/dL)</span>
              <input type="number" id="pbNaGluc" value="${defGluc}" min="50" max="1200" step="10" />
            </label>
            <label class="pb-calc-check" title="Na <=105, AUD, cirrhosis, malnutrition, or hypokalemia">
              <input type="checkbox" id="pbNaHighOds" ${highOdsAuto ? 'checked' : ''} /> High ODS Risk (cap 6/24h)
            </label>
            <div class="pb-calc-result" id="pbNaResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyNaBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    // 4. Hypercalcemia — Corrected Calcium (GBHOSPHYPERCALCEMIA)
    if (pk === 'GBHOSPHYPERCALCEMIA' || /^GBHOSPHYPERCALCEMIA/.test(trig)) {
      const defCa = snap.ca || '';
      const defAlb = snap.alb || '';
      return `
        <div class="pb-calc-box" id="pbCaCalcBox">
          <div class="pb-calc-head">
            <strong>Albumin-Corrected Calcium (Payne Formula)</strong>
            <span class="small-muted">Ca + 0.8 × (4.0 − Alb)</span>
          </div>
          <div class="pb-calc-grid">
            <label class="pb-calc-field">
              <span>Total Ca (mg/dL)</span>
              <input type="number" id="pbCaVal" value="${defCa}" min="6" max="20" step="0.1" />
            </label>
            <label class="pb-calc-field">
              <span>Albumin (g/dL)</span>
              <input type="number" id="pbCaAlb" value="${defAlb}" min="1.0" max="5.5" step="0.1" />
            </label>
            <div class="pb-calc-result" id="pbCaResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyCaBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    // 5. DKA — Anion Gap, Corrected AG & Delta-Delta (GBHOSPDKA)
    if (pk === 'GBHOSPDKA' || /^GBHOSPDKA/.test(trig)) {
      const defNa = snap.na || '';
      const defCl = snap.cl || '';
      const defHco3 = snap.hco3 || '';
      const defAlb = snap.alb || '';
      const defGluc = snap.glucose || '';
      return `
        <div class="pb-calc-box" id="pbDkaCalcBox">
          <div class="pb-calc-head">
            <strong>Anion Gap, Corrected AG &amp; Delta-Delta Calculator</strong>
            <span class="small-muted">AG = Na − (Cl + HCO3)</span>
          </div>
          <div class="pb-calc-grid">
            <label class="pb-calc-field"><span>Na</span><input type="number" id="pbAgNa" value="${defNa}" step="1" /></label>
            <label class="pb-calc-field"><span>Cl</span><input type="number" id="pbAgCl" value="${defCl}" step="1" /></label>
            <label class="pb-calc-field"><span>HCO3</span><input type="number" id="pbAgHco3" value="${defHco3}" step="1" /></label>
            <label class="pb-calc-field"><span>Albumin</span><input type="number" id="pbAgAlb" value="${defAlb}" step="0.1" /></label>
            <label class="pb-calc-field"><span>Glucose</span><input type="number" id="pbAgGluc" value="${defGluc}" step="10" /></label>
            <div class="pb-calc-result" id="pbAgResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyAgBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    // 6. CAP — CURB-65 Score (GBHOSPPNA)
    if (pk === 'GBHOSPPNA' || /^GBHOSPPNA/.test(trig)) {
      const uAuto = snap.bun && parseFloat(snap.bun) > 19;
      const rAuto = snap.rr && parseFloat(snap.rr) >= 30;
      const bAuto = (snap.sbp && snap.sbp < 90) || (snap.dbp && snap.dbp <= 60);
      const aAuto = snap.age && snap.age >= 65;
      return `
        <div class="pb-calc-box" id="pbCurbCalcBox">
          <div class="pb-calc-head">
            <strong>CURB-65 Pneumonia Severity Calculator</strong>
            <span class="small-muted">Auto-checked from patient chart where available</span>
          </div>
          <div class="pb-calc-checks">
            <label class="pb-calc-check"><input type="checkbox" id="pbCurbC" /> Confusion (new AMS)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbCurbU" ${uAuto ? 'checked' : ''} /> BUN &gt; 19</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbCurbR" ${rAuto ? 'checked' : ''} /> RR &ge; 30</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbCurbB" ${bAuto ? 'checked' : ''} /> SBP &lt; 90 or DBP &le; 60</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbCurb65" ${aAuto ? 'checked' : ''} /> Age &ge; 65</label>
          </div>
          <div class="pb-calc-grid" style="margin-top:6px;">
            <div class="pb-calc-result" id="pbCurbResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyCurbBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    // 7. Decompensated Cirrhosis — MELD 3.0 & SAAG (GBHOSPCIRRHOSIS)
    if (pk === 'GBHOSPCIRRHOSIS' || /^GBHOSPCIRRHOSIS/.test(trig)) {
      const isFem = snap.sex === 'F';
      return `
        <div class="pb-calc-box" id="pbMeldCalcBox">
          <div class="pb-calc-head">
            <strong>MELD 3.0 &amp; Ascites SAAG Calculator</strong>
            <span class="small-muted">Kim et al. MELD 3.0 + Serum-Ascites Albumin Gradient</span>
          </div>
          <div class="pb-calc-grid">
            <label class="pb-calc-field"><span>Bili</span><input type="number" id="pbMeldBili" value="${snap.bili || ''}" step="0.1" min="0.1" /></label>
            <label class="pb-calc-field"><span>INR</span><input type="number" id="pbMeldInr" value="${snap.inr || ''}" step="0.1" min="0.8" /></label>
            <label class="pb-calc-field"><span>Cr</span><input type="number" id="pbMeldCr" value="${snap.cr || ''}" step="0.1" min="0.3" /></label>
            <label class="pb-calc-field"><span>Na</span><input type="number" id="pbMeldNa" value="${snap.na || ''}" step="1" min="110" max="150" /></label>
            <label class="pb-calc-field"><span>Serum Alb</span><input type="number" id="pbMeldAlb" value="${snap.alb || ''}" step="0.1" min="1.0" max="5.5" /></label>
            <label class="pb-calc-field"><span>Ascites Alb (opt)</span><input type="number" id="pbSaagAscAlb" value="" placeholder="e.g. 0.9" step="0.1" min="0" /></label>
            <label class="pb-calc-check"><input type="checkbox" id="pbMeldFem" ${isFem ? 'checked' : ''} /> Female (+1.33)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbMeldHd" /> Dialysis (2x/wk)</label>
          </div>
          <div class="pb-calc-grid" style="margin-top:6px;">
            <div class="pb-calc-result" id="pbMeldResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyMeldBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    // 8. Atrial Fibrillation — CHA2DS2-VASc (GBHOSPAFIB)
    if (pk === 'GBHOSPAFIB' || /^GBHOSPAFIB/.test(trig)) {
      const a75 = snap.age && snap.age >= 75;
      const a65 = snap.age && snap.age >= 65 && snap.age < 75;
      const fem = snap.sex === 'F';
      return `
        <div class="pb-calc-box" id="pbChadsCalcBox">
          <div class="pb-calc-head">
            <strong>CHA2DS2-VASc Stroke Risk Calculator</strong>
            <span class="small-muted">Auto-checked from chart age, sex &amp; history</span>
          </div>
          <div class="pb-calc-checks">
            <label class="pb-calc-check"><input type="checkbox" id="pbChC" ${snap.hasChf ? 'checked' : ''} /> CHF (+1)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChH" ${snap.hasHtn ? 'checked' : ''} /> HTN (+1)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChA2" ${a75 ? 'checked' : ''} /> Age &ge;75 (+2)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChD" ${snap.hasDm ? 'checked' : ''} /> Diabetes (+1)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChS2" ${snap.hasStroke ? 'checked' : ''} /> Stroke/TIA (+2)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChV" ${snap.hasVasc ? 'checked' : ''} /> Vascular (+1)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChA" ${a65 ? 'checked' : ''} /> Age 65–74 (+1)</label>
            <label class="pb-calc-check"><input type="checkbox" id="pbChSc" ${fem ? 'checked' : ''} /> Female (+1)</label>
          </div>
          <div class="pb-calc-grid" style="margin-top:6px;">
            <div class="pb-calc-result" id="pbChadsResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyChadsBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    // 9. DVT / Pulmonary Embolism — Wells PE & sPESI (GBHOSPVTE)
    if (pk === 'GBHOSPVTE' || /^GBHOSPVTE/.test(trig)) {
      const hrGt100 = snap.hr && parseFloat(snap.hr) > 100;
      const hrGe110 = snap.hr && parseFloat(snap.hr) >= 110;
      const ageGt80 = snap.age && snap.age > 80;
      const sbpLt100 = snap.sbp && snap.sbp < 100;
      const spo2Lt90 = snap.spo2Num && snap.spo2Num < 90;
      return `
        <div class="pb-calc-box" id="pbVteCalcBox">
          <div class="pb-calc-head">
            <strong>Wells PE &amp; sPESI Risk Calculator</strong>
            <span class="small-muted">Pre-test probability + 30-day PE mortality tier</span>
          </div>
          <div class="pb-vte-split">
            <div>
              <div class="pb-calc-subhead">Wells PE</div>
              <div class="pb-calc-checks">
                <label class="pb-calc-check"><input type="checkbox" id="pbWDvt" /> DVT signs (+3)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbWAlt" /> PE #1 dx (+3)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbWHr" ${hrGt100 ? 'checked' : ''} /> HR &gt;100 (+1.5)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbWImmob" /> Immob/surg (+1.5)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbWPrior" /> Prior VTE (+1.5)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbWHemo" /> Hemoptysis (+1)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbWCa" ${snap.hasCancer ? 'checked' : ''} /> Cancer (+1)</label>
              </div>
            </div>
            <div>
              <div class="pb-calc-subhead">sPESI</div>
              <div class="pb-calc-checks">
                <label class="pb-calc-check"><input type="checkbox" id="pbSAge" ${ageGt80 ? 'checked' : ''} /> Age &gt;80 (+1)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbSCa" ${snap.hasCancer ? 'checked' : ''} /> Cancer (+1)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbSCp" ${snap.hasCardioPulm ? 'checked' : ''} /> Chronic CP dx (+1)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbSHr" ${hrGe110 ? 'checked' : ''} /> HR &ge;110 (+1)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbSSbp" ${sbpLt100 ? 'checked' : ''} /> SBP &lt;100 (+1)</label>
                <label class="pb-calc-check"><input type="checkbox" id="pbSSpo2" ${spo2Lt90 ? 'checked' : ''} /> SpO2 &lt;90% (+1)</label>
              </div>
            </div>
          </div>
          <div class="pb-calc-grid" style="margin-top:6px;">
            <div class="pb-calc-result" id="pbVteResult">—</div>
            <button type="button" class="btn btn-sm btn-primary" id="pbApplyVteBtn">Apply to Assessment</button>
          </div>
        </div>
      `;
    }

    return '';
  }

  // Calculator inputs are never silently defaulted: blank -> result says what is missing, Apply disabled.
  function numVal(el) {
    if (!el) return NaN;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : NaN;
  }
  function calcNeeds(resEl, applyId, missing) {
    resEl.innerHTML = `<span class="small-muted">Enter ${missing.join(', ')} to calculate</span>`;
    const b = document.getElementById(applyId);
    if (b) b.disabled = true;
    return null;
  }
  function calcReady(applyId) {
    const b = document.getElementById(applyId);
    if (b) b.disabled = false;
  }

  function wireCalculatorEvents(model, cs) {
    // 1. Insulin TDD
    const wtEl = document.getElementById('pbCalcWt');
    const facEl = document.getElementById('pbCalcFactor');
    const resEl = document.getElementById('pbCalcInsResult');
    if (wtEl && facEl && resEl) {
      const compute = () => {
        const wt = numVal(wtEl);
        if (!(wt >= 25)) return calcNeeds(resEl, 'pbApplyInsCalcBtn', ['weight (kg)']);
        calcReady('pbApplyInsCalcBtn');
        const f = parseFloat(facEl.value) || 0.4;
        const tdd = Math.round(wt * f);
        const basal = Math.round(tdd * 0.5);
        const prandial = Math.max(1, Math.round((tdd * 0.5) / 3));
        resEl.innerHTML = `TDD <strong>${tdd} u</strong> · Basal <strong>${basal} u</strong> · Prandial <strong>${prandial} u</strong> TID`;
        return { wt, f, tdd, basal, prandial };
      };
      compute();
      wtEl.addEventListener('input', compute);
      facEl.addEventListener('change', compute);
      document.getElementById('pbApplyInsCalcBtn')?.addEventListener('click', () => {
        const r = compute();
        if (!r) return;
        model.plan.forEach((line, i) => {
          const lower = line.toLowerCase();
          const parts = line.split('***');
          for (let k = 0; k < parts.length - 1; k++) {
            const before = parts[k].toLowerCase();
            if (/weight\s*$/.test(before)) {
              cs.fills[`p${i}_${k}`] = String(r.wt);
            } else if (/^tdd\b/.test(lower) && /=\s*$/.test(before)) {
              // Template already says "= *** u": fill the number only, put the split on its own line
              const unitFollows = /^\s*u\b/i.test(parts[k + 1] || '');
              cs.fills[`p${i}_${k}`] = unitFollows ? String(r.tdd) : `${r.tdd} u`;
              const hasPlanToday = model.plan.some(l => /^plan today:/i.test(l));
              if (!hasPlanToday) {
                const tag = 'Insulin plan:';
                const lineTxt = `${tag} basal ${r.basal} u daily, prandial ${r.prandial} u TID AC`;
                const at = cs.customLines.findIndex(l => l.startsWith(tag));
                if (at >= 0) cs.customLines[at] = lineTxt; else cs.customLines.push(lineTxt);
              }
            } else if (/^plan today:/i.test(lower)) {
              if (/basal\s*$/.test(before)) cs.fills[`p${i}_${k}`] = String(r.basal);
              else if (/prandial\s*$/.test(before)) cs.fills[`p${i}_${k}`] = String(r.prandial);
            }
          }
        });
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied TDD ${r.tdd}u (Basal ${r.basal}u, Prandial ${r.prandial}u TID) to plan`);
      });
    }

    // 2. Steroid NPH
    const stWt = document.getElementById('pbCalcStWt');
    const stFac = document.getElementById('pbCalcStFactor');
    const stRes = document.getElementById('pbCalcStResult');
    if (stWt && stFac && stRes) {
      const computeSt = () => {
        const wt = numVal(stWt);
        if (!(wt >= 25)) return calcNeeds(stRes, 'pbApplyStCalcBtn', ['weight (kg)']);
        calcReady('pbApplyStCalcBtn');
        const f = parseFloat(stFac.value) || 0.2;
        const predMg = Math.round(f * 100);
        const nph = Math.max(4, Math.round(wt * f));
        stRes.innerHTML = `AM NPH: <strong>${nph} units</strong> (${predMg} mg pred eq)`;
        return { wt, f, predMg, nph };
      };
      computeSt();
      stWt.addEventListener('input', computeSt);
      stFac.addEventListener('change', computeSt);
      document.getElementById('pbApplyStCalcBtn')?.addEventListener('click', () => {
        const r = computeSt();
        if (!r) return;
        model.plan.forEach((line, i) => {
          const lower = line.toLowerCase();
          const parts = line.split('***');
          for (let k = 0; k < parts.length - 1; k++) {
            const before = parts[k].toLowerCase();
            if (/steroid:\s*$/.test(before)) cs.fills[`p${i}_${k}`] = String(r.predMg);
            else if (/weight\s*$/.test(before)) cs.fills[`p${i}_${k}`] = String(r.wt);
            else if (/^nph\b/.test(lower) && /=\s*$/.test(before)) cs.fills[`p${i}_${k}`] = String(r.nph);
          }
        });
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied AM NPH ${r.nph} units (${r.predMg} mg pred eq, ${r.wt} kg)`);
      });
    }

    // 3. Corrected Na & 24h Limit
    const naVal = document.getElementById('pbNaVal');
    const naGluc = document.getElementById('pbNaGluc');
    const naOds = document.getElementById('pbNaHighOds');
    const naRes = document.getElementById('pbNaResult');
    if (naVal && naGluc && naRes) {
      const computeNa = () => {
        const na = numVal(naVal);
        if (!Number.isFinite(na)) return calcNeeds(naRes, 'pbApplyNaBtn', ['measured Na']);
        calcReady('pbApplyNaBtn');
        const glucRaw = numVal(naGluc);
        const gluc = Number.isFinite(glucRaw) ? glucRaw : 100; // blank glucose = no correction (stated below)
        const factor = gluc > 400 ? 2.4 : 1.6;
        const corr = (na + Math.max(0, (gluc - 100) / 100) * factor).toFixed(1);
        const limit = naOds?.checked ? 6 : 8;
        // With significant hyperglycemia the correction limit is anchored to the glucose-corrected Na
        const base = gluc > 200 ? parseFloat(corr) : na;
        const cap = Math.round(base + limit);
        naRes.innerHTML = `Corrected Na <strong>${corr}</strong>${Number.isFinite(glucRaw) ? '' : ' <span class="small-muted">(no glucose entered)</span>'} · 24h limit <strong>&le;+${limit} mEq/L</strong> (max <strong>${cap}</strong>${gluc > 200 ? ' from corrected Na' : ''})`;
        return { na, gluc, corr, limit, cap };
      };
      computeNa();
      [naVal, naGluc, naOds].forEach(x => x?.addEventListener('input', computeNa));
      naOds?.addEventListener('change', computeNa);
      document.getElementById('pbApplyNaBtn')?.addEventListener('click', () => {
        const r = computeNa();
        if (!r) return;
        const naText = r.gluc > 140 ? `${r.na} (corrected ${r.corr} for gluc ${r.gluc})` : `${r.na}`;
        pushCalcToModel(model, cs, /\bna\s*$/i, naText, 'Corrected Na');
        pushCalcToModel(model, cs, /24h\s+change\s*$/i, `goal <=+${r.limit}/24h, cap ${r.cap}`, '24h Na correction limit');
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied Corrected Na ${r.corr} & 24h cap ${r.cap}`);
      });
    }

    // 4. Corrected Calcium
    const caVal = document.getElementById('pbCaVal');
    const caAlb = document.getElementById('pbCaAlb');
    const caRes = document.getElementById('pbCaResult');
    if (caVal && caAlb && caRes) {
      const computeCa = () => {
        const ca = numVal(caVal);
        const alb = numVal(caAlb);
        const miss = [];
        if (!Number.isFinite(ca)) miss.push('total Ca');
        if (!Number.isFinite(alb)) miss.push('albumin');
        if (miss.length) return calcNeeds(caRes, 'pbApplyCaBtn', miss);
        calcReady('pbApplyCaBtn');
        const corr = parseFloat((ca + 0.8 * (4.0 - alb)).toFixed(1));
        const sev = corr > 14 ? 'Severe' : corr >= 12 ? 'Moderate' : corr > 10.5 ? 'Mild' : 'Normal';
        caRes.innerHTML = `Corrected Ca <strong>${corr} mg/dL</strong> (${sev})`;
        return { ca, alb, corr, sev };
      };
      computeCa();
      caVal.addEventListener('input', computeCa);
      caAlb.addEventListener('input', computeCa);
      document.getElementById('pbApplyCaBtn')?.addEventListener('click', () => {
        const r = computeCa();
        if (!r) return;
        pushCalcToModel(model, cs, /\bca\s*$/i, `${r.corr} mg/dL (${r.sev}; total ${r.ca}, alb ${r.alb})`, 'Corrected Ca');
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied Corrected Ca ${r.corr} mg/dL (${r.sev})`);
      });
    }

    // 5. DKA Anion Gap & Delta-Delta
    const agNa = document.getElementById('pbAgNa');
    const agCl = document.getElementById('pbAgCl');
    const agHco3 = document.getElementById('pbAgHco3');
    const agAlb = document.getElementById('pbAgAlb');
    const agGluc = document.getElementById('pbAgGluc');
    const agRes = document.getElementById('pbAgResult');
    if (agNa && agCl && agHco3 && agRes) {
      const computeAg = () => {
        const na = numVal(agNa);
        const cl = numVal(agCl);
        const hco3 = numVal(agHco3);
        const miss = [];
        if (!Number.isFinite(na)) miss.push('Na');
        if (!Number.isFinite(cl)) miss.push('Cl');
        if (!Number.isFinite(hco3)) miss.push('HCO3');
        if (miss.length) return calcNeeds(agRes, 'pbApplyAgBtn', miss);
        calcReady('pbApplyAgBtn');
        const albRaw = numVal(agAlb);
        const alb = Number.isFinite(albRaw) ? albRaw : 4.0; // blank albumin = no albumin correction
        const glucRaw = numVal(agGluc);
        const gluc = Number.isFinite(glucRaw) ? glucRaw : null;
        const ag = Math.round(na - (cl + hco3));
        const corrAg = parseFloat((ag + 2.5 * (4.0 - alb)).toFixed(1));
        const dAg = corrAg - 12;
        const dHco3 = 24 - hco3;
        let ddStr = 'N/A';
        let interp = 'Normal AG';
        if (dAg > 0 && dHco3 > 0) {
          const dd = dAg / dHco3;
          ddStr = dd.toFixed(2);
          interp = dd < 0.4 ? 'Pure NAGMA' : dd < 0.8 ? 'HAGMA + NAGMA' : dd <= 2.0 ? 'Pure HAGMA' : 'HAGMA + met alk/chronic resp acid';
        } else if (dAg > 0) {
          interp = 'HAGMA + metabolic alkalosis (HCO3 not reduced)';
        }
        if (!Number.isFinite(albRaw)) interp += '; no albumin entered';
        agRes.innerHTML = `AG <strong>${ag}</strong> (corr <strong>${corrAg}</strong>) · &Delta;/&Delta; <strong>${ddStr}</strong> (${interp})`;
        return { ag, corrAg, ddStr, interp, gluc };
      };
      computeAg();
      [agNa, agCl, agHco3, agAlb, agGluc].forEach(x => x?.addEventListener('input', computeAg));
      document.getElementById('pbApplyAgBtn')?.addEventListener('click', () => {
        const r = computeAg();
        if (!r) return;
        if (r.gluc !== null) pushCalcToModel(model, cs, /\bglucose\s*$/i, String(r.gluc));
        pushCalcToModel(model, cs, /\bag\s*$/i, `${r.ag} (corr ${r.corrAg}, delta/delta ${r.ddStr} — ${r.interp})`, 'Anion Gap / Delta-Delta');
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied AG ${r.ag} (corr ${r.corrAg}, Δ/Δ ${r.ddStr})`);
      });
    }

    // 6. CURB-65
    const curbRes = document.getElementById('pbCurbResult');
    if (curbRes) {
      const ids = ['pbCurbC', 'pbCurbU', 'pbCurbR', 'pbCurbB', 'pbCurb65'];
      const computeCurb = () => {
        const score = ids.reduce((acc, id) => acc + (document.getElementById(id)?.checked ? 1 : 0), 0);
        const risk = score <= 1 ? 'Low risk (outpt)' : score === 2 ? 'Moderate (inpatient)' : 'Severe (consider ICU)';
        curbRes.innerHTML = `CURB-65: <strong>${score}/5</strong> — ${risk}`;
        return { score, risk };
      };
      computeCurb();
      ids.forEach(id => document.getElementById(id)?.addEventListener('change', computeCurb));
      document.getElementById('pbApplyCurbBtn')?.addEventListener('click', () => {
        const r = computeCurb();
        pushCalcToModel(model, cs, /curb-65\s*$/i, `${r.score}/5 (${r.risk})`, 'CURB-65');
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied CURB-65 ${r.score}/5 (${r.risk})`);
      });
    }

    // 7. MELD 3.0 & SAAG
    const meldRes = document.getElementById('pbMeldResult');
    if (meldRes) {
      const computeMeld = () => {
        const g = id => numVal(document.getElementById(id));
        const hd = Boolean(document.getElementById('pbMeldHd')?.checked);
        const vals = { Bili: g('pbMeldBili'), INR: g('pbMeldInr'), Cr: g('pbMeldCr'), Na: g('pbMeldNa'), Albumin: g('pbMeldAlb') };
        const miss = Object.keys(vals).filter(k => !Number.isFinite(vals[k]) && !(k === 'Cr' && hd));
        if (miss.length) return calcNeeds(meldRes, 'pbApplyMeldBtn', miss);
        calcReady('pbApplyMeldBtn');
        const bili = Math.max(1.0, vals.Bili);
        const inr = Math.max(1.0, vals.INR);
        const cr = hd ? 3.0 : Math.min(3.0, Math.max(1.0, vals.Cr));
        const na = Math.min(137, Math.max(125, vals.Na));
        const rawAlb = vals.Albumin;
        const alb = Math.min(3.5, Math.max(1.5, rawAlb));
        const fem = document.getElementById('pbMeldFem')?.checked ? 1 : 0;

        const rawMeld = 1.33 * fem
          + 4.56 * Math.log(bili)
          + 0.82 * (137 - na)
          - 0.24 * (137 - na) * Math.log(bili)
          + 9.09 * Math.log(inr)
          + 11.14 * Math.log(cr)
          + 1.85 * (3.5 - alb)
          - 1.83 * (3.5 - alb) * Math.log(cr)
          + 6;
        const meld3 = Math.min(40, Math.max(6, Math.round(rawMeld)));

        const ascVal = document.getElementById('pbSaagAscAlb')?.value;
        let saagText = '';
        if (ascVal !== '' && !isNaN(parseFloat(ascVal))) {
          const saag = (rawAlb - parseFloat(ascVal)).toFixed(1);
          const saagInterp = parseFloat(saag) >= 1.1 ? 'portal HTN' : 'non-portal HTN';
          saagText = `${saag} (${saagInterp})`;
        }
        meldRes.innerHTML = `MELD 3.0: <strong>${meld3}</strong>${meld3 >= 15 ? ' (transplant eval)' : ''}${saagText ? ` · SAAG <strong>${saagText}</strong>` : ''}`;
        return { meld3, saagText };
      };
      computeMeld();
      ['pbMeldBili','pbMeldInr','pbMeldCr','pbMeldNa','pbMeldAlb','pbSaagAscAlb','pbMeldFem','pbMeldHd'].forEach(id => {
        const x = document.getElementById(id);
        x?.addEventListener('input', computeMeld);
        x?.addEventListener('change', computeMeld);
      });
      document.getElementById('pbApplyMeldBtn')?.addEventListener('click', () => {
        const r = computeMeld();
        if (!r) return;
        pushCalcToModel(model, cs, /meld\s*3\.0\s*$/i, String(r.meld3), 'MELD 3.0');
        if (r.saagText) {
          pushCalcToModel(model, cs, /\bsaag\s*$/i, r.saagText, 'Ascites SAAG');
        }
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied MELD 3.0 = ${r.meld3}${r.saagText ? `, SAAG ${r.saagText}` : ''}`);
      });
    }

    // 8. CHA2DS2-VASc
    const chadsRes = document.getElementById('pbChadsResult');
    if (chadsRes) {
      const items = [['pbChC',1],['pbChH',1],['pbChA2',2],['pbChD',1],['pbChS2',2],['pbChV',1],['pbChA',1],['pbChSc',1]];
      const computeChads = () => {
        // Mutual exclusion for age >=75 vs 65-74
        const a75 = document.getElementById('pbChA2');
        const a65 = document.getElementById('pbChA');
        if (a75?.checked && a65?.checked) a65.checked = false;
        const score = items.reduce((acc, [id, pts]) => acc + (document.getElementById(id)?.checked ? pts : 0), 0);
        const fem = Boolean(document.getElementById('pbChSc')?.checked);
        const nonSex = score - (fem ? 1 : 0);
        const rec = nonSex >= 2 ? 'OAC recommended' : nonSex === 1 ? 'Consider OAC' : 'Low risk (no OAC)';
        chadsRes.innerHTML = `CHA2DS2-VASc: <strong>${score}</strong> — ${rec}`;
        return { score, rec };
      };
      computeChads();
      items.forEach(([id]) => document.getElementById(id)?.addEventListener('change', computeChads));
      document.getElementById('pbApplyChadsBtn')?.addEventListener('click', () => {
        const r = computeChads();
        pushCalcToModel(model, cs, /cha2ds2-vasc\s*$/i, `${r.score} (${r.rec})`, 'CHA2DS2-VASc');
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied CHA2DS2-VASc ${r.score} (${r.rec})`);
      });
    }

    // 9. Wells PE & sPESI
    const vteRes = document.getElementById('pbVteResult');
    if (vteRes) {
      const wItems = [['pbWDvt',3],['pbWAlt',3],['pbWHr',1.5],['pbWImmob',1.5],['pbWPrior',1.5],['pbWHemo',1],['pbWCa',1]];
      const sItems = ['pbSAge','pbSCa','pbSCp','pbSHr','pbSSbp','pbSSpo2'];
      const computeVte = () => {
        const wells = wItems.reduce((acc, [id, pts]) => acc + (document.getElementById(id)?.checked ? pts : 0), 0);
        const spesi = sItems.reduce((acc, id) => acc + (document.getElementById(id)?.checked ? 1 : 0), 0);
        const wTier = wells > 4 ? 'PE likely' : 'PE unlikely';
        const sTier = spesi >= 1 ? 'High risk (30d mort ~11%)' : 'Low risk (0)';
        const riskClass = spesi === 0 ? 'Low risk (sPESI 0)' : 'Intermediate/High risk (sPESI ' + spesi + ')';
        vteRes.innerHTML = `Wells <strong>${wells}</strong> (${wTier}) · sPESI <strong>${spesi}</strong> (${sTier})`;
        return { wells, wTier, spesi, sTier, riskClass };
      };
      computeVte();
      [...wItems.map(x => x[0]), ...sItems].forEach(id => document.getElementById(id)?.addEventListener('change', computeVte));
      document.getElementById('pbApplyVteBtn')?.addEventListener('click', () => {
        const r = computeVte();
        pushCalcToModel(model, cs, /\bwells\s*$/i, `${r.wells} (${r.wTier})`, 'Wells PE');
        pushCalcToModel(model, cs, /\bspesi\s*$/i, `${r.spesi} (${r.sTier})`, 'sPESI');
        pushCalcToModel(model, cs, /risk\s+class\s*$/i, r.riskClass);
        renderBuilder();
        renderPreview();
        hooks.showToast(`Applied Wells ${r.wells} & sPESI ${r.spesi}`);
      });
    }
  }

  function renderBuilder() {
    const model = getActiveModel();
    const bodyEl = document.getElementById('pbBuilderBody');
    if (!model || !bodyEl) return;

    renderBuilderHeader();
    const cs = getChecklistState(model);
    const smartlists = getSmartLists();
    const slKeys = extractSmartListKeys(model);

    // 1. Paired Condition Switcher
    let pairHtml = '';
    if (model.pair) {
      const isW = !model.isCombined && model.base.role === 'workup';
      const isM = !model.isCombined && model.base.role === 'manage';
      const isC = model.isCombined;
      pairHtml = `
        <div class="pb-pair-bar">
          <span class="pb-pair-label">View:</span>
          <div class="segmented-control">
            <button type="button" class="seg-btn ${isW ? 'active' : ''}" data-pb-pair="workup">Workup Only</button>
            <button type="button" class="seg-btn ${isM ? 'active' : ''}" data-pb-pair="manage">Manage Only</button>
            <button type="button" class="seg-btn ${isC ? 'active' : ''}" data-pb-pair="combined">Combined A&amp;P</button>
          </div>
        </div>
      `;
    }

    // 2. Collapsible Guideline & Clinical Notes Drawer
    let guideHtml = '';
    if (model.guideline || (model.notes && model.notes.length)) {
      const badgeText = model.guideline ? model.guideline.badge : `${model.notes.length} Clinical Pearl${model.notes.length > 1 ? 's' : ''}`;
      guideHtml = `
        <div class="pb-guideline-box">
          <button type="button" class="pb-guideline-toggle" id="pbGuidelineToggleBtn" aria-expanded="${guidelineOpen}">
            <span class="pb-guide-badge">${hooks.esc(badgeText)}</span>
            <span class="small-muted">Reference only — not copied into note</span>
            <span class="chevron">${guidelineOpen ? '▴' : '▾'}</span>
          </button>
          <div class="pb-guideline-body ${guidelineOpen ? '' : 'hidden'}" id="pbGuidelineBody">
            ${model.guideline ? `
              <p>${hooks.esc(model.guideline.summary)}</p>
              ${/^https:\/\//i.test(model.guideline.url || '') ? `<a href="${hooks.esc(model.guideline.url)}" target="_blank" rel="noopener noreferrer" class="pb-guide-link">Open Official Guideline Source ↗</a>` : ''}
            ` : ''}
            ${(model.notes || []).length ? `
              <ul class="pb-notes-list">
                ${model.notes.map(n => `<li>${hooks.esc(n)}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        </div>
      `;
    }

    // 3. Contextual Calculators
    const calcHtml = renderCalculatorHtml(model);

    // 4. SmartLists (for GOC & Code Status phrases)
    let slHtml = '';
    if (slKeys.length) {
      slHtml = `
        <div class="pb-section-block pb-smartlists-box">
          <div class="pb-section-head">
            <span>Epic SmartLists (${slKeys.length})</span>
            <span class="small-muted">${outputMode === 'note' ? 'Selections auto-fill into Ready-to-Paste Note' : 'Kept as {SmartList} tokens in Epic mode'}</span>
          </div>
          ${slKeys.map(k => {
            const def = smartlists[k];
            const selectedVals = cs.smartlists[k] || [];
            return `
              <div class="pb-sl-group">
                <div class="pb-sl-title"><code>{${hooks.esc(k)}}</code> <span class="small-muted">${def.multi ? 'Multi-select' : 'Single-select'}</span></div>
                <div class="pb-sl-chips">
                  ${def.choices.map(ch => {
                    const active = selectedVals.includes(ch);
                    return `<button type="button" class="pb-sl-chip ${active ? 'active' : ''}" data-pb-sl-key="${hooks.esc(k)}" data-pb-sl-val="${hooks.esc(ch)}">${hooks.esc(ch)}</button>`;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // 5. Workup Checklist
    const workupCheckedCount = cs.workupChecked.filter(Boolean).length;
    const planCheckedCount = cs.planChecked.filter(Boolean).length;

    const workupHtml = model.workup.length ? `
      <div class="pb-section-block">
        <div class="pb-section-head">
          <span>Workup</span>
          <span class="pb-count-pill">${workupCheckedCount} / ${model.workup.length}</span>
        </div>
        <div class="pb-check-list">
          ${model.workup.map((item, i) => `
            <div class="pb-check-item ${cs.workupChecked[i] ? 'checked' : 'unchecked'}">
              <label class="pb-check-row">
                <input type="checkbox" data-pb-wcheck="${i}" ${cs.workupChecked[i] ? 'checked' : ''} />
                <span>${hooks.esc(item)}</span>
              </label>
              ${cs.workupChecked[i] ? renderWildcardInputs(item, `w${i}`, cs) : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    // 6. Plan / Management Checklist
    const planHtml = `
      <div class="pb-section-block">
        <div class="pb-section-head">
          <span>Plan</span>
          <span class="pb-count-pill">${planCheckedCount + cs.customLines.length} / ${model.plan.length + cs.customLines.length}</span>
        </div>
        <div class="pb-check-list">
          ${model.plan.map((item, i) => `
            <div class="pb-check-item ${cs.planChecked[i] ? 'checked' : 'unchecked'}">
              <label class="pb-check-row">
                <input type="checkbox" data-pb-pcheck="${i}" ${cs.planChecked[i] ? 'checked' : ''} />
                <span>${hooks.esc(item)}</span>
              </label>
              ${cs.planChecked[i] ? renderWildcardInputs(item, `p${i}`, cs) : ''}
            </div>
          `).join('')}
          ${cs.customLines.map((cl, idx) => `
            <div class="pb-check-item checked pb-custom-bullet-row">
              <span>• ${hooks.esc(cl)}</span>
              <button type="button" class="btn btn-xs btn-ghost" data-pb-rm-custom-line="${idx}" title="Remove custom bullet">×</button>
            </div>
          `).join('')}
        </div>
        <div class="pb-add-line-row">
          <input type="text" id="pbInlineCustomLine" placeholder="Add patient-specific plan bullet (or dictate)..." />
          <button type="button" class="mic-btn mic-icon-only" data-dictate-target="pbInlineCustomLine" title="Dictate custom bullet">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          </button>
          <button type="button" class="btn btn-xs btn-secondary" id="pbAddInlineLineBtn">+ Add</button>
        </div>
      </div>
    `;

    // 7. Disposition / Red Flags
    const redFlagsHtml = model.redFlags ? `
      <div class="pb-section-block pb-redflag-block">
        <label class="pb-check-row">
          <input type="checkbox" id="pbRedFlagCheck" ${cs.includeRedFlags ? 'checked' : ''} />
          <span><strong>Disposition / Red Flags:</strong> ${hooks.esc(model.redFlags)}</span>
        </label>
        ${cs.includeRedFlags ? renderWildcardInputs(model.redFlags, 'rf', cs) : ''}
      </div>
    ` : '';

    bodyEl.innerHTML = `
      ${pairHtml}
      ${guideHtml}
      ${calcHtml}

      <div class="pb-quick-toolbar">
        <button type="button" class="btn btn-xs btn-secondary" id="pbAutoFillBtn" title="Pull Cr, K, Na, Hgb, Lactate, SpO2, BP/MAP, Weight &amp; Code Status from active patient chart">Fill from chart</button>
        <button type="button" class="btn btn-xs btn-secondary" id="pbCheckAllBtn">Check All</button>
        <button type="button" class="btn btn-xs btn-secondary" id="pbMinimalCoreBtn" title="Select top 2 workup + top 3 management core bullets">Minimal Core</button>
        <button type="button" class="btn btn-xs btn-ghost" id="pbClearFillsBtn">Clear Fills</button>
        <button type="button" class="btn btn-xs btn-ghost" id="pbResetChecklistBtn">Reset</button>
        ${cs.autoFilledCount > 0 ? `<span class="pb-autofill-pill" title="Pre-populated from patient snapshot">Chart filled ${cs.autoFilledCount}</span>` : ''}
      </div>

      <div class="pb-section-block pb-assess-block">
        <div class="pb-section-head"><span>Assessment Line</span></div>
        <div class="pb-assess-text">${hooks.esc(model.assessment)}</div>
        ${renderWildcardInputs(model.assessment, 'a', cs)}
      </div>

      ${slHtml}
      ${workupHtml}
      ${planHtml}
      ${redFlagsHtml}
    `;

    // Wire dynamic events inside builder
    bodyEl.querySelectorAll('[data-pb-pair]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.pbPair;
        if (mode === 'combined') {
          pairViewMode = 'combined';
        } else if (mode === 'workup' && model.pair) {
          pairViewMode = 'single';
          selectedId = model.pair.workup.id;
        } else if (mode === 'manage' && model.pair) {
          pairViewMode = 'single';
          selectedId = model.pair.manage.id;
        }
        renderCatalog();
        renderBuilder();
        renderPreview();
      });
    });

    document.getElementById('pbGuidelineToggleBtn')?.addEventListener('click', () => {
      guidelineOpen = !guidelineOpen;
      document.getElementById('pbGuidelineBody')?.classList.toggle('hidden', !guidelineOpen);
      const toggle = document.getElementById('pbGuidelineToggleBtn');
      if (toggle) {
        toggle.setAttribute('aria-expanded', String(guidelineOpen));
        const chev = toggle.querySelector('.chevron');
        if (chev) chev.textContent = guidelineOpen ? '▴' : '▾';
      }
    });

    document.getElementById('pbAutoFillBtn')?.addEventListener('click', () => {
      const count = autoFillFromChart(model, cs, { onlyEmpty: false });
      cs.autoFilledCount = count;
      renderBuilder();
      renderPreview();
      hooks.showToast(count > 0
        ? `Auto-filled ${count} wildcard${count === 1 ? '' : 's'} from patient chart ✓`
        : 'No matching labs/vitals found in patient chart for this template');
    });

    document.getElementById('pbCheckAllBtn')?.addEventListener('click', () => {
      cs.workupChecked = model.workup.map(() => true);
      cs.planChecked = model.plan.map(() => true);
      cs.includeRedFlags = Boolean(model.redFlags);
      renderBuilder();
      renderPreview();
    });

    document.getElementById('pbMinimalCoreBtn')?.addEventListener('click', () => {
      cs.workupChecked = model.workup.map((_, i) => i < 2);
      cs.planChecked = model.plan.map((_, i) => i < 3);
      cs.includeRedFlags = true;
      renderBuilder();
      renderPreview();
      hooks.showToast('Selected Minimal Core (top 2 workup + top 3 plan)');
    });

    document.getElementById('pbClearFillsBtn')?.addEventListener('click', () => {
      cs.fills = {};
      cs.autoFilledCount = 0;
      renderBuilder();
      renderPreview();
    });

    document.getElementById('pbResetChecklistBtn')?.addEventListener('click', () => {
      delete checklistStates[cs.scopedKey];
      renderBuilder();
      renderPreview();
    });

    bodyEl.querySelectorAll('[data-pb-wcheck]').forEach(cb => {
      cb.addEventListener('change', () => {
        cs.workupChecked[Number(cb.dataset.pbWcheck)] = cb.checked;
        renderBuilder();
        renderPreview();
      });
    });

    bodyEl.querySelectorAll('[data-pb-pcheck]').forEach(cb => {
      cb.addEventListener('change', () => {
        cs.planChecked[Number(cb.dataset.pbPcheck)] = cb.checked;
        renderBuilder();
        renderPreview();
      });
    });

    document.getElementById('pbRedFlagCheck')?.addEventListener('change', e => {
      cs.includeRedFlags = e.target.checked;
      renderBuilder();
      renderPreview();
    });

    bodyEl.querySelectorAll('[data-pb-fill]').forEach(inp => {
      inp.addEventListener('input', () => {
        cs.fills[inp.dataset.pbFill] = inp.value;
        renderPreview();
      });
    });

    bodyEl.querySelectorAll('[data-pb-sl-key]').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.pbSlKey;
        const val = chip.dataset.pbSlVal;
        const def = smartlists[key];
        if (!def) return;
        let arr = [...(cs.smartlists[key] || [])];
        if (def.multi) {
          if (arr.includes(val)) arr = arr.filter(x => x !== val);
          else arr.push(val);
        } else {
          arr = [val];
        }
        cs.smartlists[key] = arr;
        renderBuilder();
        renderPreview();
      });
    });

    const addCustomLine = () => {
      const inp = document.getElementById('pbInlineCustomLine');
      const txt = (inp?.value || '').trim();
      if (!txt) return;
      cs.customLines.push(txt);
      inp.value = '';
      renderBuilder();
      renderPreview();
    };
    document.getElementById('pbAddInlineLineBtn')?.addEventListener('click', addCustomLine);
    document.getElementById('pbInlineCustomLine')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomLine();
      }
    });

    bodyEl.querySelectorAll('[data-pb-rm-custom-line]').forEach(btn => {
      btn.addEventListener('click', () => {
        cs.customLines.splice(Number(btn.dataset.pbRmCustomLine), 1);
        renderBuilder();
        renderPreview();
      });
    });

    wireCalculatorEvents(model, cs);
  }

  function renderPreview() {
    const model = getActiveModel();
    const outEl = document.getElementById('pbOutputPreview');
    const wcBadge = document.getElementById('pbWildcardBadge');
    if (!model || !outEl) return;

    const text = buildOutputText(model);
    outEl.textContent = text;

    const wcCount = (text.match(/\*\*\*/g) || []).length;
    if (wcBadge) {
      if (wcCount === 0) {
        wcBadge.textContent = '0 wildcards — ready';
        wcBadge.className = 'pb-wc-status ready';
      } else {
        wcBadge.textContent = `${wcCount} *** wildcard${wcCount === 1 ? '' : 's'} (F2)`;
        wcBadge.className = 'pb-wc-status pending';
      }
    }
  }

  function renderCart() {
    const listEl = document.getElementById('pbCartList');
    const countEl = document.getElementById('pbCartCount');
    const actionsEl = document.getElementById('pbCartActions');
    if (countEl) countEl.textContent = String(getCart().length);
    const ownerEl = document.getElementById('pbCartOwner');
    const owner = hooks?.getActivePatient?.();
    if (ownerEl) ownerEl.textContent = owner ? `· Rm ${owner.room}` : '';
    if (actionsEl) actionsEl.classList.toggle('hidden', getCart().length === 0);
    renderPatientBanner();

    if (!listEl) return;
    if (getCart().length === 0) {
      listEl.innerHTML = `<div class="small-muted" style="padding:4px 0;">Stage multiple problems here (#1, #2, #3...) to build a full A&amp;P block.</div>`;
      return;
    }

    listEl.innerHTML = getCart().map((item, idx) => `
      <div class="pb-cart-item">
        <div class="pb-cart-item-title">
          <span class="pb-cart-num">#${idx + 1}</span>
          <span>${hooks.esc(item.title)}</span>
        </div>
        <div class="pb-cart-item-btns">
          <button type="button" class="btn btn-xs btn-ghost" data-pb-cart-up="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button type="button" class="btn btn-xs btn-ghost" data-pb-cart-dn="${idx}" ${idx === getCart().length - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button type="button" class="btn btn-xs btn-ghost" data-pb-cart-rm="${idx}" title="Remove">×</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-pb-cart-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.pbCartUp);
        if (i > 0) { [getCart()[i - 1], getCart()[i]] = [getCart()[i], getCart()[i - 1]]; renderCart(); }
      });
    });
    listEl.querySelectorAll('[data-pb-cart-dn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.pbCartDn);
        if (i < getCart().length - 1) { [getCart()[i + 1], getCart()[i]] = [getCart()[i], getCart()[i + 1]]; renderCart(); }
      });
    });
    listEl.querySelectorAll('[data-pb-cart-rm]').forEach(btn => {
      btn.addEventListener('click', () => {
        getCart().splice(Number(btn.dataset.pbCartRm), 1);
        renderCart();
      });
    });
  }

  function buildFullCartText() {
    return getCart().map((item, i) => `#${i + 1} ${item.title}\n${item.text}`).join('\n\n');
  }

  /* ========================================================================
     Custom Phrase Editor & Import/Export
     ======================================================================== */
  function openCustomModal(sourcePhrase = null, asDuplicate = false) {
    const modal = document.getElementById('pbCustomPhraseModal');
    if (!modal) return;
    editingCustomId = (sourcePhrase && sourcePhrase.isCustom && !asDuplicate) ? sourcePhrase.id : null;

    document.getElementById('pbCustomModalTitle').textContent = editingCustomId
      ? 'Edit Custom Plan Template'
      : (asDuplicate ? 'Duplicate as Custom Template' : 'New Custom Workup / Management Template');

    document.getElementById('pbCustTrigger').value = sourcePhrase
      ? (asDuplicate ? `${sourcePhrase.trigger}CUSTOM` : sourcePhrase.trigger)
      : 'GBMYPLAN';
    document.getElementById('pbCustTitle').value = sourcePhrase
      ? (asDuplicate ? `${sourcePhrase.title} (Custom)` : sourcePhrase.title)
      : '';
    document.getElementById('pbCustCategory').value = sourcePhrase?.category || 'Custom';
    document.getElementById('pbCustAssessment').value = sourcePhrase?.assessment || '';
    document.getElementById('pbCustWorkup').value = (sourcePhrase?.workup || []).join('\n');
    document.getElementById('pbCustPlan').value = (sourcePhrase?.plan || []).join('\n');
    document.getElementById('pbCustRedFlags').value = sourcePhrase?.redFlags || '';

    modal.classList.remove('hidden');
  }

  function saveCustomPhraseFromModal() {
    const rawTrig = (document.getElementById('pbCustTrigger')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const title = (document.getElementById('pbCustTitle')?.value || '').trim();
    const category = (document.getElementById('pbCustCategory')?.value || 'Custom').trim();
    const assessment = (document.getElementById('pbCustAssessment')?.value || '').trim();
    const workup = (document.getElementById('pbCustWorkup')?.value || '').split(/\r?\n/).map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    const plan = (document.getElementById('pbCustPlan')?.value || '').split(/\r?\n/).map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    const redFlags = (document.getElementById('pbCustRedFlags')?.value || '').trim();

    if (!rawTrig || !title || (!assessment && !plan.length && !workup.length)) {
      hooks.showToast('Please enter a Trigger, Title, and at least an Assessment or Plan bullet.', 'error');
      return;
    }

    const structured = {
      id: editingCustomId || ('CUST_' + rawTrig + '_' + Date.now().toString(36)),
      trigger: rawTrig,
      title,
      category,
      pairKey: '',
      role: '',
      assessment: assessment || `${title} ***.`,
      workup,
      plan,
      redFlags,
      notes: [],
      isCustom: true
    };

    const body = typeof structuredPhraseToBody === 'function' ? structuredPhraseToBody(structured) : assessment;
    const entry = {
      id: structured.id,
      trigger: '.' + rawTrig,
      title,
      category,
      body,
      structured
    };

    const st = hooks.getState();
    st.customDotPhrases = (st.customDotPhrases || []).filter(p => (p.id || p.trigger.replace(/^\./, '')) !== structured.id);
    st.customDotPhrases.unshift(entry);
    hooks.saveState();

    document.getElementById('pbCustomPhraseModal')?.classList.add('hidden');
    selectedId = structured.id;
    pairViewMode = 'single';
    renderAll();
    hooks.showToast(`Saved custom plan template .${rawTrig} locally!`);
  }

  function deleteCustomPhrase(id) {
    if (!confirm('Delete this custom DotPhrase template?')) return;
    const st = hooks.getState();
    st.customDotPhrases = (st.customDotPhrases || []).filter(p => (p.id || p.trigger.replace(/^\./, '')) !== id);
    hooks.saveState();
    selectedId = null;
    renderAll();
    hooks.showToast('Custom template deleted');
  }

  function syncSettingsInputs() {
    const s = getSettings();
    const pfx = document.getElementById('pbSetPrefix');
    if (pfx) pfx.value = s.prefix;
    const dot = document.getElementById('pbSetLeadingDot');
    if (dot) dot.checked = Boolean(s.leadingDot);
    const hdr = document.getElementById('pbSetShowHeader');
    if (hdr) hdr.checked = Boolean(s.showTriggerHeader);
    const cmp = document.getElementById('pbSetCompact');
    if (cmp) cmp.checked = Boolean(s.compactLayout);
    const str = document.getElementById('pbSetStripWc');
    if (str) str.checked = Boolean(s.stripWildcards);
  }

  async function copyText(txt, msg) {
    try {
      await navigator.clipboard.writeText(txt);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    hooks.showToast(msg);
  }

  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ========================================================================
     Static Event Wiring
     ======================================================================== */
  function bindStaticEvents() {
    const searchEl = document.getElementById('pbSearchInput');
    searchEl?.addEventListener('input', () => {
      searchQuery = searchEl.value;
      renderCatalog();
    });

    document.getElementById('pbStarActiveBtn')?.addEventListener('click', () => {
      const model = getActiveModel();
      if (model) toggleStar(model.base.id);
    });

    document.querySelectorAll('#pbOutputModeTabs .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        outputMode = btn.dataset.pbOutMode;
        document.querySelectorAll('#pbOutputModeTabs .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderBuilder();
        renderPreview();
      });
    });

    document.getElementById('pbSettingsToggleBtn')?.addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      document.getElementById('pbSettingsDrawer')?.classList.toggle('hidden', !settingsOpen);
      syncSettingsInputs();
    });

    document.getElementById('pbSetPrefix')?.addEventListener('input', e => updateSettings({ prefix: e.target.value.toUpperCase() || 'GB' }));
    document.getElementById('pbSetLeadingDot')?.addEventListener('change', e => updateSettings({ leadingDot: e.target.checked }));
    document.getElementById('pbSetShowHeader')?.addEventListener('change', e => updateSettings({ showTriggerHeader: e.target.checked }));
    document.getElementById('pbSetCompact')?.addEventListener('change', e => updateSettings({ compactLayout: e.target.checked }));
    document.getElementById('pbSetStripWc')?.addEventListener('change', e => updateSettings({ stripWildcards: e.target.checked }));

    document.getElementById('pbCopyBtn')?.addEventListener('click', () => {
      const model = getActiveModel();
      if (!model) return;
      copyText(buildOutputText(model), `Copied ${model.title} to clipboard!`);
    });

    document.getElementById('pbInsertToPatientBtn')?.addEventListener('click', () => {
      const model = getActiveModel();
      if (!model) return;
      const text = buildOutputText(model);
      const trig = model.isCombined && model.pair
        ? `${formatTrigger(model.pair.workup.trigger)}+${formatTrigger(model.pair.manage.trigger)}`
        : formatTrigger(model.trigger);
      hooks.onInsertIntoPatient(text, model.title, trig);
    });

    document.getElementById('pbAddToCartBtn')?.addEventListener('click', () => {
      const model = getActiveModel();
      if (!model) return;
      getCart().push({
        id: model.id,
        title: model.title,
        trigger: formatTrigger(model.trigger),
        text: buildOutputText(model)
      });
      renderCart();
      hooks.showToast(`Added "${model.title}" to Rounding A&P Cart (#${getCart().length})`);
    });

    document.getElementById('pbCartCopyAllBtn')?.addEventListener('click', () => {
      if (!getCart().length) return;
      copyText(buildFullCartText(), `Copied all ${getCart().length} problems from A&P Cart!`);
    });

    document.getElementById('pbCartInsertAllBtn')?.addEventListener('click', () => {
      if (!getCart().length) return;
      hooks.onInsertCartIntoPatient(buildFullCartText(), getCart().length);
      clearCart();
      renderCart();
    });

    document.getElementById('pbCartClearBtn')?.addEventListener('click', () => {
      clearCart();
      renderCart();
    });

    document.getElementById('pbNewCustomBtn')?.addEventListener('click', () => openCustomModal(null, false));
    document.getElementById('pbSaveCustomBtn')?.addEventListener('click', saveCustomPhraseFromModal);
    document.querySelectorAll('[data-close-pb-custom]').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById('pbCustomPhraseModal')?.classList.add('hidden'));
    });

    // Export / Import Library
    document.getElementById('pbExportTxtBtn')?.addEventListener('click', () => {
      const all = getAllStructuredPhrases();
      const blocks = all.map(p => `${formatTrigger(p.trigger)} — ${p.title}\n${structuredPhraseToBody(p)}`);
      downloadBlob(`roundingos-dotphrases-${new Date().toISOString().slice(0, 10)}.txt`, blocks.join('\n\n---\n\n'), 'text/plain;charset=utf-8');
      hooks.showToast(`Exported ${all.length} Epic DotPhrases (.txt)`);
    });

    document.getElementById('pbExportJsonBtn')?.addEventListener('click', () => {
      const st = hooks.getState();
      const payload = {
        exportedAt: new Date().toISOString(),
        settings: getSettings(),
        starredDotPhrases: st.starredDotPhrases || [],
        customDotPhrases: st.customDotPhrases || []
      };
      downloadBlob(`roundingos-custom-plans-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
      hooks.showToast('Exported custom plans & favorites JSON');
    });

    document.getElementById('pbImportJsonInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '{}'));
          const st = hooks.getState();
          let incoming = [];
          if (Array.isArray(parsed.customDotPhrases)) {
            incoming = parsed.customDotPhrases;
          } else if (Array.isArray(parsed.phrases)) {
            incoming = parsed.phrases.map(p => ({
              id: p.id || p.trigger,
              trigger: '.' + String(p.trigger || '').replace(/^\./, ''),
              title: p.title,
              category: p.category || 'Custom',
              body: structuredPhraseToBody(p),
              structured: Object.assign({}, p, { isCustom: true })
            }));
          }
          const existing = st.customDotPhrases || [];
          if (!confirm(`Merge ${incoming.length} imported template(s) into your ${existing.length} custom template(s)?\n\nTemplates with the same trigger are replaced by the imported version; nothing else is removed.`)) {
            e.target.value = '';
            return;
          }
          const keyOf = x => String(x.trigger || x.id || '').replace(/^\./, '').toUpperCase();
          const incomingKeys = new Set(incoming.map(keyOf));
          st.customDotPhrases = [...incoming, ...existing.filter(x => !incomingKeys.has(keyOf(x)))];
          if (Array.isArray(parsed.starredDotPhrases)) {
            st.starredDotPhrases = Array.from(new Set([...(st.starredDotPhrases || []), ...parsed.starredDotPhrases]));
          }
          if (parsed.settings) st.planBuilderSettings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings);
          hooks.saveState();
          renderAll();
          hooks.showToast(`Merged ${incoming.length} imported template(s)`);
        } catch (err) {
          hooks.showToast('Invalid JSON file.', 'error');
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    // Keyboard `/` inside modal focuses search
    document.addEventListener('keydown', e => {
      const modal = document.getElementById('planBuilderModal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        document.getElementById('pbSearchInput')?.focus();
      }
    });
  }

  function open(preselectTriggerOrId = null) {
    const modal = document.getElementById('planBuilderModal');
    if (!modal) return;
    const all = getAllStructuredPhrases();

    if (preselectTriggerOrId) {
      const clean = String(preselectTriggerOrId).replace(/^\./, '').toUpperCase();
      const found = all.find(p => p.id.toUpperCase() === clean || p.trigger.toUpperCase() === clean);
      if (found) {
        selectedId = found.id;
        pairViewMode = 'single';
        activeCategory = 'All';
      }
    } else if (!selectedId) {
      // Auto-select top suggested condition for active patient if available!
      const suggested = getSuggestedIdsForActivePatient();
      if (suggested.length) {
        selectedId = suggested[0];
        activeCategory = 'Suggested';
      } else if (all.length) {
        selectedId = all[0].id;
      }
    }

    syncSettingsInputs();
    renderAll();
    modal.classList.remove('hidden');
  }

  function close() {
    document.getElementById('planBuilderModal')?.classList.add('hidden');
  }

  return {
    init,
    open,
    close,
    renderAll,
    getAllStructuredPhrases
  };
})();

