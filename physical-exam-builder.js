/* Standalone preview wiring for physical-exam-builder.html */
ExamBuilder.init({
  getActivePatient: () => null,
  showToast: msg => {
    const t = document.getElementById('peToast');
    if (!t) return;
    t.textContent = msg;
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.textContent = ''; }, 2600);
  },
  onApply: () => {}
});
ExamBuilder.open();
document.getElementById('peModalPatientHint').textContent =
  'Standalone preview — build the exam, then Copy';
