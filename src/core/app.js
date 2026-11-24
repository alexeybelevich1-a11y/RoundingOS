/**
 * RoundingOS — Hospitalist Workflow Tracker Main Application Controller
 * Local-first storage: on-device database (store.js); nothing leaves the device
 */

(() => {
  const STORAGE_KEY = 'roundingos_hospitalist_v1';
  const PRE_IMPORT_KEY = 'roundingos_pre_import_snapshot';

  let state = getDefaultAppState();
  let searchQuery = '';
  let signoutMode = 'shift';
  let expandedConsultId = null;
  let pasteNewConsultOpen = false;
  let lastSavedJson = '';

  const $ = id => document.getElementById(id);

  const el = {
    workspaceRoot: $('workspaceRoot'),
    serviceHeaderLabel: $('serviceHeaderLabel'),
    censusSummary: $('censusSummary'),
    storageBadgeText: $('storageBadgeText'),
    toolsDropdownWrap: $('toolsDropdownWrap'),
    toolsMenuBtn: $('toolsMenuBtn'),
    toolsDropdown: $('toolsDropdown'),
    voiceBanner: $('voiceBanner'),
    voiceBannerMode: $('voiceBannerMode'),
    voiceTranscript: $('voiceTranscript'),
    fabMic: $('fabMic'),
    fabMicLabel: $('fabMicLabel'),
    searchInput: $('searchInput'),
    filterSelect: $('filterSelect'),
    sortSelect: $('sortSelect'),
    censusList: $('censusList'),
    detailPane: $('detailPane'),
    toastContainer: $('toastContainer'),
    patientModal: $('patientModal'),
    patientModalTitle: $('patientModalTitle'),
    patientForm: $('patientForm'),
    signoutModal: $('signoutModal'),
    signoutModeTabs: $('signoutModeTabs'),
    signoutTextarea: $('signoutTextarea'),
    soSickOnly: $('soSickOnly'),
    soIncludeSnapshot: $('soIncludeSnapshot'),
    soIncludeDone: $('soIncludeDone'),
    soIncludeGaps: $('soIncludeGaps'),
    soSortBy: $('soSortBy'),
    voiceHelpModal: $('voiceHelpModal'),
    dataModal: $('dataModal'),
    setProviderName: $('setProviderName'),
    setServiceName: $('setServiceName'),
    importJsonInput: $('importJsonInput'),
    printArea: $('printArea'),
    notePreview: $('rightNotePreview'),
    notePlan: $('rdPlan')
  };

  /* ========================================================================
     Utilities
     ======================================================================== */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Toast with an optional action button (used for Undo). */
  function showToast(message, variant = 'info', action = null) {
    const t = document.createElement('div');
    t.className = `toast ${variant === 'error' ? 'toast-error' : variant === 'voice' ? 'toast-voice' : ''}`;
    const span = document.createElement('span');
    span.textContent = message;
    t.appendChild(span);
    let life = 3400;
    if (action && typeof action.onClick === 'function') {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = action.label || 'Undo';
      b.addEventListener('click', () => { action.onClick(); t.remove(); });
      t.appendChild(b);
      life = 7000;
    }
    el.toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.25s ease';
      setTimeout(() => t.remove(), 260);
    }, life);
  }

  const MIC_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';

  /** Adds a small hover/focus-only mic to every field marked data-mic (keeps data-dictate-target logic). */
  function decorateMics(root = document) {
    root.querySelectorAll('[data-mic]').forEach(field => {
      if (!field.id || field.dataset.micReady) return;
      field.dataset.micReady = '1';
      const wrap = document.createElement('div');
      wrap.className = 'mic-wrap';
      field.parentNode.insertBefore(wrap, field);
      wrap.appendChild(field);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mic-btn';
      b.dataset.dictateTarget = field.id;
      b.title = 'Dictate';
      b.setAttribute('aria-label', 'Dictate');
      b.tabIndex = -1;
      b.innerHTML = MIC_SVG;
      wrap.appendChild(b);
    });
  }

  function countBlanks(text) {
    return (String(text || '').match(/\*\*\*/g) || []).length;
  }

  function allergyState(p) {
    const a = (p?.allergies || '').trim();
    if (!a) return { text: 'Allergies not recorded', cls: 'flag-unknown' };
    if (/^nkda$/i.test(a)) return { text: 'NKDA', cls: 'flag-quiet' };
    return { text: a, cls: 'flag-allergy' };
  }

  function downloadFile(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function copyToClipboard(text, fallbackEl) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = fallbackEl || document.createElement('textarea');
      if (!fallbackEl) { ta.value = text; document.body.appendChild(ta); }
      ta.select();
      document.execCommand('copy');
      if (!fallbackEl) ta.remove();
    }
  }

  /* ========================================================================
     Persistence (on-device database through Store; localStorage only as a fallback)
     ======================================================================== */
  // Tests load the app with ?testdb=1 so they never touch the real database.
  const DB_NAME = new URLSearchParams(location.search).has('testdb') ? 'roundingos-test' : 'roundingos';
  const TAB_ID = Math.random().toString(36).slice(2);
  const SAVE_DELAY_MS = 300;
  let storageMode = 'loading'; // 'loading' | 'db' | 'local' (IndexedDB unavailable or migration failed)
  let saveTimer = null;
  let saveChannel = null;

  function updateStorageBadge() {
    const timeStr = state.lastSavedAt
      ? new Date(state.lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    el.storageBadgeText.textContent = `Saved on this device · ${timeStr} · not encrypted: test data only`;
  }

  /** Synchronous for its ~70 callers: the database write follows after a short pause. */
  function saveState() {
    if (storageMode === 'loading') return; // never overwrite saved data with the empty startup state
    state.lastSavedAt = new Date().toISOString();
    if (storageMode === 'local') {
      try {
        lastSavedJson = JSON.stringify(state);
        localStorage.setItem(STORAGE_KEY, lastSavedJson);
      } catch (e) {
        showToast('Could not write to browser storage.', 'error');
      }
    } else {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
    }
    updateStorageBadge();
  }

  /** Writes now. Resolves when the database has the current state. */
  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (storageMode !== 'db') return Promise.resolve();
    return Store.save(state).then(result => {
      if (result.changed && saveChannel) saveChannel.postMessage({ type: 'changed', from: TAB_ID });
    }).catch(() => {
      showToast('Could not write to browser storage.', 'error');
    });
  }

  // Phones kill background apps without warning: write pending edits as soon as the app is hidden.
  window.addEventListener('pagehide', () => { if (saveTimer) flushSave(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) flushSave();
  });

  /** Puts a loaded or restored state in place and redraws everything. */
  function applyLoadedState(incoming) {
    state = { ...getDefaultAppState(), ...incoming };
    ensureUiState();
    migratePatients();
    if (!state.patients.some(p => p.id === state.selectedPatientId)) {
      state.selectedPatientId = state.patients[0]?.id || null;
    }
    applyTheme(state.theme || 'light');
    applyUiShellState();
    if (typeof SpeechEngine.setCustomVocab === 'function') {
      SpeechEngine.setCustomVocab(state.customMedicalVocab || []);
    }
    applyVoiceSetting();
    el.sortSelect.value = state.sortBy || 'priority';
    el.filterSelect.value = state.filterBy || 'all';
    el.serviceHeaderLabel.textContent = state.serviceName || 'Hospitalist Service';
    syncNoteOptionInputs();
    updateStorageBadge();
    renderAll();
  }

  /** Full copy of state before a risky change. Returns an id for undoSnapshot(), or null. */
  async function takeSnapshot(reason) {
    if (storageMode === 'db') {
      try { return await Store.snapshot(reason, state); } catch (e) { return null; }
    }
    try { localStorage.setItem(PRE_IMPORT_KEY, JSON.stringify(state)); return 'local'; } catch (e) { return null; }
  }

  async function undoSnapshot(id) {
    try {
      const saved = id === 'local'
        ? JSON.parse(localStorage.getItem(PRE_IMPORT_KEY))
        : await Store.restoreSnapshot(id);
      if (!saved || !Array.isArray(saved.patients)) throw new Error('empty snapshot');
      applyLoadedState(saved);
      saveState();
      showToast(`Restored ${state.patients.length} patients`);
    } catch (err) {
      showToast('Could not undo: the saved copy is missing.', 'error');
    }
  }

  // Another tab saved: reload instead of letting the two tabs overwrite each other
  function startTabSync() {
    if (storageMode === 'db' && typeof BroadcastChannel === 'function') {
      saveChannel = new BroadcastChannel(`roundingos:${DB_NAME}`);
      saveChannel.addEventListener('message', async e => {
        if (!e.data || e.data.type !== 'changed' || e.data.from === TAB_ID) return;
        try {
          const incoming = await Store.load();
          if (!incoming || !Array.isArray(incoming.patients)) return;
          clearTimeout(saveTimer);
          saveTimer = null;
          applyLoadedState(incoming);
          showToast('Updated from another RoundingOS tab');
        } catch (err) { /* ignore */ }
      });
    }
    if (storageMode === 'local') {
      window.addEventListener('storage', e => {
        if (e.key !== STORAGE_KEY || !e.newValue || e.newValue === lastSavedJson) return;
        try {
          const incoming = JSON.parse(e.newValue);
          if (!Array.isArray(incoming.patients)) return;
          applyLoadedState(incoming);
          showToast('Updated from another RoundingOS tab');
        } catch (err) { /* ignore */ }
      });
    }
  }

  /** Opens the database; the first time, copies the old localStorage save into it. */
  async function openSavedState() {
    try {
      await Store.open(DB_NAME);
      let saved = await Store.load();
      if (!saved) {
        const result = await Store.migrateFromLocalStorage();
        if (result.migrated) saved = await Store.load();
      }
      storageMode = 'db';
      return saved;
    } catch (err) {
      // IndexedDB missing, or the copy could not be verified: keep using localStorage, which is untouched
      Store.close();
      storageMode = 'local';
      showToast(`Could not move data to the on-device database (${err.message}). Still saving to browser storage.`, 'error');
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
  }

  async function loadInitialState() {
    // Ask the browser not to evict this app's storage (Android Chrome honors it for installed apps)
    try {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(granted => {
          $('storagePersistNote')?.classList.toggle('hidden', Boolean(granted));
        }).catch(() => {});
      }
    } catch (e) { /* not supported */ }

    const saved = await openSavedState();
    startTabSync();

    if (saved && Array.isArray(saved.patients)) {
      applyLoadedState(saved);
      // Store what loading filled in (missing fields), without marking every patient as just edited
      if (storageMode === 'db') Store.save(state, { keepTimestamps: true }).catch(() => {});
    } else {
      applyLoadedState(getDefaultAppState());
      saveState();
    }
    if (storageMode === 'db') Store.ensureDailySnapshot(state).catch(() => {});
    document.documentElement.dataset.storeReady = storageMode;
    if (typeof ReminderEngine !== 'undefined') ReminderEngine.onStateLoaded();
  }

  /** Older saves: legacy 'weights' checklist key and missing fields. */
  function migratePatients() {
    (state.patients || []).forEach(p => {
      if (!p.checklist) p.checklist = createEmptyChecklist();
      if ('weights' in p.checklist) {
        if (!('bm' in p.checklist)) p.checklist.bm = Boolean(p.checklist.weights);
        delete p.checklist.weights;
      }
      if (p.noteDraft === undefined) p.noteDraft = null;
    });
  }

  function ensureUiState() {
    const defaults = getDefaultUiState();
    if (!state.ui || (state.ui.uiVersion || 1) < defaults.uiVersion) {
      state.ui = {
        ...defaults,
        censusCollapsed: Boolean(state.ui?.censusCollapsed),
        patientPaneCollapsed: Boolean(state.ui?.patientPaneCollapsed),
        rightPaneCollapsed: Boolean(state.ui?.rightPaneCollapsed)
      };
      return;
    }
    state.ui = { ...defaults, ...state.ui, noteOpts: { ...defaults.noteOpts, ...(state.ui.noteOpts || {}) } };
  }

  function applyVoiceSetting() {
    SpeechEngine.setEnabled(Boolean(state.voiceEnabled));
    setMenuCheck('voiceToggleBtn', Boolean(state.voiceEnabled));
  }

  function setMenuCheck(id, on) {
    const b = $(id);
    if (!b) return;
    b.classList.toggle('is-checked', Boolean(on));
    b.setAttribute('aria-checked', String(Boolean(on)));
  }

  function applyUiShellState() {
    ensureUiState();
    const ui = state.ui;
    // Never hide both working panes at once
    if (ui.patientPaneCollapsed && ui.rightPaneCollapsed) ui.rightPaneCollapsed = false;
    el.workspaceRoot.classList.toggle('census-collapsed', Boolean(ui.censusCollapsed));
    el.workspaceRoot.classList.toggle('patient-collapsed', Boolean(ui.patientPaneCollapsed));
    el.workspaceRoot.classList.toggle('right-collapsed', Boolean(ui.rightPaneCollapsed));
    setMenuCheck('togglePatientPaneBtn', !ui.patientPaneCollapsed);
    setMenuCheck('toggleRightPaneBtn', !ui.rightPaneCollapsed);
    setMenuCheck('themeToggleBtn', state.theme === 'dark');
    setMenuCheck('sepiaToggleBtn', state.theme === 'sepia');

    // Note field groups: one open at a time (all open when the note has the full width)
    document.querySelectorAll('[data-note-group]').forEach(g => {
      const wideNote = ui.patientPaneCollapsed || (ui.censusCollapsed && !ui.rightPaneCollapsed);
      const open = wideNote || g.dataset.noteGroup === ui.noteSection;
      g.classList.toggle('is-open', open);
      g.querySelector('.note-group-head')?.setAttribute('aria-expanded', String(open));
    });
  }

  function closeToolsMenu() {
    el.toolsDropdown.classList.add('hidden');
    el.toolsMenuBtn.setAttribute('aria-expanded', 'false');
  }

  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    setMenuCheck('themeToggleBtn', theme === 'dark');
    setMenuCheck('sepiaToggleBtn', theme === 'sepia');
  }

  /* ========================================================================
     Filtering & sorting
     ======================================================================== */
  const ALL_CHECKS = () => [...CHECKLIST_DEFINITIONS.preround, ...CHECKLIST_DEFINITIONS.encounter];

  function getChecklistStats(patient) {
    const allIds = ALL_CHECKS().map(d => d.id);
    const done = allIds.filter(id => Boolean(patient.checklist?.[id])).length;
    return { done, total: allIds.length };
  }

  function getOpenTasksCount(patient) {
    return (patient.tasks || []).filter(t => !t.done).length;
  }

  function getUrgentTasksCount(patient) {
    return (patient.tasks || []).filter(t => !t.done && t.urgent).length;
  }

  function matchesFilter(p, f) {
    if (f === 'sick' || f === 'watcher' || f === 'discharge' || f === 'stable') return p.priority === f;
    if (f === 'unseen') return !p.checklist?.seen;
    if (f === 'unsigned') return !p.checklist?.note;
    if (f === 'openTasks') return getOpenTasksCount(p) > 0;
    return true;
  }

  function getFilteredSortedPatients() {
    const q = searchQuery.trim().toLowerCase();
    const list = state.patients.filter(p => {
      if (!matchesFilter(p, state.filterBy || 'all')) return false;
      if (q) {
        const hay = `${p.room} ${p.name} ${p.primaryDx} ${p.oneLiner} ${p.clinicalNotes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sortBy = state.sortBy || 'priority';
    list.sort((a, b) => {
      if (sortBy === 'room') return a.room.localeCompare(b.room, undefined, { numeric: true });
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'incomplete') {
        const remA = getChecklistStats(a).total - getChecklistStats(a).done;
        const remB = getChecklistStats(b).total - getChecklistStats(b).done;
        if (remA !== remB) return remB - remA;
      }
      if (sortBy === 'tasks') {
        const ta = getOpenTasksCount(a);
        const tb = getOpenTasksCount(b);
        if (ta !== tb) return tb - ta;
      }
      const ra = PRIORITY_META[a.priority]?.rank ?? 99;
      const rb = PRIORITY_META[b.priority]?.rank ?? 99;
      if (ra !== rb) return ra - rb;
      return a.room.localeCompare(b.room, undefined, { numeric: true });
    });
    return list;
  }

  function getSelectedPatient() {
    return state.patients.find(p => p.id === state.selectedPatientId) || null;
  }

  function selectPatient(id) {
    if (!state.patients.some(p => p.id === id)) return;
    state.selectedPatientId = id;
    expandedConsultId = null;
    pasteNewConsultOpen = false;
    saveState();
    renderAll();
  }

  /* ========================================================================
     Rendering — header summary & census
     ======================================================================== */
  function renderCensusSummary() {
    const total = state.patients.length;
    const sick = state.patients.filter(p => p.priority === 'sick').length;
    const unseen = state.patients.filter(p => !p.checklist?.seen).length;
    const unsigned = state.patients.filter(p => !p.checklist?.note).length;
    const f = state.filterBy || 'all';
    const item = (key, label, cls = '') =>
      `<button type="button" class="sum-item ${cls} ${f === key ? 'is-active' : ''}" data-sum-filter="${key}">${label}</button>`;
    el.censusSummary.innerHTML = total === 0 ? '' : [
      item('all', `${total} patient${total === 1 ? '' : 's'}`),
      sick ? item('sick', `${sick} sick`, 'sum-sick') : '',
      item('unseen', `${unseen} not seen`),
      item('unsigned', `${unsigned} no note`)
    ].join('<span class="sum-sep">·</span>');
    el.censusSummary.querySelectorAll('[data-sum-filter]').forEach(b => {
      b.addEventListener('click', () => {
        const key = b.dataset.sumFilter;
        state.ui.censusCollapsed = false;
        setFilter(state.filterBy === key ? 'all' : key);
      });
    });
  }

  function isTestPatient(p) {
    if (!p) return false;
    return Boolean(p.isTest) || /^TEST-/i.test(p.mrn || '') || /^pt-(0[1-9]|1[0-4])$/.test(p.id || '');
  }

  function addTestPatients() {
    closeToolsMenu();
    const existingIds = new Set(state.patients.map(p => p.id));
    const toAdd = getInitialTestPatients().filter(p => !existingIds.has(p.id));
    if (toAdd.length === 0) { showToast('All 14 test patients are already on your census.'); return; }
    state.patients = [...state.patients, ...toAdd];
    if (!state.selectedPatientId) state.selectedPatientId = state.patients[0]?.id || null;
    saveState();
    renderAll();
    showToast(`Added ${toAdd.length} test patients`);
  }

  function removeTestPatients() {
    closeToolsMenu();
    const testCount = state.patients.filter(isTestPatient).length;
    if (testCount === 0) { showToast('No test patients on the census.'); return; }
    state.patients.filter(isTestPatient).forEach(p => ReminderEngine?.unlinkPatient?.(p.id));
    state.patients = state.patients.filter(p => !isTestPatient(p));
    if (!state.patients.some(p => p.id === state.selectedPatientId)) {
      state.selectedPatientId = state.patients[0]?.id || null;
    }
    saveState();
    renderAll();
    showToast(`Removed ${testCount} test patients`);
  }

  function clearEntireCensus() {
    closeToolsMenu();
    if (state.patients.length === 0) { showToast('Census is already empty.'); return; }
    if (!confirm(`Remove all ${state.patients.length} patients from the census?\n\nTip: export a backup first (⋯ → Settings & backup).`)) return;
    takeSnapshot('before clear census');
    state.patients.forEach(p => ReminderEngine?.unlinkPatient?.(p.id));
    state.patients = [];
    state.selectedPatientId = null;
    saveState();
    renderAll();
    showToast('Census cleared');
  }

  function renderCensusList() {
    const list = getFilteredSortedPatients();
    el.filterSelect.value = state.filterBy || 'all';
    el.filterSelect.classList.toggle('is-filtered', (state.filterBy || 'all') !== 'all');

    if (list.length === 0) {
      if (state.patients.length === 0) {
        el.censusList.innerHTML = `
          <div class="empty-state">
            <p>No patients yet.</p>
            <button class="btn btn-sm btn-primary" id="emptyAddPtBtn">+ Add patient</button>
            <button class="btn btn-sm btn-ghost" id="emptyAddTestBtn">Load test patients</button>
          </div>`;
        $('emptyAddPtBtn')?.addEventListener('click', () => openPatientModal(null));
        $('emptyAddTestBtn')?.addEventListener('click', addTestPatients);
      } else {
        el.censusList.innerHTML = `
          <div class="empty-state">
            <p>No patients match.</p>
            <button class="btn btn-sm btn-secondary" id="clearFiltersInlineBtn">Show all</button>
          </div>`;
        $('clearFiltersInlineBtn')?.addEventListener('click', () => {
          searchQuery = '';
          el.searchInput.value = '';
          setFilter('all');
        });
      }
      return;
    }

    el.censusList.innerHTML = list.map(p => {
      const pMeta = PRIORITY_META[p.priority] || PRIORITY_META.stable;
      const openTasks = getOpenTasksCount(p);
      const urgentTasks = getUrgentTasksCount(p);
      const stats = getChecklistStats(p);
      const done = stats.done === stats.total;
      const seen = Boolean(p.checklist?.seen);
      const note = Boolean(p.checklist?.note);
      return `
        <div class="patient-card priority-${esc(p.priority)} ${done ? 'is-done' : ''} ${p.id === state.selectedPatientId ? 'selected' : ''}"
             data-patient-id="${esc(p.id)}" tabindex="0" role="button" title="${done ? 'Done for today' : ''}" aria-label="Room ${esc(p.room)} ${esc(p.name)}, ${esc(pMeta.label)}${done ? ', done for today' : ''}">
          <div class="pc-line1">
            <span class="room-badge">${esc(p.room)}</span>
            <span class="pc-name">${esc(p.name)}</span>
            ${openTasks > 0 ? `<span class="task-pill ${urgentTasks ? 'has-urgent' : ''}" title="${openTasks} open task(s)${urgentTasks ? `, ${urgentTasks} STAT` : ''}">${openTasks}</span>` : ''}
            <span class="acuity-tag acuity-${esc(p.priority)}">${esc(pMeta.shortLabel === 'D/C TODAY' ? 'D/C' : pMeta.label.split(' ')[0])}</span>
          </div>
          <div class="pc-line2">
            <span class="pc-dx" title="${esc(p.primaryDx)}">${esc(p.primaryDx)}</span>
            <span class="pc-status">
              <span class="st ${seen ? 'on' : ''}" title="${seen ? 'Seen' : 'Not seen yet'}">S</span><span class="st ${note ? 'on' : ''}" title="${note ? 'Note written' : 'No note yet'}">N</span>
            </span>
          </div>
        </div>`;
    }).join('');

    el.censusList.querySelectorAll('.patient-card').forEach(card => {
      const activate = () => {
        selectPatient(card.dataset.patientId);
        if (window.innerWidth <= 820) setMobileTab('patient');
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    });
  }

  /* ========================================================================
     Rendering — patient pane
     ======================================================================== */
  const ENCOUNTER_LABELS = { seen: 'Seen', orders: 'Orders', note: 'Note', family: 'RN / family' };

  function renderDetailPane() {
    const p = getSelectedPatient();
    if (!p) {
      el.detailPane.innerHTML = `
        <div class="empty-state">
          <h3>No patient selected</h3>
          <p>Pick a patient from the list, or add one.</p>
        </div>`;
      return;
    }

    const pMeta = PRIORITY_META[p.priority] || PRIORITY_META.stable;
    const openTasks = (p.tasks || []).filter(t => !t.done).sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const doneTasks = (p.tasks || []).filter(t => t.done);
    const urgentCount = openTasks.filter(t => t.urgent).length;
    const pendingConsults = (p.consults || []).filter(c => c.status === 'Pending').length;
    const isFullCode = /^full code$/i.test(p.codeStatus || '');
    const allergy = allergyState(p);
    const pre = CHECKLIST_DEFINITIONS.preround;
    const preDone = pre.filter(d => p.checklist?.[d.id]).length;
    const tab = state.ui.patientTab || 'tasks';
    const contMissing = !(p.contingencies || '').trim() && (p.priority === 'sick' || p.priority === 'watcher');

    const tabBtn = (key, label, extra = '') =>
      `<button type="button" role="tab" class="pt-tab ${tab === key ? 'is-active' : ''}" data-pt-tab="${key}" aria-selected="${tab === key}">${label}${extra}</button>`;

    el.detailPane.innerHTML = `
      <div class="pt-header">
        <div class="pt-header-row">
          <div class="pt-id">
            <span class="pt-room">${esc(p.room)}</span>
            <h2 class="pt-name">${esc(p.name)}</h2>
            <span class="pt-demo">${esc(p.age ?? '')}${esc(p.sex || '')} · HD ${esc(p.hospitalDay)}</span>
          </div>
          <div class="pt-actions">
            <div class="dropdown-wrap" id="priorityPopoverWrap">
              <button type="button" class="acuity-btn acuity-${esc(p.priority)}" id="priorityPopoverBtn" aria-haspopup="true">${esc(pMeta.label)} ▾</button>
              <div class="dropdown-menu hidden" id="priorityPopoverMenu">
                ${['sick', 'watcher', 'discharge', 'stable'].map(key => `
                  <button type="button" class="dropdown-item" data-set-priority="${key}"><span class="prio-dot prio-dot-${key}"></span>${esc(PRIORITY_META[key].label)}</button>
                `).join('')}
              </div>
            </div>
            <div class="dropdown-wrap" id="ptActionsWrap">
              <button type="button" class="btn btn-xs btn-secondary note-opts-btn" id="ptActionsBtn" aria-expanded="false" aria-haspopup="true" aria-label="Patient actions" title="Edit, handoff, discharge and more for this patient">
                <span>Actions</span>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="dropdown-menu hidden" id="ptActionsMenu">
                <button type="button" class="dropdown-item" id="editPatientBtn">Edit patient</button>
                <button type="button" class="dropdown-item" id="singleTransferBtn">Handoff for this patient</button>
                <button type="button" class="dropdown-item" id="setPatientAlarmBtn">Set follow-up alarm</button>
                <div class="dropdown-divider"></div>
                <button type="button" class="dropdown-item" id="resetChecklistBtn">Reset today's checks</button>
                <button type="button" class="dropdown-item dropdown-item-danger" id="deletePatientBtn">Remove from census…</button>
              </div>
            </div>
          </div>
        </div>
        <div class="pt-dx">${esc(p.primaryDx)}</div>
        <div class="pt-flags">
          <span class="flag ${isFullCode ? 'flag-quiet' : 'flag-code'}">${esc(p.codeStatus || 'Code status not set')}</span>
          <span class="flag ${allergy.cls}">${allergy.cls === 'flag-allergy' ? 'Allergy: ' : ''}${esc(allergy.text)}</span>
        </div>
      </div>

      <div class="pt-checks">
        <button type="button" class="preround-meter ${preDone === pre.length ? 'is-complete' : ''}" id="preroundToggle" aria-expanded="${Boolean(state.ui.preroundOpen)}">
          <span>Pre-round</span>
          <span class="meter" aria-hidden="true"><i style="width:${Math.round(preDone / pre.length * 100)}%"></i></span>
          <span class="meter-count">${preDone}/${pre.length}</span>
          <span class="chevron ${state.ui.preroundOpen ? 'open' : ''}">▾</span>
        </button>
        <div class="enc-toggles">
          ${CHECKLIST_DEFINITIONS.encounter.map(d => `
            <label class="toggle-chip ${p.checklist?.[d.id] ? 'checked' : ''}" title="${esc(d.hint)}">
              <input type="checkbox" data-check-id="${d.id}" ${p.checklist?.[d.id] ? 'checked' : ''} />${esc(ENCOUNTER_LABELS[d.id] || d.label)}
            </label>`).join('')}
        </div>
        ${state.ui.preroundOpen ? `
          <div class="preround-list">
            ${pre.map(d => `
              <label class="toggle-chip ${p.checklist?.[d.id] ? 'checked' : ''}" title="${esc(d.hint)}">
                <input type="checkbox" data-check-id="${d.id}" ${p.checklist?.[d.id] ? 'checked' : ''} />${esc(d.label)}
              </label>`).join('')}
            <button type="button" class="link-btn" id="checkAllPreroundBtn">Check all</button>
          </div>` : ''}
      </div>

      <div class="pt-tabs" role="tablist">
        ${tabBtn('tasks', 'Tasks', openTasks.length ? ` <span class="tab-count ${urgentCount ? 'is-urgent' : ''}">${openTasks.length}</span>` : '')}
        ${tabBtn('consults', 'Consults', (p.consults || []).length ? ` <span class="tab-count ${pendingConsults ? 'is-pending' : ''}">${(p.consults || []).length}</span>` : '')}
        ${tabBtn('plan', 'Summary')}
        ${tabBtn('ifthen', 'If / then', contMissing ? ' <span class="tab-dot" title="No contingencies for a sick/watcher patient"></span>' : '')}
      </div>

      <div class="pt-panel">
        ${tab === 'tasks' ? renderTasksPanel(openTasks, doneTasks) : ''}
        ${tab === 'consults' ? renderConsultsPanel(p) : ''}
        ${tab === 'plan' ? `
          <div class="field"><label for="fOneLiner">One-liner <span class="small-muted">(used in sign-out)</span></label>
            <textarea id="fOneLiner" rows="2" data-mic data-patient-field="oneLiner" placeholder="Age/sex with PMH admitted for…">${esc(p.oneLiner)}</textarea></div>
          <div class="field"><label for="fNotes">Hospital course / active issues</label>
            <textarea id="fNotes" rows="6" data-mic data-patient-field="clinicalNotes" placeholder="Antibiotic day, overnight updates, pending workup…">${esc(p.clinicalNotes)}</textarea></div>
          <div class="field"><label for="fDispo">Disposition &amp; barriers</label>
            <input type="text" id="fDispo" data-mic data-patient-field="disposition" value="${esc(p.disposition)}" placeholder="Home, SNF, rehab, pending PT/auth…" /></div>
        ` : ''}
        ${tab === 'ifthen' ? `
          <div class="field"><label for="fContingencies">Cross-cover if / then</label>
            <textarea id="fContingencies" rows="6" data-mic data-patient-field="contingencies" placeholder="IF MAP < 65 after 500 mL → call ICU…">${esc(p.contingencies)}</textarea></div>
          ${contMissing ? '<p class="hint-warn">This patient is marked ' + esc(pMeta.label) + ' and has no contingencies for overnight cover.</p>' : ''}
        ` : ''}
      </div>
    `;

    decorateMics(el.detailPane);
    bindDetailPaneEvents(p);
  }

  function renderTasksPanel(openTasks, doneTasks) {
    const rows = [...openTasks, ...doneTasks];
    return `
      <form id="addTaskForm" class="task-add-bar">
        <input type="text" id="newTaskInput" data-mic placeholder="Add a task…" autocomplete="off" />
        <select id="newTaskCategory" aria-label="Category">
          ${TASK_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
        <label class="toggle-chip toggle-stat"><input type="checkbox" id="newTaskUrgent" />STAT</label>
        <button type="submit" class="btn btn-sm btn-primary">Add</button>
      </form>
      <div class="task-list">
        ${rows.length === 0 ? '<div class="small-muted">No tasks.</div>' : rows.map(t => `
          <div class="task-item ${t.urgent && !t.done ? 'is-urgent' : ''} ${t.done ? 'is-done' : ''}">
            <input type="checkbox" data-toggle-task="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="Done" />
            <span class="task-text">${t.urgent && !t.done ? '<span class="stat-tag">STAT</span> ' : ''}${esc(t.text)}</span>
            <span class="task-cat">${esc(t.category)}</span>
            <button type="button" class="icon-delete-btn" data-delete-task="${esc(t.id)}" aria-label="Delete task">&times;</button>
          </div>`).join('')}
      </div>
      ${doneTasks.length ? `<button class="link-btn" id="clearDoneTasksBtn">Clear ${doneTasks.length} completed</button>` : ''}
    `;
  }

  function renderConsultsPanel(p) {
    const consults = p.consults || [];
    return `
      <div class="consult-list">
        ${consults.length === 0 ? '<div class="small-muted">No consults yet.</div>' : consults.map(c => {
          const isExp = expandedConsultId === c.id;
          const displayRecs = (c.condensedNotes || c.notes || '').trim();
          return `
          <div class="consult-card ${isExp ? 'is-expanded' : ''}">
            <div class="consult-item">
              <div class="consult-main">
                <div class="consult-service">${esc(c.service)}</div>
                <div class="consult-notes">${esc(displayRecs || 'No recommendations recorded')}</div>
              </div>
              <select class="consult-status-select status-${esc((c.status || '').split(' ')[0].toLowerCase())}" data-consult-status="${esc(c.id)}" aria-label="Status">
                ${['Pending', 'Aware / Curbside', 'Recs Reviewed', 'Signed Off'].map(st => `<option value="${esc(st)}" ${c.status === st ? 'selected' : ''}>${esc(st)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-xs btn-ghost" data-toggle-consult-recs="${esc(c.id)}">${isExp ? 'Close' : 'Recs'}</button>
              <button type="button" class="icon-delete-btn" data-delete-consult="${esc(c.id)}" aria-label="Remove consult">&times;</button>
            </div>
            ${isExp ? `
              <div class="consult-recs-drawer">
                <div class="field">
                  <div class="field-head"><label for="cRaw-${esc(c.id)}">Paste consult note</label><button type="button" class="link-btn" data-paste-clip-consult="${esc(c.id)}">Paste clipboard</button></div>
                  <textarea id="cRaw-${esc(c.id)}" rows="4" data-mic data-consult-raw="${esc(c.id)}" placeholder="Boilerplate is stripped and recommendations condensed below">${esc(c.rawRecs || '')}</textarea>
                </div>
                <div class="field">
                  <div class="field-head"><label for="cCond-${esc(c.id)}">Condensed (goes into the note)</label>
                    <span class="row-gap"><button type="button" class="link-btn" data-recondense-consult="${esc(c.id)}">Re-condense</button><button type="button" class="link-btn" data-push-consult-ap="${esc(c.id)}">Add to plan</button></span></div>
                  <textarea id="cCond-${esc(c.id)}" rows="2" data-mic data-consult-condensed="${esc(c.id)}">${esc(c.condensedNotes || c.notes || '')}</textarea>
                </div>
              </div>` : ''}
          </div>`;
        }).join('')}
      </div>

      <form id="addConsultForm" class="consult-add-row">
        <input type="text" id="newConsultService" data-dictate-replace="true" placeholder="Service" required />
        <input type="text" id="newConsultNotes" placeholder="Key recs (optional)" />
        <button type="submit" class="btn btn-sm btn-secondary">Add</button>
        <button type="button" class="btn btn-sm btn-ghost" id="togglePasteNewConsultBtn">${pasteNewConsultOpen ? 'Cancel paste' : 'Paste a note…'}</button>
      </form>

      ${pasteNewConsultOpen ? `
        <div class="consult-paste-new-box">
          <div class="field">
            <div class="field-head"><label for="newConsultPasteRaw">Consult note</label><button type="button" class="link-btn" id="newConsultPasteClipBtn">Paste clipboard</button></div>
            <textarea id="newConsultPasteRaw" rows="4" placeholder="Paste the consult note — the service is detected and recs condensed"></textarea>
          </div>
          <div class="consult-paste-preview-grid">
            <div class="field"><label for="newConsultPasteService">Service</label><input type="text" id="newConsultPasteService" /></div>
            <div class="field"><label for="newConsultPasteCondensed">Condensed</label><textarea id="newConsultPasteCondensed" rows="2"></textarea></div>
          </div>
          <div class="row-end"><button type="button" class="btn btn-sm btn-primary" id="savePastedConsultBtn">Add consult</button></div>
        </div>` : ''}
    `;
  }

  function touch(p) {
    p.updatedAt = new Date().toISOString();
  }

  function setPriorityWithUndo(p, priority, viaVoice = false) {
    const prev = p.priority;
    if (prev === priority) return;
    p.priority = priority;
    touch(p);
    saveState();
    renderAll();
    showToast(`${viaVoice ? 'Voice: ' : ''}Rm ${p.room} → ${PRIORITY_META[priority].label}`, viaVoice ? 'voice' : 'info', {
      label: 'Undo',
      onClick: () => { p.priority = prev; touch(p); saveState(); renderAll(); }
    });
  }

  function allConsultsReviewed(p) {
    return (p.consults || []).length > 0
      && p.consults.every(c => c.status === 'Recs Reviewed' || c.status === 'Signed Off');
  }

  function bindDetailPaneEvents(p) {
    const root = el.detailPane;
    const prioMenu = $('priorityPopoverMenu');
    const actMenu = $('ptActionsMenu');

    $('priorityPopoverBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      actMenu?.classList.add('hidden');
      prioMenu?.classList.toggle('hidden');
    });
    $('ptActionsBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      prioMenu?.classList.add('hidden');
      actMenu?.classList.toggle('hidden');
    });

    root.querySelectorAll('[data-set-priority]').forEach(btn => {
      btn.addEventListener('click', () => setPriorityWithUndo(p, btn.dataset.setPriority));
    });

    root.querySelectorAll('[data-pt-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.ui.patientTab = btn.dataset.ptTab;
        saveState();
        renderDetailPane();
      });
    });

    $('preroundToggle')?.addEventListener('click', () => {
      state.ui.preroundOpen = !state.ui.preroundOpen;
      saveState();
      renderDetailPane();
    });

    root.querySelectorAll('[data-check-id]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (!p.checklist) p.checklist = createEmptyChecklist();
        p.checklist[cb.dataset.checkId] = cb.checked;
        touch(p);
        saveState();
        renderCensusSummary();
        renderCensusList();
        renderDetailPane();
      });
    });

    $('checkAllPreroundBtn')?.addEventListener('click', () => {
      if (!p.checklist) p.checklist = createEmptyChecklist();
      CHECKLIST_DEFINITIONS.preround.forEach(item => { p.checklist[item.id] = true; });
      touch(p);
      saveState();
      renderAll();
    });

    $('resetChecklistBtn')?.addEventListener('click', () => {
      p.checklist = createEmptyChecklist();
      touch(p);
      saveState();
      renderAll();
    });

    root.querySelectorAll('[data-patient-field]').forEach(input => {
      input.addEventListener('input', () => {
        p[input.dataset.patientField] = input.value;
        touch(p);
        saveState();
        renderRightDock();
      });
    });

    // ---- Tasks
    $('addTaskForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const input = $('newTaskInput');
      const text = input.value.trim();
      if (!text) return;
      if (!p.tasks) p.tasks = [];
      p.tasks.unshift({
        id: uid('t'),
        text,
        category: $('newTaskCategory').value,
        urgent: $('newTaskUrgent').checked,
        done: false,
        createdAt: new Date().toISOString()
      });
      touch(p);
      saveState();
      renderAll();
      $('newTaskInput')?.focus();
    });

    root.querySelectorAll('[data-toggle-task]').forEach(cb => {
      cb.addEventListener('change', () => {
        const task = (p.tasks || []).find(t => t.id === cb.dataset.toggleTask);
        if (!task) return;
        task.done = cb.checked;
        touch(p);
        saveState();
        renderAll();
      });
    });

    root.querySelectorAll('[data-delete-task]').forEach(btn => {
      btn.addEventListener('click', () => {
        p.tasks = (p.tasks || []).filter(t => t.id !== btn.dataset.deleteTask);
        touch(p);
        saveState();
        renderAll();
      });
    });

    $('clearDoneTasksBtn')?.addEventListener('click', () => {
      p.tasks = (p.tasks || []).filter(t => !t.done);
      touch(p);
      saveState();
      renderAll();
    });

    // ---- Consults
    $('addConsultForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const service = $('newConsultService').value.trim();
      if (!service) return;
      if (!p.consults) p.consults = [];
      const rawInput = $('newConsultNotes').value.trim();
      const shouldCondense = rawInput.length > 90 || /\b(recommend|thank you for|agree with|please continue|signing off)\b/i.test(rawInput);
      const condensed = shouldCondense ? ProgressNoteEngine.condenseConsultRecommendations(rawInput, service) : rawInput;
      p.consults.push({
        id: uid('c'),
        service,
        status: rawInput ? 'Recs Reviewed' : 'Pending',
        notes: condensed,
        rawRecs: shouldCondense ? rawInput : '',
        condensedNotes: shouldCondense ? condensed : ''
      });
      touch(p);
      saveState();
      renderAll();
    });

    $('togglePasteNewConsultBtn')?.addEventListener('click', () => {
      pasteNewConsultOpen = !pasteNewConsultOpen;
      renderDetailPane();
      if (pasteNewConsultOpen) $('newConsultPasteRaw')?.focus();
    });

    const newPasteRawEl = $('newConsultPasteRaw');
    const newPasteSvcEl = $('newConsultPasteService');
    const newPasteCondEl = $('newConsultPasteCondensed');
    const updateNewConsultPastePreview = () => {
      const raw = newPasteRawEl?.value || '';
      if (newPasteSvcEl && !newPasteSvcEl.value.trim()) {
        const detected = ProgressNoteEngine.detectConsultService(raw);
        if (detected) newPasteSvcEl.value = detected;
      }
      if (newPasteCondEl) {
        newPasteCondEl.value = ProgressNoteEngine.condenseConsultRecommendations(raw, newPasteSvcEl?.value || '');
      }
    };
    newPasteRawEl?.addEventListener('input', updateNewConsultPastePreview);

    $('newConsultPasteClipBtn')?.addEventListener('click', async () => {
      try {
        const clip = await navigator.clipboard.readText();
        if (!clip) { showToast('Clipboard is empty', 'error'); return; }
        newPasteRawEl.value = clip;
        updateNewConsultPastePreview();
      } catch (err) {
        showToast('Press Ctrl+V inside the box to paste');
        newPasteRawEl?.focus();
      }
    });

    $('savePastedConsultBtn')?.addEventListener('click', () => {
      const raw = (newPasteRawEl?.value || '').trim();
      const service = (newPasteSvcEl?.value || '').trim() || ProgressNoteEngine.detectConsultService(raw) || 'Consult';
      const condensed = (newPasteCondEl?.value || '').trim() || ProgressNoteEngine.condenseConsultRecommendations(raw, service);
      if (!condensed) { showToast('Paste the consult note first', 'error'); return; }
      if (!p.consults) p.consults = [];
      const isSignedOff = /\bsign(?:ing)?\s+off\b/i.test(raw) || /\bsigning off\b/i.test(condensed);
      p.consults.push({
        id: uid('c'),
        service,
        status: isSignedOff ? 'Signed Off' : 'Recs Reviewed',
        notes: condensed,
        rawRecs: raw,
        condensedNotes: condensed
      });
      if (allConsultsReviewed(p)) {
        if (!p.checklist) p.checklist = createEmptyChecklist();
        p.checklist.consults = true;
      }
      pasteNewConsultOpen = false;
      touch(p);
      saveState();
      renderAll();
      showToast(`Added ${service} recommendations`);
    });

    root.querySelectorAll('[data-toggle-consult-recs]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleConsultRecs;
        expandedConsultId = expandedConsultId === id ? null : id;
        renderDetailPane();
        if (expandedConsultId === id) $(`cRaw-${id}`)?.focus();
      });
    });

    const applyRawConsultCondense = (consult, rawText) => {
      consult.rawRecs = rawText;
      const condensed = ProgressNoteEngine.condenseConsultRecommendations(rawText, consult.service);
      consult.condensedNotes = condensed;
      consult.notes = condensed || consult.notes;
      if (rawText.trim()) {
        if (/\bsign(?:ing)?\s+off\b/i.test(rawText)) consult.status = 'Signed Off';
        else if (consult.status === 'Pending') consult.status = 'Recs Reviewed';
        if (allConsultsReviewed(p)) {
          if (!p.checklist) p.checklist = createEmptyChecklist();
          p.checklist.consults = true;
        }
      }
      touch(p);
      saveState();
      const condEl = $(`cCond-${consult.id}`);
      if (condEl && document.activeElement !== condEl) condEl.value = condensed;
      const noteDiv = condEl?.closest('.consult-card')?.querySelector('.consult-notes');
      if (noteDiv) noteDiv.textContent = condensed || 'No recommendations recorded';
      renderRightDock();
      renderCensusList();
    };

    root.querySelectorAll('[data-consult-raw]').forEach(ta => {
      ta.addEventListener('input', () => {
        const consult = (p.consults || []).find(c => c.id === ta.dataset.consultRaw);
        if (consult) applyRawConsultCondense(consult, ta.value);
      });
    });

    root.querySelectorAll('[data-paste-clip-consult]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.pasteClipConsult;
        const consult = (p.consults || []).find(c => c.id === id);
        const ta = $(`cRaw-${id}`);
        if (!consult || !ta) return;
        try {
          const clip = await navigator.clipboard.readText();
          if (!clip) { showToast('Clipboard is empty', 'error'); return; }
          ta.value = clip;
          applyRawConsultCondense(consult, clip);
        } catch (err) {
          showToast('Press Ctrl+V inside the box to paste');
          ta.focus();
        }
      });
    });

    root.querySelectorAll('[data-recondense-consult]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.recondenseConsult;
        const consult = (p.consults || []).find(c => c.id === id);
        const ta = $(`cRaw-${id}`);
        if (consult && ta) applyRawConsultCondense(consult, ta.value);
      });
    });

    root.querySelectorAll('[data-consult-condensed]').forEach(ta => {
      ta.addEventListener('input', () => {
        const consult = (p.consults || []).find(c => c.id === ta.dataset.consultCondensed);
        if (!consult) return;
        consult.condensedNotes = ta.value;
        consult.notes = ta.value;
        touch(p);
        saveState();
        const noteDiv = ta.closest('.consult-card')?.querySelector('.consult-notes');
        if (noteDiv) noteDiv.textContent = ta.value || 'No recommendations recorded';
        renderRightDock();
      });
    });

    root.querySelectorAll('[data-push-consult-ap]').forEach(btn => {
      btn.addEventListener('click', () => {
        const consult = (p.consults || []).find(c => c.id === btn.dataset.pushConsultAp);
        if (!consult) return;
        const text = (consult.condensedNotes || consult.notes || '').trim();
        if (!text) { showToast('No recommendations to add yet', 'error'); return; }
        appendToPlan(p, `# Per ${consult.service} (${consult.status}):\n- ${text}`);
        showToast(`Added ${consult.service} recs to the plan`);
      });
    });

    root.querySelectorAll('[data-consult-status]').forEach(sel => {
      sel.addEventListener('change', () => {
        const consult = (p.consults || []).find(c => c.id === sel.dataset.consultStatus);
        if (!consult) return;
        consult.status = sel.value;
        if (allConsultsReviewed(p)) {
          if (!p.checklist) p.checklist = createEmptyChecklist();
          p.checklist.consults = true;
        }
        touch(p);
        saveState();
        renderAll();
      });
    });

    root.querySelectorAll('[data-delete-consult]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (expandedConsultId === btn.dataset.deleteConsult) expandedConsultId = null;
        p.consults = (p.consults || []).filter(c => c.id !== btn.dataset.deleteConsult);
        touch(p);
        saveState();
        renderAll();
      });
    });

    // ---- Actions menu
    $('singleTransferBtn')?.addEventListener('click', () => openSignoutModal('single'));
    $('setPatientAlarmBtn')?.addEventListener('click', () => {
      actMenu?.classList.add('hidden');
      ReminderEngine?.openModal(p);
    });
    $('editPatientBtn')?.addEventListener('click', () => openPatientModal(p));
    $('deletePatientBtn')?.addEventListener('click', () => {
      if (!confirm(`Remove ${p.name} (Rm ${p.room}) from the census?`)) return;
      const idx = state.patients.findIndex(x => x.id === p.id);
      state.patients.splice(idx, 1);
      ReminderEngine?.unlinkPatient?.(p.id);
      state.selectedPatientId = state.patients[0]?.id || null;
      saveState();
      renderAll();
      showToast(`Removed ${p.name}`, 'info', {
        label: 'Undo',
        onClick: () => {
          state.patients.splice(Math.min(idx, state.patients.length), 0, p);
          selectPatient(p.id);
        }
      });
    });
  }

  function renderAll() {
    renderCensusSummary();
    renderCensusList();
    renderDetailPane();
    renderRightDock();
    const pb = $('planBuilderModal');
    if (pb && !pb.classList.contains('hidden') && typeof PlanBuilder !== 'undefined') PlanBuilder.renderAll();
  }

  function setFilter(filterKey) {
    state.filterBy = filterKey;
    saveState();
    applyUiShellState();
    renderCensusSummary();
    renderCensusList();
  }

  /* ========================================================================
     Add / edit patient
     ======================================================================== */
  let pendingFreestyleExtras = null;

  function openModal(modalEl) {
    modalEl.classList.remove('hidden');
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    if (modalEl.id === 'alarmAlertModal') return; // alarms close only through their own buttons
    modalEl.classList.add('hidden');
    if (modalEl === el.patientModal && SpeechEngine.getMode() === 'freestyle') SpeechEngine.stop();
  }

  function applyFreestyleIntake(rawText) {
    const summaryEl = $('pfAutoExtractedSummary');
    const clean = (rawText || '').trim();
    if (!clean) {
      pendingFreestyleExtras = null;
      if (summaryEl) { summaryEl.innerHTML = ''; summaryEl.classList.add('hidden'); }
      return;
    }
    const parsed = SpeechEngine.parsePatientFormDictation(clean);
    pendingFreestyleExtras = parsed;

    const set = (id, v) => { if (v !== undefined && v !== null && v !== '') $(id).value = v; };
    set('pfRoom', parsed.room);
    set('pfName', parsed.name);
    set('pfAge', parsed.age);
    set('pfSex', parsed.sex);
    set('pfHospitalDay', parsed.hospitalDay);
    set('pfCodeStatus', parsed.codeStatus);
    set('pfPriority', parsed.priority);
    set('pfAllergies', parsed.allergies);
    set('pfPrimaryDx', parsed.primaryDx);
    set('pfOneLiner', parsed.oneLiner);

    if (summaryEl) {
      const pills = [];
      if (parsed.vitalsSummary) pills.push('vitals');
      if (parsed.labsSummary) pills.push('labs');
      if (parsed.ioSummary) pills.push('I&O');
      if (parsed.weightSummary) pills.push('weight');
      if (parsed.consults?.length) pills.push(`${parsed.consults.length} consult${parsed.consults.length > 1 ? 's' : ''}`);
      if (parsed.tasks?.length) pills.push(`${parsed.tasks.length} task${parsed.tasks.length > 1 ? 's' : ''}`);
      if (parsed.contingencies) pills.push('if/then');
      if (parsed.disposition) pills.push('dispo');
      summaryEl.innerHTML = pills.length ? `<span class="small-muted">Also captured:</span> ${pills.map(x => `<span class="detected-pill">${esc(x)}</span>`).join('')}` : '';
      summaryEl.classList.toggle('hidden', !pills.length);
    }
  }

  function openPatientModal(patient = null) {
    pendingFreestyleExtras = null;
    el.patientModalTitle.textContent = patient ? `Edit patient — Rm ${patient.room}` : 'Add patient';
    $('pfId').value = patient ? patient.id : '';
    $('pfRoom').value = patient?.room || '';
    $('pfName').value = patient?.name || '';
    $('pfAge').value = patient?.age ?? '';
    $('pfSex').value = patient?.sex || '';
    $('pfHospitalDay').value = patient?.hospitalDay || 1;
    $('pfCodeStatus').value = patient?.codeStatus || '';
    $('pfPriority').value = patient?.priority || 'stable';
    $('pfAllergies').value = patient?.allergies || '';
    $('pfPrimaryDx').value = patient?.primaryDx || '';
    $('pfOneLiner').value = patient?.oneLiner || '';
    $('pfMrn').value = patient?.mrn || '';

    const transcriptEl = $('pfFreestyleTranscript');
    transcriptEl.value = '';
    $('pfVoiceInterim').classList.add('hidden');
    $('pfAutoExtractedSummary').classList.add('hidden');
    $('pfVoiceStatus').textContent = window.location.protocol === 'file:'
      ? 'Tip: the browser mic is blocked on file:// — open the installed app, or press Win + H inside the box.'
      : '';
    $('intakeDetails').open = !patient;

    openModal(el.patientModal);
    (patient ? $('pfRoom') : transcriptEl).focus();
  }

  el.patientForm.addEventListener('submit', e => {
    e.preventDefault();
    if (SpeechEngine.getMode() === 'freestyle') SpeechEngine.stop();

    const id = $('pfId').value;
    const now = new Date().toISOString();
    const extras = pendingFreestyleExtras || {};
    const ageVal = $('pfAge').value;
    const payload = {
      room: $('pfRoom').value.trim(),
      name: $('pfName').value.trim(),
      age: ageVal === '' ? null : Number(ageVal),
      sex: $('pfSex').value,
      hospitalDay: Number($('pfHospitalDay').value) || 1,
      codeStatus: $('pfCodeStatus').value,
      priority: $('pfPriority').value,
      allergies: $('pfAllergies').value.trim(), // blank = not recorded (never assumed NKDA)
      primaryDx: $('pfPrimaryDx').value.trim(),
      oneLiner: $('pfOneLiner').value.trim(),
      mrn: $('pfMrn').value.trim(),
      updatedAt: now
    };

    const dupe = state.patients.find(p => p.id !== id && p.room.toLowerCase() === payload.room.toLowerCase());
    if (dupe && !confirm(`Room ${payload.room} is already assigned to ${dupe.name}. Save anyway?`)) return;

    if (id) {
      const existing = state.patients.find(p => p.id === id);
      if (existing) {
        Object.assign(existing, payload);
        ['vitalsSummary', 'labsSummary', 'ioSummary', 'weightSummary', 'disposition'].forEach(k => {
          if (extras[k]) existing[k] = extras[k];
        });
        if (extras.contingencies) {
          existing.contingencies = existing.contingencies ? `${existing.contingencies}\n${extras.contingencies}` : extras.contingencies;
        }
        if (extras.consults?.length) {
          existing.consults = existing.consults || [];
          extras.consults.forEach(c => {
            if (!existing.consults.some(ec => ec.service.toLowerCase() === c.service.toLowerCase())) {
              existing.consults.push({ id: uid('c'), ...c });
            }
          });
        }
        if (extras.tasks?.length) {
          existing.tasks = existing.tasks || [];
          extras.tasks.forEach(t => existing.tasks.unshift({ id: uid('t'), ...t, done: false, createdAt: now }));
        }
      }
      showToast(`Updated ${payload.name}`);
    } else {
      const newPt = {
        id: uid('pt'),
        ...payload,
        vitalsSummary: extras.vitalsSummary || '',
        ioSummary: extras.ioSummary || '',
        weightSummary: extras.weightSummary || '',
        labsSummary: extras.labsSummary || '',
        clinicalNotes: extras.clinicalNotes || '',
        contingencies: extras.contingencies || '',
        disposition: extras.disposition || '',
        noteDraft: null,
        checklist: createEmptyChecklist(),
        consults: (extras.consults || []).map(c => ({ id: uid('c'), ...c })),
        tasks: (extras.tasks || []).map(t => ({ id: uid('t'), ...t, done: false, createdAt: now }))
      };
      state.patients.push(newPt);
      state.selectedPatientId = newPt.id;
      showToast(`Added ${payload.name} · Rm ${payload.room}`);
    }

    pendingFreestyleExtras = null;
    saveState();
    closeModal(el.patientModal);
    renderAll();
  });

  /* ========================================================================
     Sign-out / handoff
     ======================================================================== */
  let signoutViewMode = 'formatted';
  let signoutTextEdited = false;

  function getSignoutOptions() {
    return {
      mode: signoutMode,
      patientId: state.selectedPatientId,
      onlySickAndWatcher: el.soSickOnly.checked,
      includeDataSnapshot: el.soIncludeSnapshot.checked,
      includeCompletedTasks: el.soIncludeDone.checked,
      includeChecklistGaps: el.soIncludeGaps.checked,
      sortBy: el.soSortBy.value
    };
  }

  function applySignoutViewMode() {
    const isFmt = signoutViewMode === 'formatted';
    $('signoutFormattedPreview').classList.toggle('hidden', !isFmt);
    el.signoutTextarea.classList.toggle('hidden', isFmt);
    document.querySelectorAll('#signoutViewTabs .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.soView === signoutViewMode);
    });
  }

  function refreshSignoutText(force = false) {
    if (signoutTextEdited && !force) {
      if (!confirm('Rebuild the sign-out? Your edits to the plain text will be replaced.')) return;
    }
    signoutTextEdited = false;
    $('signoutEditedBanner').classList.add('hidden');
    const opts = getSignoutOptions();
    el.signoutTextarea.value = SignOutEngine.generateText(state, opts);
    $('signoutFormattedPreview').innerHTML = SignOutEngine.generateFormattedHtml(state, opts);
  }

  function openSignoutModal(mode = 'shift') {
    closeAllPopovers();
    signoutMode = mode;
    el.signoutModeTabs.querySelectorAll('.seg-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === signoutMode));
    applySignoutViewMode();
    refreshSignoutText(true);
    openModal(el.signoutModal);
  }

  el.signoutTextarea.addEventListener('input', () => {
    signoutTextEdited = true;
    $('signoutEditedBanner').classList.remove('hidden');
  });

  document.querySelectorAll('#signoutViewTabs .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      signoutViewMode = btn.dataset.soView;
      applySignoutViewMode();
    });
  });

  el.signoutModeTabs.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      signoutMode = btn.dataset.mode;
      el.signoutModeTabs.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      refreshSignoutText();
    });
  });

  [el.soSickOnly, el.soIncludeSnapshot, el.soIncludeDone, el.soIncludeGaps, el.soSortBy].forEach(ctrl => {
    ctrl.addEventListener('change', () => refreshSignoutText());
  });

  $('soMoreBtn').addEventListener('click', e => {
    e.stopPropagation();
    $('soMoreMenu').classList.toggle('hidden');
  });
  $('regenerateSignoutBtn').addEventListener('click', () => { refreshSignoutText(); $('soMoreMenu').classList.add('hidden'); });

  $('copySignoutBtn').addEventListener('click', async () => {
    await copyToClipboard(el.signoutTextarea.value, el.signoutTextarea);
    showToast('Sign-out copied');
  });

  $('downloadTxtBtn').addEventListener('click', () => {
    downloadFile(`signout-${signoutMode}-${new Date().toISOString().slice(0, 10)}.txt`, el.signoutTextarea.value, 'text/plain;charset=utf-8');
  });
  $('downloadMdBtn').addEventListener('click', () => {
    downloadFile(`signout-${signoutMode}-${new Date().toISOString().slice(0, 10)}.md`, SignOutEngine.generateMarkdown(state, getSignoutOptions()), 'text/markdown;charset=utf-8');
  });

  $('printSignoutBtn').addEventListener('click', () => {
    if (signoutViewMode === 'formatted') {
      el.printArea.className = 'print-only print-rich-sheet';
      el.printArea.innerHTML = SignOutEngine.generateFormattedHtml(state, getSignoutOptions());
    } else {
      el.printArea.className = 'print-only print-plain-text';
      el.printArea.textContent = el.signoutTextarea.value;
    }
    window.print();
  });

  /* ========================================================================
     Voice
     ======================================================================== */
  const isTextField = node => node && (node.tagName === 'TEXTAREA'
    || (node.tagName === 'INPUT' && /^(text|search|number|)$/i.test(node.type || '')));

  function fieldLabel(node) {
    if (!node) return '';
    const lbl = node.id ? document.querySelector(`label[for="${node.id}"]`) : null;
    return (lbl?.textContent || node.placeholder || 'field').replace(/\s*\(.*$/, '').replace(/\*$/, '').trim();
  }

  SpeechEngine.init({
    onConsentNeeded() {
      openModal($('voiceConsentModal'));
    },
    onStatusChange({ listening, mode }) {
      el.fabMic.classList.toggle('is-listening', listening);
      el.voiceBanner.classList.toggle('hidden', !listening);
      if (listening) {
        el.voiceBannerMode.textContent = mode === 'command' ? 'Listening for commands' : 'Dictating';
        el.voiceTranscript.textContent = mode === 'command' ? 'Try "mark labs reviewed" or "add task recheck K"' : '';
      }
      el.fabMicLabel.textContent = listening ? (mode === 'command' ? 'Commands' : 'Dictating') : '';
    },
    onInterim(text) {
      if (text) el.voiceTranscript.textContent = `"${text}"`;
    },
    onCommandResult(transcript) {
      handleVoiceCommand(transcript);
    },
    onError(msg) {
      showToast(msg, 'error');
    }
  });

  // Floating mic: keep focus in the field the user was typing in
  el.fabMic.addEventListener('mousedown', e => e.preventDefault());
  el.fabMic.addEventListener('click', () => {
    const active = document.activeElement;
    if (SpeechEngine.getMode()) { SpeechEngine.stop(); return; }
    if (isTextField(active)) {
      const ok = SpeechEngine.toggleDictation(active, el.fabMic);
      if (ok) showToast(`Dictating into ${fieldLabel(active)}`, 'voice');
    } else {
      SpeechEngine.startCommandMode(true);
    }
  });

  function handleVoiceCommand(transcript) {
    const cmd = SpeechEngine.parseVoiceCommand(transcript, state.patients);
    const activePt = getSelectedPatient();
    const needPt = () => { if (!activePt) showToast('Select a patient first', 'error'); return Boolean(activePt); };

    switch (cmd.type) {
      case 'STOP_LISTENING':
        SpeechEngine.stop();
        return;
      case 'OPEN_SIGNOUT':
        openSignoutModal(cmd.mode || 'shift');
        return;
      case 'SELECT_PATIENT':
        selectPatient(cmd.patientId);
        showToast(`Voice: ${cmd.label}`, 'voice');
        return;
      case 'STEP_PATIENT': {
        const list = getFilteredSortedPatients();
        if (!list.length) return;
        const idx = list.findIndex(p => p.id === state.selectedPatientId);
        const next = list[(idx + cmd.delta + list.length) % list.length];
        selectPatient(next.id);
        showToast(`Voice: Rm ${next.room} — ${next.name}`, 'voice');
        return;
      }
      case 'SET_PRIORITY':
        if (needPt()) setPriorityWithUndo(activePt, cmd.priority, true);
        return;
      case 'CHECK_ALL_PREROUND':
        if (!needPt()) return;
        activePt.checklist = activePt.checklist || createEmptyChecklist();
        CHECKLIST_DEFINITIONS.preround.forEach(d => { activePt.checklist[d.id] = true; });
        touch(activePt); saveState(); renderAll();
        showToast(`Voice: pre-round complete for Rm ${activePt.room}`, 'voice');
        return;
      case 'SET_CHECKLIST':
        if (!needPt()) return;
        activePt.checklist = activePt.checklist || createEmptyChecklist();
        cmd.ids.forEach(id => { activePt.checklist[id] = cmd.value; });
        touch(activePt); saveState(); renderAll();
        showToast(`Voice: ${cmd.value ? 'checked' : 'unchecked'} ${cmd.ids.join(', ')}`, 'voice');
        return;
      case 'ADD_TASK':
        if (!needPt()) return;
        activePt.tasks = activePt.tasks || [];
        activePt.tasks.unshift({ id: uid('t'), text: cmd.text, category: cmd.category, urgent: cmd.urgent, done: false, createdAt: new Date().toISOString() });
        touch(activePt); saveState(); renderAll();
        showToast(`Voice: added ${cmd.urgent ? 'STAT ' : ''}task`, 'voice');
        return;
      case 'ADD_CONSULT':
        if (!needPt()) return;
        activePt.consults = activePt.consults || [];
        activePt.consults.push({ id: uid('c'), service: cmd.service, status: 'Pending', notes: cmd.notes });
        touch(activePt); saveState(); renderAll();
        showToast(`Voice: added ${cmd.service} consult`, 'voice');
        return;
      case 'SET_FIELD':
        if (!needPt()) return;
        activePt[cmd.field] = cmd.text;
        touch(activePt); saveState(); renderAll();
        showToast(`Voice: ${cmd.label} updated`, 'voice');
        return;
      case 'APPEND_FIELD':
        if (!needPt()) return;
        activePt[cmd.field] = activePt[cmd.field] ? `${activePt[cmd.field]}\n${cmd.text}` : cmd.text;
        touch(activePt); saveState(); renderAll();
        showToast(`Voice: ${cmd.field === 'contingencies' ? 'if/then' : 'notes'} updated`, 'voice');
        return;
      case 'SEARCH':
        searchQuery = cmd.query;
        el.searchInput.value = cmd.query;
        state.ui.censusCollapsed = false;
        applyUiShellState();
        renderCensusList();
        return;
      case 'ADD_REMINDER_REL':
      case 'ADD_REMINDER_AT': {
        const due = cmd.type === 'ADD_REMINDER_REL'
          ? new Date(Date.now() + cmd.minutes * 60000)
          : ReminderEngine.computeDueFromTimeString(cmd.timeStr);
        if (!due) return;
        ReminderEngine.addReminder({
          text: cmd.text,
          dueDate: due,
          patientId: activePt?.id || null,
          patientLabel: activePt ? `Rm ${activePt.room} · ${activePt.name}` : '',
          playSound: true
        });
        showToast(`Voice: alarm at ${due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'voice');
        return;
      }
      default:
        showToast(`Didn't catch a command in "${cmd.raw}"`, 'voice');
    }
  }

  /* ========================================================================
     New hospital day
     ======================================================================== */
  $('newDayBtn').addEventListener('click', () => {
    closeToolsMenu();
    const today = new Date().toISOString().slice(0, 10);
    const already = state.lastRolloverDate === today;
    const ok = confirm(
      (already ? 'You already started a new day today. Roll over AGAIN (hospital day +1 again)?\n\n' : 'Start a new hospital day?\n\n') +
      '• Hospital day +1 for every patient\n' +
      '• Clears today\'s checklist, completed tasks and hand-edited note drafts\n' +
      '• Clears subjective, exam and last BM\n' +
      '• Moves vitals, labs, I&O, weight and imaging to "yesterday" (shown as hints) so nothing stale reaches today\'s note\n' +
      '• Keeps summaries, plan, open tasks, consults and if/then'
    );
    if (!ok) return;
    const DAILY = ['vitalsSummary', 'labsSummary', 'ioSummary', 'weightSummary', 'imagingSummary'];
    state.patients.forEach(p => {
      p.hospitalDay = (Number(p.hospitalDay) || 1) + 1;
      p.checklist = createEmptyChecklist();
      p.tasks = (p.tasks || []).filter(t => !t.done);
      p.prev = {};
      DAILY.forEach(k => { p.prev[k] = p[k] || ''; p[k] = ''; });
      p.subjective = '';
      p.physicalExam = '';
      p.lastBm = '';
      p.noteDraft = null;
      touch(p);
    });
    state.shiftDate = today;
    state.lastRolloverDate = today;
    saveState();
    renderAll();
    showToast('New hospital day started');
  });

  /* ========================================================================
     Settings & backup
     ======================================================================== */
  $('dataModalBtn').addEventListener('click', () => {
    closeToolsMenu();
    el.setProviderName.value = state.providerName || '';
    el.setServiceName.value = state.serviceName || '';
    openModal(el.dataModal);
  });

  $('saveSettingsBtn').addEventListener('click', () => {
    state.providerName = el.setProviderName.value.trim() || 'Hospitalist';
    state.serviceName = el.setServiceName.value.trim() || 'Hospitalist Service';
    el.serviceHeaderLabel.textContent = state.serviceName;
    saveState();
    closeModal(el.dataModal);
    showToast('Settings saved');
  });

  /** Masked passphrase dialog (replaces prompt()). Resolves to the passphrase or null. */
  function askPassphrase({ confirmIt, hint }) {
    return new Promise(resolve => {
      const modal = $('passModal');
      const form = $('passForm');
      const inp = $('passInput');
      const conf = $('passConfirm');
      const err = $('passError');
      $('passHint').textContent = hint;
      $('passConfirmGroup').classList.toggle('hidden', !confirmIt);
      inp.value = '';
      conf.value = '';
      err.classList.add('hidden');
      modal.classList.remove('hidden');
      inp.focus();
      const done = val => {
        modal.classList.add('hidden');
        form.removeEventListener('submit', onSubmit);
        $('passCancelBtn').removeEventListener('click', onCancel);
        resolve(val);
      };
      const onSubmit = e => {
        e.preventDefault();
        const v = inp.value;
        let msg = '';
        if (confirmIt && v.length < 10) msg = 'Use at least 10 characters.';
        else if (confirmIt && v !== conf.value) msg = 'Passphrases do not match.';
        else if (!v) msg = 'Enter the passphrase.';
        if (msg) { err.textContent = msg; err.classList.remove('hidden'); return; }
        done(v);
      };
      const onCancel = () => done(null);
      form.addEventListener('submit', onSubmit);
      $('passCancelBtn').addEventListener('click', onCancel);
    });
  }

  /** Export payload: the current state (pending edits written first) plus ids deleted here. */
  async function getExportPayload() {
    await flushSave();
    const tombstones = storageMode === 'db' ? await Store.getTombstones().catch(() => []) : [];
    return Transfer.buildExport(state, tombstones);
  }

  $('exportEncryptedBtn').addEventListener('click', async () => {
    const pass = await askPassphrase({ confirmIt: true, hint: 'Encrypts the backup with AES-256 (compatible with the RoundingOS phone app). Without this passphrase the file cannot be opened.' });
    if (!pass) return;
    try {
      const encrypted = await BackupCrypto.encryptJson(await getExportPayload(), pass);
      downloadFile(`roundingos-backup-${new Date().toISOString().slice(0, 10)}.rnos`, encrypted, 'application/json');
      showToast('Encrypted backup exported');
    } catch (err) {
      showToast(`Encryption failed: ${err.message}`, 'error');
    }
  });

  $('exportJsonBtn').addEventListener('click', async () => {
    if (!confirm('This file contains patient information in readable form. Export unencrypted anyway?')) return;
    downloadFile(`roundingos-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await getExportPayload(), null, 2), 'application/json');
  });

  /** Import summary dialog. Resolves to 'merge', 'replace' or null. */
  function askImportChoice(summaryText, incomingCount) {
    return new Promise(resolve => {
      const modal = $('importModal');
      $('importSummary').textContent = summaryText;
      $('importCounts').textContent = `This device: ${state.patients.length} patients. Backup: ${incomingCount} patients.`;
      modal.classList.remove('hidden');
      $('importMergeBtn').focus();
      const buttons = { importMergeBtn: 'merge', importReplaceBtn: 'replace', importCancelBtn: null };
      const handlers = {};
      const done = val => {
        modal.classList.add('hidden');
        Object.keys(buttons).forEach(id => $(id).removeEventListener('click', handlers[id]));
        resolve(val);
      };
      Object.keys(buttons).forEach(id => {
        handlers[id] = () => done(buttons[id]);
        $(id).addEventListener('click', handlers[id]);
      });
    });
  }

  el.importJsonInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let parsed = JSON.parse(String(reader.result));
        if (BackupCrypto.isEncryptedEnvelope(parsed)) {
          const pass = await askPassphrase({ confirmIt: false, hint: 'This backup is encrypted. Enter its passphrase.' });
          if (!pass) { e.target.value = ''; return; }
          try {
            parsed = await BackupCrypto.decryptJson(parsed, pass);
          } catch (decErr) {
            throw new Error('Wrong passphrase or damaged file');
          }
        }
        if (!parsed || !Array.isArray(parsed.patients)) throw new Error('Not a RoundingOS backup');
        await flushSave(); // so updatedAt on recent edits is current before comparing
        const tombstones = storageMode === 'db' ? await Store.getTombstones().catch(() => []) : [];
        const merged = Transfer.mergeStates(state, parsed, tombstones);
        const choice = await askImportChoice(`Merge: ${Transfer.describeSummary(merged.summary)}.`, parsed.patients.length);
        if (!choice) { e.target.value = ''; return; }

        const snapId = await takeSnapshot('before import');
        if (choice === 'merge') {
          state.patients = merged.patients;
          applyLoadedState(state);
        } else {
          applyLoadedState(Transfer.stripTransferFields(parsed));
          state.selectedPatientId = state.patients[0]?.id || null;
          renderAll();
        }
        saveState();
        closeModal(el.dataModal);
        showToast(choice === 'merge'
          ? `Merged backup: ${Transfer.describeSummary(merged.summary)}`
          : `Imported ${state.patients.length} patients`, 'info',
          snapId ? { label: 'Undo', onClick: () => undoSnapshot(snapId) } : undefined);
      } catch (err) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  $('resetDemoBtn').addEventListener('click', () => {
    if (!confirm('Replace your current census with the 14 test patients?')) return;
    takeSnapshot('before loading test patients');
    const keep = { theme: state.theme, customDotPhrases: state.customDotPhrases, starredDotPhrases: state.starredDotPhrases, customMedicalVocab: state.customMedicalVocab, planBuilderSettings: state.planBuilderSettings, voiceEnabled: state.voiceEnabled };
    state = { ...getDefaultAppState(), ...keep, patients: getInitialTestPatients() };
    state.selectedPatientId = state.patients[0]?.id || null;
    ensureUiState();
    saveState();
    applyUiShellState();
    renderAll();
    closeModal(el.dataModal);
  });

  $('clearAllBtn').addEventListener('click', () => {
    closeModal(el.dataModal);
    clearEntireCensus();
  });

  /* ========================================================================
     Progress note dock (the one place the note is written)
     ======================================================================== */
  const rdFields = [
    ['rdSubjective', 'subjective'],
    ['rdExam', 'physicalExam'],
    ['rdVitals', 'vitalsSummary'],
    ['rdLabs', 'labsSummary'],
    ['rdOutputs', 'ioSummary'],
    ['rdLastBm', 'lastBm'],
    ['rdWeight', 'weightSummary'],
    ['rdImaging', 'imagingSummary'],
    ['rdPlan', 'assessmentPlan']
  ];

  function getNoteOptions() {
    const o = state.ui.noteOpts || {};
    return {
      includeConsults: o.consults !== false,
      includeOpenTasks: o.tasks !== false,
      includeContingencies: Boolean(o.contingencies),
      stripNotes: o.stripNotes !== false
    };
  }

  function syncNoteOptionInputs() {
    $('markWrittenChk').checked = Boolean(state.ui.markNoteOnCopy);
    const o = state.ui.noteOpts || {};
    $('pnIncConsults').checked = o.consults !== false;
    $('pnIncTasks').checked = o.tasks !== false;
    $('pnIncCont').checked = Boolean(o.contingencies);
    $('pnStripNotes').checked = o.stripNotes !== false;
  }

  function getAllDotPhrases() {
    return ProgressNoteEngine.getAllPhrases(state.customDotPhrases || []);
  }

  function triggerPrefix() {
    return (state.planBuilderSettings?.prefix || 'GB').toUpperCase();
  }

  function generatedNote(p) {
    return ProgressNoteEngine.buildProgressNote(state, p, getNoteOptions());
  }

  function updateBlankCounter() {
    const n = countBlanks(el.notePreview.value);
    const b = $('noteBlanks');
    b.textContent = n ? `${n} blank${n === 1 ? '' : 's'} left · F2` : 'No blanks';
    b.classList.toggle('has-blanks', n > 0);
  }

  function setGroupState(id, text, warn = false) {
    const s = $(id);
    if (!s) return;
    s.textContent = text;
    s.classList.toggle('is-warn', warn);
  }

  function renderRightDock() {
    const p = getSelectedPatient();
    const hintEl = $('rightNoteLiveHint');
    const pane = $('rightDockPane');
    pane.classList.toggle('is-empty', !p);

    if (!p) {
      hintEl.textContent = '';
      el.notePreview.value = '';
      el.notePreview.placeholder = 'Select a patient to start the note.';
      rdFields.forEach(([id]) => { const inp = $(id); if (inp && document.activeElement !== inp) inp.value = ''; });
      $('rightSuggestedPills').innerHTML = '';
      $('noteDraftBanner').classList.add('hidden');
      updateBlankCounter();
      return;
    }

    hintEl.textContent = `Rm ${p.room} · ${p.name}`;

    rdFields.forEach(([id, prop]) => {
      const inp = $(id);
      if (!inp) return;
      if (inp.dataset.basePlaceholder === undefined) inp.dataset.basePlaceholder = inp.placeholder || '';
      if (document.activeElement !== inp) inp.value = p[prop] || '';
      const prev = p.prev?.[prop];
      inp.placeholder = prev ? `Yesterday: ${prev}` : inp.dataset.basePlaceholder;
    });

    // Group status hints (amber = something the note would otherwise leave as ***)
    const subjMissing = [!p.subjective?.trim() && 'subjective', !p.physicalExam?.trim() && 'exam'].filter(Boolean);
    setGroupState('ngStateSubj', subjMissing.length ? `${subjMissing.join(' & ')} empty` : '✓', subjMissing.length > 0);
    const objKeys = ['vitalsSummary', 'labsSummary', 'ioSummary', 'lastBm', 'weightSummary', 'imagingSummary'];
    const objFilled = objKeys.filter(k => (p[k] || '').trim()).length;
    setGroupState('ngStateObj', `${objFilled}/${objKeys.length}`, objFilled < objKeys.length);
    const problems = ((p.assessmentPlan || '').match(/^#\s/gm) || []).length;
    setGroupState('ngStateAp', p.assessmentPlan?.trim() ? `${problems || 1} problem${problems === 1 ? '' : 's'}` : 'empty', !p.assessmentPlan?.trim());

    // Preview: generated from the chart unless the user has hand-edited it (then it is a protected draft)
    const hasDraft = typeof p.noteDraft === 'string';
    $('noteDraftBanner').classList.toggle('hidden', !hasDraft);
    if (document.activeElement !== el.notePreview) {
      el.notePreview.value = hasDraft ? p.noteDraft : generatedNote(p);
    }
    updateBlankCounter();

    // Suggested problems (max 4). Click = open in Plan Builder; Shift+click = insert as-is
    const pillsEl = $('rightSuggestedPills');
    const all = getAllDotPhrases();
    const suggested = ProgressNoteEngine.suggestForPatient(p, all).slice(0, 4);
    pillsEl.innerHTML = suggested.map(ph => `
      <button type="button" class="suggest-chip" data-rd-dp="${esc(ph.trigger)}" title="${esc(ph.trigger)} — click to customize, Shift+click to insert as-is">${esc(ph.title.replace(/\s*-\s*(Workup|Management)$/i, ' · $1'))}</button>
    `).join('');
    pillsEl.querySelectorAll('[data-rd-dp]').forEach(btn => {
      btn.addEventListener('click', e => {
        const found = all.find(x => x.trigger === btn.dataset.rdDp);
        if (!found) return;
        if (!e.shiftKey && typeof PlanBuilder !== 'undefined') {
          PlanBuilder.open(found.id || found.trigger);
          return;
        }
        appendToPlan(p, `# ${found.title} (${found.trigger})\n${found.body}`);
        showToast(`Added ${found.title}`);
      });
    });
  }

  function appendToPlan(p, block) {
    const cur = (p.assessmentPlan || '').trim();
    p.assessmentPlan = cur ? `${cur}\n\n${block}` : block;
    touch(p);
    saveState();
    renderRightDock();
    if (typeof p.noteDraft === 'string') {
      showToast('Plan updated — the note has hand edits, so use "Rebuild from chart" to include it.', 'info');
    }
  }

  rdFields.forEach(([id, prop]) => {
    const inp = $(id);
    inp?.addEventListener('input', () => {
      const p = getSelectedPatient();
      if (!p) return;
      p[prop] = inp.value;
      touch(p);
      saveState();
      renderRightDock();
    });
  });

  // Hand edits to the note are kept as a per-patient draft instead of being overwritten
  el.notePreview.addEventListener('input', () => {
    const p = getSelectedPatient();
    if (!p) return;
    p.noteDraft = el.notePreview.value;
    touch(p);
    saveState();
    $('noteDraftBanner').classList.remove('hidden');
    updateBlankCounter();
  });

  $('rebuildNoteBtn').addEventListener('click', () => {
    const p = getSelectedPatient();
    if (!p) return;
    if (!confirm('Rebuild the note from the chart? Your hand edits in the note will be replaced.')) return;
    p.noteDraft = null;
    touch(p);
    saveState();
    el.notePreview.blur();
    renderRightDock();
  });

  document.querySelectorAll('[data-note-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.ui.noteSection = btn.dataset.noteToggle;
      saveState();
      applyUiShellState();
    });
  });

  [['pnIncConsults', 'consults'], ['pnIncTasks', 'tasks'], ['pnIncCont', 'contingencies'], ['pnStripNotes', 'stripNotes']].forEach(([id, key]) => {
    $(id).addEventListener('change', e => {
      state.ui.noteOpts = { ...(state.ui.noteOpts || {}), [key]: e.target.checked };
      saveState();
      renderRightDock();
    });
  });

  $('markWrittenChk').addEventListener('change', e => {
    state.ui.markNoteOnCopy = e.target.checked;
    saveState();
  });

  $('noteOptsBtn').addEventListener('click', e => {
    e.stopPropagation();
    $('noteOptsMenu').classList.toggle('hidden');
  });

  function jumpWildcard(textarea) {
    if (!ProgressNoteEngine.jumpToNextWildcard(textarea)) showToast('No *** blanks left');
  }

  el.notePlan.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); jumpWildcard(el.notePlan); return; }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab') {
      const { text, expandedCount } = ProgressNoteEngine.expandInlineTriggers(el.notePlan.value, getAllDotPhrases(), triggerPrefix());
      if (expandedCount > 0) {
        e.preventDefault();
        el.notePlan.value = text;
        el.notePlan.dispatchEvent(new Event('input', { bubbles: true }));
        ProgressNoteEngine.jumpToNextWildcard(el.notePlan);
      }
    }
  });

  el.notePreview.addEventListener('keydown', e => {
    if (e.key === 'F2') { e.preventDefault(); jumpWildcard(el.notePreview); }
  });

  $('rdNormalSubjBtn').addEventListener('click', () => {
    const inp = $('rdSubjective');
    inp.value = (inp.value ? inp.value + '\n' : '') + ProgressNoteEngine.QUICK_SUBJECTIVE_PRESETS[0];
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  });

  $('rdNormalExamBtn').addEventListener('click', () => {
    const inp = $('rdExam');
    if (inp.value.trim() && !confirm('Replace the current exam with the normal exam template?')) return;
    inp.value = ProgressNoteEngine.DEFAULT_NORMAL_EXAM;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
    showToast('Normal exam inserted — edit any abnormal findings');
  });

  $('openExamBuilderBtn')?.addEventListener('click', () => {
    if (typeof ExamBuilder === 'undefined') {
      showToast('exambuilder.js is not loaded — copy it next to index.html', 'error');
      return;
    }
    if (!getSelectedPatient()) { showToast('Select a patient first', 'error'); return; }
    ExamBuilder.open();
  });

  $('rdBmTodayBtn').addEventListener('click', () => {
    const p = getSelectedPatient();
    if (!p) return;
    p.lastBm = `Today (${new Date().toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })})`;
    p.checklist = p.checklist || createEmptyChecklist();
    p.checklist.bm = true;
    touch(p);
    saveState();
    renderAll();
  });

  $('rightCopyBtn').addEventListener('click', async () => {
    const p = getSelectedPatient();
    if (!p) return;
    const markDone = $('markWrittenChk').checked;
    const blanks = countBlanks(el.notePreview.value);
    if (blanks && !confirm(`${blanks} *** blank${blanks === 1 ? '' : 's'} still in the note. Copy anyway?`)) {
      jumpWildcard(el.notePreview);
      return;
    }
    await copyToClipboard(el.notePreview.value, el.notePreview);
    if (markDone) {
      p.checklist = p.checklist || createEmptyChecklist();
      p.checklist.note = true;
      touch(p);
      saveState();
      renderAll();
    }
    showToast(markDone ? 'Note copied · marked written' : 'Note copied');
  });

  $('pnPrintBtn').addEventListener('click', () => {
    $('noteOptsMenu').classList.add('hidden');
    el.printArea.className = 'print-only print-plain-text';
    el.printArea.textContent = el.notePreview.value;
    window.print();
  });

  $('pnDownloadTxtBtn').addEventListener('click', () => {
    $('noteOptsMenu').classList.add('hidden');
    const p = getSelectedPatient();
    const safeRoom = (p?.room || 'patient').replace(/[^a-z0-9]/gi, '');
    downloadFile(`progress-note-rm${safeRoom}-${new Date().toISOString().slice(0, 10)}.txt`, el.notePreview.value, 'text/plain;charset=utf-8');
  });

  function focusNote() {
    if (state.ui.rightPaneCollapsed) {
      state.ui.rightPaneCollapsed = false;
      saveState();
      applyUiShellState();
    }
    if (window.innerWidth <= 820) setMobileTab('note');
    renderRightDock();
    el.notePreview.focus();
  }

  /* ========================================================================
     Menus, layout, keyboard
     ======================================================================== */
  function closeAllPopovers() {
    closeToolsMenu();
    ['priorityPopoverMenu', 'ptActionsMenu', 'noteOptsMenu', 'soMoreMenu'].forEach(id => $(id)?.classList.add('hidden'));
  }

  el.toolsMenuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = el.toolsDropdown.classList.contains('hidden');
    closeAllPopovers();
    el.toolsDropdown.classList.toggle('hidden', !willOpen);
    el.toolsMenuBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', e => {
    if (!el.toolsDropdownWrap.contains(e.target)) closeToolsMenu();
    if (!e.target.closest('#priorityPopoverWrap')) $('priorityPopoverMenu')?.classList.add('hidden');
    if (!e.target.closest('#ptActionsWrap')) $('ptActionsMenu')?.classList.add('hidden');
    if (!e.target.closest('#noteOptsWrap')) $('noteOptsMenu')?.classList.add('hidden');
    if (!e.target.closest('#soMoreWrap')) $('soMoreMenu')?.classList.add('hidden');
  });

  $('toggleCensusBtn').addEventListener('click', () => {
    state.ui.censusCollapsed = !state.ui.censusCollapsed;
    saveState();
    applyUiShellState();
  });

  $('togglePatientPaneBtn').addEventListener('click', () => {
    state.ui.patientPaneCollapsed = !state.ui.patientPaneCollapsed;
    if (state.ui.patientPaneCollapsed) state.ui.rightPaneCollapsed = false;
    saveState();
    applyUiShellState();
    renderRightDock();
  });

  $('toggleRightPaneBtn').addEventListener('click', () => {
    state.ui.rightPaneCollapsed = !state.ui.rightPaneCollapsed;
    if (state.ui.rightPaneCollapsed) state.ui.patientPaneCollapsed = false;
    saveState();
    applyUiShellState();
    renderRightDock();
  });

  $('themeToggleBtn').addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    saveState();
  });

  $('sepiaToggleBtn').addEventListener('click', () => {
    applyTheme(state.theme === 'sepia' ? 'light' : 'sepia');
    saveState();
  });

  $('addTestPatientsBtn').addEventListener('click', addTestPatients);
  $('removeTestPatientsBtn').addEventListener('click', removeTestPatients);
  $('clearCensusQuickBtn').addEventListener('click', clearEntireCensus);
  $('openSignoutBtn').addEventListener('click', () => openSignoutModal('shift'));
  $('addPatientBtn').addEventListener('click', () => openPatientModal(null));
  $('stopVoiceBannerBtn').addEventListener('click', () => SpeechEngine.stop());

  el.searchInput.addEventListener('input', e => {
    searchQuery = e.target.value;
    renderCensusList();
  });
  el.filterSelect.addEventListener('change', e => setFilter(e.target.value));
  el.sortSelect.addEventListener('change', e => {
    state.sortBy = e.target.value;
    saveState();
    renderCensusList();
  });

  function renderMedVocabList() {
    const listEl = $('medVocabList');
    $('medVocabStatsPill').textContent = `· ${SpeechEngine.getLexiconSize().toLocaleString()} terms recognized`;
    const rules = state.customMedicalVocab || [];
    if (!rules.length) {
      listEl.innerHTML = '<span class="small-muted">None yet.</span>';
      return;
    }
    listEl.innerHTML = rules.map((r, i) => `
      <span class="vocab-chip">"${esc(r.heard)}" → <strong>${esc(r.replace)}</strong>
        <button type="button" data-del-vocab="${i}" aria-label="Remove">&times;</button></span>`).join('');
    listEl.querySelectorAll('[data-del-vocab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.customMedicalVocab.splice(Number(btn.dataset.delVocab), 1);
        SpeechEngine.setCustomVocab(state.customMedicalVocab);
        saveState();
        renderMedVocabList();
      });
    });
  }

  $('addMedVocabForm').addEventListener('submit', e => {
    e.preventDefault();
    const heard = $('medVocabHeard').value.trim();
    const replace = $('medVocabReplace').value.trim();
    if (!heard || !replace) return;
    if (!Array.isArray(state.customMedicalVocab)) state.customMedicalVocab = [];
    state.customMedicalVocab.unshift({ heard, replace });
    SpeechEngine.setCustomVocab(state.customMedicalVocab);
    saveState();
    $('medVocabHeard').value = '';
    $('medVocabReplace').value = '';
    renderMedVocabList();
  });

  // Voice on/off (cloud speech needs the user to see where audio goes first)
  $('voiceToggleBtn').addEventListener('click', () => {
    closeToolsMenu();
    if (state.voiceEnabled) {
      state.voiceEnabled = false;
      saveState();
      applyVoiceSetting();
      showToast('Voice off');
    } else {
      openModal($('voiceConsentModal'));
    }
  });
  $('voiceConsentOkBtn').addEventListener('click', () => {
    state.voiceEnabled = true;
    saveState();
    applyVoiceSetting();
    closeModal($('voiceConsentModal'));
    showToast('Voice on. Tap the mic again to start.', 'voice');
  });

  $('voiceHelpBtn').addEventListener('click', () => { closeToolsMenu(); renderMedVocabList(); openModal(el.voiceHelpModal); });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal($(btn.dataset.closeModal)));
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop && !backdrop.hasAttribute('data-no-dismiss')) closeModal(backdrop);
    });
  });

  // Keyboard: Esc, Alt+M voice, Alt+S sign-out, Alt+P note, Alt+B Plan Builder, Alt+R alarms
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // A ringing alarm is never silently dismissed: Esc snoozes it 15 min
      if (ReminderEngine?.isAlertOpen?.()) { ReminderEngine.snoozeActive(15); return; }
      if (!$('passModal').classList.contains('hidden')) { $('passCancelBtn').click(); return; }
      if (!$('importModal').classList.contains('hidden')) { $('importCancelBtn').click(); return; }
      closeAllPopovers();
      const open = [...document.querySelectorAll('.modal-backdrop:not(.hidden)')];
      if (open.length) closeModal(open[open.length - 1]); // close only the top-most dialog
      else if (SpeechEngine.getMode()) SpeechEngine.stop();
      return;
    }
    if (!e.altKey) return;
    const k = e.key.toLowerCase();
    const map = {
      m: () => SpeechEngine.startCommandMode(true),
      s: () => openSignoutModal('shift'),
      p: () => focusNote(),
      b: () => PlanBuilder?.open(),
      r: () => ReminderEngine?.openModal()
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  // F2 anywhere in the note panel jumps to the next *** in the field you are in
  $('rightDockPane').addEventListener('keydown', e => {
    if (e.key === 'F2' && e.target.tagName === 'TEXTAREA' && e.target !== el.notePlan && e.target !== el.notePreview) {
      e.preventDefault();
      jumpWildcard(e.target);
    }
  });

  // Per-field mic buttons (added by decorateMics) — delegated
  document.addEventListener('click', e => {
    const micBtn = e.target.closest('[data-dictate-target]');
    if (!micBtn) return;
    e.preventDefault();
    const targetEl = $(micBtn.dataset.dictateTarget);
    if (targetEl) SpeechEngine.toggleDictation(targetEl, micBtn);
  });

  // Freestyle intake inside Add patient
  const pfTranscriptEl = $('pfFreestyleTranscript');
  const pfInterimEl = $('pfVoiceInterim');
  const pfStatusEl = $('pfVoiceStatus');
  $('dictateFullPatientBtn').addEventListener('click', () => {
    SpeechEngine.startFreestyleSession({
      buttonEl: $('dictateFullPatientBtn'),
      onStateChange(listening) {
        $('dictateFullPatientLabel').textContent = listening ? 'Stop dictation' : 'Start dictation';
        pfStatusEl.textContent = listening ? 'Listening — fields fill in as you talk.' : '';
        if (!listening) pfInterimEl.classList.add('hidden');
      },
      onInterim(text) {
        pfInterimEl.textContent = text ? `"${text}"` : '';
        pfInterimEl.classList.toggle('hidden', !text);
      },
      onAppendFinal(chunk) {
        if (!chunk) return;
        const cur = pfTranscriptEl.value.trim();
        pfTranscriptEl.value = cur ? `${cur} ${chunk}` : chunk;
        applyFreestyleIntake(pfTranscriptEl.value);
      },
      onError(msg) {
        pfStatusEl.textContent = msg;
      }
    });
  });

  let freestyleParseTimer = null;
  pfTranscriptEl.addEventListener('input', () => {
    clearTimeout(freestyleParseTimer);
    freestyleParseTimer = setTimeout(() => applyFreestyleIntake(pfTranscriptEl.value), 180);
  });
  $('pfReparseBtn').addEventListener('click', () => applyFreestyleIntake(pfTranscriptEl.value));
  $('pfClearTranscriptBtn').addEventListener('click', () => { pfTranscriptEl.value = ''; applyFreestyleIntake(''); });

  // Mobile tabs
  function setMobileTab(tab) {
    el.workspaceRoot.classList.toggle('mob-show-patient', tab === 'patient');
    el.workspaceRoot.classList.toggle('mob-show-note', tab === 'note');
    ['Census', 'Patient', 'Note'].forEach(n => $(`mobNav${n}`)?.classList.toggle('active', tab === n.toLowerCase()));
    if (tab === 'note') renderRightDock();
  }
  $('mobNavCensus').addEventListener('click', () => setMobileTab('census'));
  $('mobNavPatient').addEventListener('click', () => setMobileTab('patient'));
  $('mobNavNote').addEventListener('click', () => setMobileTab('note'));
  $('mobNavSignout').addEventListener('click', () => openSignoutModal('shift'));

  $('rightOpenPlanBuilderBtn').addEventListener('click', () => PlanBuilder?.open());
  $('openPlanBuilderBtn').addEventListener('click', () => { closeToolsMenu(); PlanBuilder?.open(); });
  $('openRemindersBtn').addEventListener('click', () => ReminderEngine?.openModal());

  /* ========================================================================
     Engines
     ======================================================================== */
  if (typeof PlanBuilder !== 'undefined') {
    if (typeof ExamBuilder !== 'undefined') {
      ExamBuilder.init({
        getActivePatient: () => getSelectedPatient(),
        showToast: (msg, variant) => showToast(msg, variant),
        onApply: examText => {
          const p = getSelectedPatient();
          if (!p) { showToast('Select a patient first', 'error'); return; }
          p.physicalExam = examText;
          touch(p);
          saveState();
          renderRightDock();
          showToast(`Physical exam updated for Rm ${p.room}`);
          if (typeof p.noteDraft === 'string') {
            showToast('The note has hand edits — use "Rebuild from chart" to pull the new exam in.', 'info');
          }
        }
      });
    }

    PlanBuilder.init({
      getState: () => state,
      saveState: () => saveState(),
      getActivePatient: () => getSelectedPatient(),
      showToast: (msg, variant) => showToast(msg, variant),
      esc: str => esc(str),
      onInsertIntoPatient: (text, title, trigger) => {
        const p = getSelectedPatient();
        if (!p) { showToast('Select a patient first', 'error'); return; }
        appendToPlan(p, `# ${title}${trigger ? ` (${trigger})` : ''}\n${text}`);
        showToast(`Inserted into Rm ${p.room} note`);
      },
      onInsertCartIntoPatient: (fullCartText, count) => {
        const p = getSelectedPatient();
        if (!p) { showToast('Select a patient first', 'error'); return; }
        appendToPlan(p, fullCartText);
        PlanBuilder.close();
        state.ui.noteSection = 'ap';
        if (state.ui.rightPaneCollapsed) state.ui.rightPaneCollapsed = false;
        saveState();
        applyUiShellState();
        renderRightDock();
        showToast(`Inserted ${count} problem${count === 1 ? '' : 's'} into Rm ${p.room} note`);
      }
    });
  }

  if (typeof ReminderEngine !== 'undefined') {
    ReminderEngine.init({
      getState: () => state,
      saveState: () => saveState(),
      getActivePatient: () => getSelectedPatient(),
      onSelectPatient: ptId => selectPatient(ptId),
      showToast: (msg, variant) => showToast(msg, variant),
      esc: str => esc(str)
    });
  }

  decorateMics(document);
  loadInitialState();
})();
