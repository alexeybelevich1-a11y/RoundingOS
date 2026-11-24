/**
 * RoundingOS — moving the census between devices (export file → import with merge).
 *
 * Pure functions, no DOM and no storage: app.js does the file picking and saving.
 * Merge rules (one user, two devices):
 *   - patients are matched by id, and the newer updatedAt wins
 *   - a patient on only one side is kept (added if it came from the file)
 *   - a patient deleted here after the file's copy was last edited stays deleted (local tombstones)
 *   - a patient deleted on the other device after this copy was last edited is removed here
 *     (the file's deletedPatients list)
 *   - settings, dot phrases and reminders on this device are kept; only "Replace everything" takes the file's
 */
const Transfer = (() => {
  const TRANSFER_FIELDS = ['deletedPatients'];

  /** What goes into an export file: the whole state plus the ids deleted on this device. */
  function buildExport(state, tombstones) {
    return {
      ...state,
      deletedPatients: (tombstones || []).map(t => ({ id: t.id, deletedAt: t.deletedAt }))
    };
  }

  /** The imported file as an app state, without the transfer-only fields. */
  function stripTransferFields(parsed) {
    const out = { ...parsed };
    TRANSFER_FIELDS.forEach(k => delete out[k]);
    return out;
  }

  const ts = v => (typeof v === 'string' ? v : '');

  /**
   * mergeStates(local, incoming, localTombstones) → { patients, summary }
   * `patients` is the merged list (local order, new ones appended). Nothing is mutated.
   * summary: { added, updated, keptLocal, unchanged, removed, skippedDeleted }
   */
  function mergeStates(local, incoming, localTombstones) {
    const summary = { added: 0, updated: 0, keptLocal: 0, unchanged: 0, removed: 0, skippedDeleted: 0 };
    const localDeleted = new Map((localTombstones || []).map(t => [t.id, ts(t.deletedAt)]));
    const remoteDeleted = new Map((incoming.deletedPatients || []).map(t => [t.id, ts(t.deletedAt)]));
    const incomingById = new Map();
    (incoming.patients || []).forEach(p => { if (p && p.id) incomingById.set(p.id, p); });

    const patients = [];
    const seen = new Set();
    (local.patients || []).forEach(lp => {
      seen.add(lp.id);
      const ip = incomingById.get(lp.id);
      if (!ip) {
        const delAt = remoteDeleted.get(lp.id);
        if (delAt !== undefined && delAt >= ts(lp.updatedAt)) { summary.removed++; return; }
        patients.push(lp);
        return;
      }
      const li = ts(lp.updatedAt);
      const ii = ts(ip.updatedAt);
      if (ii > li) { patients.push(ip); summary.updated++; }
      else if (ii < li) { patients.push(lp); summary.keptLocal++; }
      else { patients.push(lp); summary.unchanged++; }
    });

    incomingById.forEach((ip, id) => {
      if (seen.has(id)) return;
      const delAt = localDeleted.get(id);
      if (delAt !== undefined && delAt >= ts(ip.updatedAt)) { summary.skippedDeleted++; return; }
      patients.push(ip);
      summary.added++;
    });

    return { patients, summary };
  }

  /** "3 new, 5 updated, 1 kept local (newer)" */
  function describeSummary(s) {
    const parts = [];
    if (s.added) parts.push(`${s.added} new`);
    if (s.updated) parts.push(`${s.updated} updated`);
    if (s.keptLocal) parts.push(`${s.keptLocal} kept local (newer)`);
    if (s.removed) parts.push(`${s.removed} removed (deleted on the other device)`);
    if (s.skippedDeleted) parts.push(`${s.skippedDeleted} skipped (deleted on this device)`);
    if (s.unchanged) parts.push(`${s.unchanged} unchanged`);
    return parts.length ? parts.join(', ') : 'No patients in either census';
  }

  return { buildExport, stripTransferFields, mergeStates, describeSummary };
})();
