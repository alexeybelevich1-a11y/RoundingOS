/**
 * RoundingOS — what happens to a patient after discharge.
 *
 * Two stages, both settings (state.retention):
 *   1. Archive: a discharged patient leaves the census (hidden from the list, counts, sign-out,
 *      new-day rollover and voice) right away, or after archiveAfterDays. The Archive filter
 *      still shows them, and "Return to census" brings them back.
 *   2. Delete: deleteAfterDays after archiving, the patient is deleted for good, from the
 *      database and from every saved copy (snapshot).
 *
 * Only patients someone marked discharged are ever archived or deleted. Nothing here looks
 * at priority ("Discharge today" is a plan, not a discharge) or at the disposition text.
 * Pure functions: app.js applies the result and saves.
 */
const Retention = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULTS = Object.freeze({ archiveAfterDays: 0, deleteAfterDays: 30 });
  const ARCHIVE_CHOICES = [0, 1, 2];
  const DELETE_CHOICES = [7, 14, 30, 60, 90];

  /** Settings with defaults filled in and out-of-range values replaced. */
  function settingsOf(state) {
    const r = (state && state.retention) || {};
    return {
      archiveAfterDays: ARCHIVE_CHOICES.includes(Number(r.archiveAfterDays)) ? Number(r.archiveAfterDays) : DEFAULTS.archiveAfterDays,
      deleteAfterDays: DELETE_CHOICES.includes(Number(r.deleteAfterDays)) ? Number(r.deleteAfterDays) : DEFAULTS.deleteAfterDays
    };
  }

  const isDischarged = p => Boolean(p && p.dischargedAt);
  const isArchived = p => Boolean(p && p.dischargedAt && p.archivedAt);
  /** On the census: not yet archived (discharged-but-not-archived patients still show). */
  const isActive = p => !isArchived(p);

  function discharge(p, settings, now = new Date()) {
    p.dischargedAt = now.toISOString();
    if (settings.archiveAfterDays === 0) p.archivedAt = p.dischargedAt;
    else delete p.archivedAt;
    return p;
  }

  function returnToCensus(p) {
    delete p.dischargedAt;
    delete p.archivedAt;
    return p;
  }

  /** When an archived patient will be deleted (Date), or null. */
  function deleteDate(p, settings) {
    if (!isArchived(p)) return null;
    const t = Date.parse(p.archivedAt);
    return Number.isFinite(t) ? new Date(t + settings.deleteAfterDays * DAY_MS) : null;
  }

  /**
   * Works out what is due. Returns { toArchive: [patients], toDelete: [patients] }.
   * Patients without dischargedAt never appear in either list.
   */
  function due(patients, settings, now = new Date()) {
    const nowMs = now.getTime();
    const toArchive = [];
    const toDelete = [];
    (patients || []).forEach(p => {
      if (!isDischarged(p)) return;
      if (!isArchived(p)) {
        const d = Date.parse(p.dischargedAt);
        if (Number.isFinite(d) && nowMs - d >= settings.archiveAfterDays * DAY_MS) toArchive.push(p);
        return;
      }
      const del = deleteDate(p, settings);
      if (del && nowMs >= del.getTime()) toDelete.push(p);
    });
    return { toArchive, toDelete };
  }

  return { DEFAULTS, ARCHIVE_CHOICES, DELETE_CHOICES, settingsOf, isDischarged, isArchived, isActive, discharge, returnToCensus, deleteDate, due };
})();
