/**
 * RoundingOS — Clock, Follow-Up Alarms & Clinical Reminders Engine
 * 100% offline, zero external audio assets (uses Web Audio API chime),
 * supports relative timers (+15m/+30m/+1h/+2h/+3h), exact clock times (e.g. 11:00),
 * prominent pop-up alerts, snooze, and optional Windows/browser desktop notifications.
 */

const ReminderEngine = (() => {
  let hooks = null;
  let tickTimer = null;
  let audioCtx = null;
  let activeAlertId = null;
  let chimeRepeatTimer = null;

  function init(config) {
    hooks = config;
    bindStaticEvents();
    startClockLoop();
    renderClockAndBadge();
  }

  function ensureAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  /**
   * Plays a clear, pleasant 3-note clinical chime via Web Audio API (no external files).
   */
  function playChime(urgent = false) {
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = urgent
        ? [880, 1174.66, 880, 1174.66] // A5 -> D6 double chime
        : [659.25, 880, 1046.5];       // E5 -> A5 -> C6 warm chime

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.28, now + idx * 0.18 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.18 + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.42);
      });
    } catch (e) {
      // Ignore audio errors if blocked before user gesture
    }
  }

  function stopChimeLoop() {
    if (chimeRepeatTimer) {
      clearInterval(chimeRepeatTimer);
      chimeRepeatTimer = null;
    }
  }

  function formatClockTime(dateObj) {
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDueRelative(dueIso) {
    const diffMs = new Date(dueIso).getTime() - Date.now();
    if (diffMs <= 0) {
      const overMin = Math.floor(Math.abs(diffMs) / 60000);
      return overMin <= 0 ? 'Due now!' : `Overdue ${overMin}m`;
    }
    const mins = Math.ceil(diffMs / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
  }

  function getReminders() {
    const st = hooks?.getState?.();
    if (!st) return [];
    if (!Array.isArray(st.reminders)) st.reminders = [];
    return st.reminders;
  }

  function getActiveReminders() {
    return getReminders()
      .filter(r => !r.dismissed)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }

  function computeDueFromTimeString(hhmm) {
    const [hStr, mStr] = String(hhmm || '').split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return null;
    const target = new Date();
    target.setSeconds(0, 0);
    target.setHours(h, m, 0, 0);
    // If that clock time already passed today, schedule for tomorrow
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  function addReminder({ text, dueDate, patientId = null, patientLabel = '', playSound = true }) {
    const cleanText = String(text || '').trim();
    if (!cleanText || !dueDate || isNaN(dueDate.getTime())) return null;
    ensureAudioContext();

    const list = getReminders();
    const item = {
      id: 'rem-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
      text: cleanText,
      dueAt: dueDate.toISOString(),
      patientId: patientId || null,
      patientLabel: patientLabel || '',
      playSound: Boolean(playSound),
      triggered: false,
      dismissed: false,
      createdAt: new Date().toISOString()
    };
    list.push(item);
    hooks.saveState();
    renderClockAndBadge();
    renderModalList();
    return item;
  }

  function snoozeReminder(id, minutes) {
    const item = getReminders().find(r => r.id === id);
    if (!item) return;
    item.dueAt = new Date(Date.now() + minutes * 60000).toISOString();
    item.triggered = false;
    item.dismissed = false;
    hooks.saveState();
    if (activeAlertId === id) closeAlertPopup();
    renderClockAndBadge();
    renderModalList();
    hooks.showToast(`Snoozed reminder +${minutes}m (until ${formatClockTime(new Date(item.dueAt))})`);
  }

  function dismissReminder(id) {
    const item = getReminders().find(r => r.id === id);
    if (!item) return;
    item.dismissed = true;
    item.triggered = true;
    hooks.saveState();
    if (activeAlertId === id) closeAlertPopup();
    renderClockAndBadge();
    renderModalList();
  }

  function deleteReminder(id) {
    const st = hooks?.getState?.();
    if (!st) return;
    st.reminders = getReminders().filter(r => r.id !== id);
    hooks.saveState();
    if (activeAlertId === id) closeAlertPopup();
    renderClockAndBadge();
    renderModalList();
  }

  // The OS notification can show on the lock screen, in notification history and on a paired
  // watch, so it never carries the patient or the reminder text (HIPAA task H2). Those show only
  // in the in-app popup.
  const NOTIFICATION_TITLE = 'RoundingOS reminder';
  const NOTIFICATION_BODY = 'A reminder is due. Open the app to see it.';

  function sendDesktopNotification(item) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(NOTIFICATION_TITLE, {
        body: NOTIFICATION_BODY,
        requireInteraction: true
      });
      n.onclick = () => {
        window.focus();
        if (item.patientId) hooks?.onSelectPatient?.(item.patientId);
        n.close();
      };
    } catch (e) {
      // Ignore desktop notification errors
    }
  }

  function triggerAlarm(item) {
    item.triggered = true;
    hooks.saveState();
    activeAlertId = item.id;

    if (item.playSound !== false) {
      playChime(true);
      stopChimeLoop();
      // Gently repeat chime every 12 seconds up to 4 times while popup stays open
      let repeats = 0;
      chimeRepeatTimer = setInterval(() => {
        repeats++;
        if (repeats >= 4 || !activeAlertId) {
          stopChimeLoop();
          return;
        }
        playChime(true);
      }, 12000);
    }

    sendDesktopNotification(item);

    const modal = document.getElementById('alarmAlertModal');
    const ptEl = document.getElementById('alarmAlertPatient');
    const txtEl = document.getElementById('alarmAlertText');
    const timeEl = document.getElementById('alarmAlertTime');
    const jumpBtn = document.getElementById('alarmAlertJumpBtn');

    if (ptEl) {
      ptEl.textContent = item.patientLabel || 'General Rounding Reminder';
      ptEl.classList.toggle('hidden', !item.patientLabel);
    }
    if (txtEl) txtEl.textContent = item.text;
    if (timeEl) timeEl.textContent = `Scheduled for ${formatClockTime(new Date(item.dueAt))}`;
    if (jumpBtn) jumpBtn.classList.toggle('hidden', !item.patientId);
    if (modal) modal.classList.remove('hidden');

    renderClockAndBadge();
    renderModalList();
  }

  function closeAlertPopup() {
    stopChimeLoop();
    activeAlertId = null;
    document.getElementById('alarmAlertModal')?.classList.add('hidden');
  }

  function checkDueReminders() {
    const nowMs = Date.now();
    const pending = getReminders().filter(r => !r.dismissed && !r.triggered && new Date(r.dueAt).getTime() <= nowMs);
    if (pending.length > 0 && !activeAlertId) {
      triggerAlarm(pending[0]);
    }
  }

  function startClockLoop() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      renderClockAndBadge();
      checkDueReminders();
      const modal = document.getElementById('remindersModal');
      if (modal && !modal.classList.contains('hidden')) {
        renderModalList();
      }
    }, 5000);
    // Also check shortly after boot so overdue reminders fire promptly
    setTimeout(checkDueReminders, 1200);
    // Background tabs throttle timers; re-check as soon as the tab is visible again
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { renderClockAndBadge(); checkDueReminders(); }
    });
  }

  function renderClockAndBadge() {
    const clockEl = document.getElementById('headerClockText');
    const badgeEl = document.getElementById('headerAlarmCount');
    const btnEl = document.getElementById('openRemindersBtn');
    const now = new Date();
    if (clockEl) clockEl.textContent = formatClockTime(now);

    const active = getActiveReminders();
    const dueCount = active.filter(r => new Date(r.dueAt).getTime() <= now.getTime()).length;
    if (badgeEl) {
      badgeEl.textContent = active.length > 0 ? String(active.length) : '';
      badgeEl.classList.toggle('hidden', active.length === 0);
      badgeEl.classList.toggle('is-due', dueCount > 0);
    }
    if (btnEl) {
      btnEl.classList.toggle('has-due-alarm', dueCount > 0);
    }
  }

  function updateNotifStatusUi() {
    const btn = document.getElementById('remEnableNotifBtn');
    if (!btn) return;
    if (!('Notification' in window)) {
      btn.textContent = 'Desktop Alerts Unavailable';
      btn.disabled = true;
    } else if (Notification.permission === 'granted') {
      btn.textContent = 'Desktop Alerts On ✓';
      btn.disabled = true;
    } else if (Notification.permission === 'denied') {
      btn.textContent = 'Desktop Alerts Blocked';
      btn.disabled = true;
    } else {
      btn.textContent = 'Enable Windows/Browser Pop-Ups';
      btn.disabled = false;
    }
  }

  function renderModalList() {
    const listEl = document.getElementById('remindersList');
    if (!listEl) return;
    const active = getActiveReminders();
    const dismissed = getReminders().filter(r => r.dismissed).slice(-5).reverse();

    if (active.length === 0 && dismissed.length === 0) {
      listEl.innerHTML = `<div class="small-muted" style="padding:12px 0;">No alarms scheduled yet. Set a relative timer (e.g. +2h, +3h) or pick a clock time (e.g. 11:00) above.</div>`;
      return;
    }

    const nowMs = Date.now();
    const activeHtml = active.map(r => {
      const dueDate = new Date(r.dueAt);
      const isDue = dueDate.getTime() <= nowMs;
      return `
        <div class="rem-item ${isDue ? 'is-due' : ''}">
          <div class="rem-item-main">
            <div class="rem-item-top">
              <span class="rem-time-pill ${isDue ? 'is-due' : ''}">${hooks.esc(formatClockTime(dueDate))}</span>
              <span class="rem-rel-lbl">${hooks.esc(formatDueRelative(r.dueAt))}</span>
              ${r.patientLabel ? `<button type="button" class="rem-pt-link" data-rem-jump="${hooks.esc(r.patientId || '')}">${hooks.esc(r.patientLabel)}</button>` : ''}
            </div>
            <div class="rem-item-text">${hooks.esc(r.text)}</div>
          </div>
          <div class="rem-item-actions">
            <button type="button" class="btn btn-xs btn-secondary" data-rem-snooze="${hooks.esc(r.id)}" title="Snooze 15 min">+15m</button>
            <button type="button" class="btn btn-xs btn-secondary" data-rem-done="${hooks.esc(r.id)}" title="Mark done">✓</button>
            <button type="button" class="icon-delete-btn" data-rem-del="${hooks.esc(r.id)}" title="Delete">&times;</button>
          </div>
        </div>
      `;
    }).join('');

    const doneHtml = dismissed.length > 0 ? `
      <div class="rem-done-section">
        <div class="small-muted" style="font-weight:700; margin-bottom:4px;">Recently Completed</div>
        ${dismissed.map(r => `
          <div class="rem-item is-dismissed">
            <div class="rem-item-main">
              <div class="rem-item-top">
                <span class="rem-time-pill">${hooks.esc(formatClockTime(new Date(r.dueAt)))}</span>
                ${r.patientLabel ? `<span class="small-muted">${hooks.esc(r.patientLabel)}</span>` : ''}
              </div>
              <div class="rem-item-text">${hooks.esc(r.text)}</div>
            </div>
            <button type="button" class="icon-delete-btn" data-rem-del="${hooks.esc(r.id)}" title="Delete">&times;</button>
          </div>
        `).join('')}
      </div>
    ` : '';

    listEl.innerHTML = (activeHtml || `<div class="small-muted" style="padding:6px 0;">No active alarms pending.</div>`) + doneHtml;

    listEl.querySelectorAll('[data-rem-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.remJump) {
          hooks.onSelectPatient?.(btn.dataset.remJump);
          closeModal();
        }
      });
    });
    listEl.querySelectorAll('[data-rem-snooze]').forEach(btn => {
      btn.addEventListener('click', () => snoozeReminder(btn.dataset.remSnooze, 15));
    });
    listEl.querySelectorAll('[data-rem-done]').forEach(btn => {
      btn.addEventListener('click', () => dismissReminder(btn.dataset.remDone));
    });
    listEl.querySelectorAll('[data-rem-del]').forEach(btn => {
      btn.addEventListener('click', () => deleteReminder(btn.dataset.remDel));
    });
  }

  function populatePatientDropdown(preselectPatientId = null) {
    const sel = document.getElementById('remPatientSelect');
    if (!sel) return;
    const st = hooks?.getState?.();
    const pts = st?.patients || [];
    const activePt = hooks?.getActivePatient?.();
    const targetId = preselectPatientId !== null ? preselectPatientId : (activePt?.id || '');

    sel.innerHTML = `<option value="">General Reminder (No specific patient)</option>` +
      pts.map(p => `<option value="${hooks.esc(p.id)}" ${p.id === targetId ? 'selected' : ''}>Rm ${hooks.esc(p.room)} — ${hooks.esc(p.name)}</option>`).join('');
  }

  function setDefaultTimeInput(minutesAhead = 60) {
    const inp = document.getElementById('remExactTime');
    if (!inp) return;
    const d = new Date(Date.now() + minutesAhead * 60000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    inp.value = `${hh}:${mm}`;
  }

  function openModal(prefillPatient = null, prefillText = '') {
    ensureAudioContext();
    populatePatientDropdown(prefillPatient ? prefillPatient.id : null);
    setDefaultTimeInput(60);
    const txtEl = document.getElementById('remNoteInput');
    if (txtEl && prefillText) txtEl.value = prefillText;
    updateNotifStatusUi();
    renderModalList();
    document.getElementById('remindersModal')?.classList.remove('hidden');
    txtEl?.focus();
  }

  function closeModal() {
    document.getElementById('remindersModal')?.classList.add('hidden');
  }

  function bindStaticEvents() {
    // Quick relative time buttons (+15m, +30m, +1h, +2h, +3h)
    document.querySelectorAll('[data-rem-preset-min]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.dataset.remPresetMin, 10) || 60;
        setDefaultTimeInput(mins);
        document.querySelectorAll('[data-rem-preset-min]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('remTestSoundBtn')?.addEventListener('click', () => {
      playChime(true);
      hooks.showToast('Played alarm chime');
    });

    document.getElementById('remEnableNotifBtn')?.addEventListener('click', async () => {
      if (!('Notification' in window)) return;
      try {
        const res = await Notification.requestPermission();
        updateNotifStatusUi();
        if (res === 'granted') hooks.showToast('Windows / browser alarm pop-ups enabled ✓');
      } catch (e) {}
    });

    document.getElementById('addReminderForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const txtEl = document.getElementById('remNoteInput');
      const timeEl = document.getElementById('remExactTime');
      const ptSel = document.getElementById('remPatientSelect');
      const soundEl = document.getElementById('remPlaySound');

      const text = (txtEl?.value || '').trim();
      const dueDate = computeDueFromTimeString(timeEl?.value);
      if (!text || !dueDate) {
        hooks.showToast('Enter a reminder note and time.', 'error');
        return;
      }

      const ptId = ptSel?.value || null;
      const pt = ptId ? (hooks.getState().patients || []).find(x => x.id === ptId) : null;
      const ptLabel = pt ? `Rm ${pt.room} · ${pt.name}` : '';

      addReminder({
        text,
        dueDate,
        patientId: ptId,
        patientLabel: ptLabel,
        playSound: soundEl ? soundEl.checked : true
      });
      txtEl.value = '';
      hooks.showToast(`Alarm set for ${formatClockTime(dueDate)} (${formatDueRelative(dueDate.toISOString())}) ✓`);
    });

    // Alert Popup Buttons
    document.getElementById('alarmAlertSnooze15Btn')?.addEventListener('click', () => {
      if (activeAlertId) snoozeReminder(activeAlertId, 15);
    });
    document.getElementById('alarmAlertSnooze30Btn')?.addEventListener('click', () => {
      if (activeAlertId) snoozeReminder(activeAlertId, 30);
    });
    document.getElementById('alarmAlertDismissBtn')?.addEventListener('click', () => {
      if (activeAlertId) dismissReminder(activeAlertId);
    });
    document.getElementById('alarmAlertJumpBtn')?.addEventListener('click', () => {
      const item = getReminders().find(r => r.id === activeAlertId);
      if (item?.patientId) hooks.onSelectPatient?.(item.patientId);
      if (activeAlertId) dismissReminder(activeAlertId);
    });
  }

  /** Call once saved state is loaded: alarms that rang but were never acknowledged ring again. */
  function onStateLoaded() {
    getReminders().forEach(r => { if (r.triggered && !r.dismissed) r.triggered = false; });
    renderClockAndBadge();
    checkDueReminders();
  }

  function isAlertOpen() {
    return Boolean(activeAlertId);
  }

  /** Called when a patient is removed: keep the reminder but unlink it. */
  function unlinkPatient(patientId) {
    let changed = false;
    getReminders().forEach(r => {
      if (r.patientId === patientId) {
        r.patientId = null;
        r.patientLabel = r.patientLabel ? `${r.patientLabel} (removed)` : '';
        changed = true;
      }
    });
    if (changed) { hooks.saveState(); renderModalList(); }
  }

  return {
    init,
    isAlertOpen,
    onStateLoaded,
    closeAlertPopup,
    snoozeActive: (min) => { if (activeAlertId) snoozeReminder(activeAlertId, min); },
    unlinkPatient,
    openModal,
    closeModal,
    addReminder,
    playChime,
    renderClockAndBadge,
    computeDueFromTimeString,
    sendDesktopNotification // exposed for tests
  };
})();

