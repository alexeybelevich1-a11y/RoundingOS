/* HIPAA H2: OS notifications never carry the patient or the reminder text. Fictional patients only. */
(() => {
  /* Swaps in a fake Notification that records what it was asked to show. */
  function withFakeNotification(fn) {
    const real = Object.getOwnPropertyDescriptor(window, 'Notification');
    const shown = [];
    class FakeNotification {
      constructor(title, opts) { shown.push({ title, body: opts && opts.body }); }
      close() {}
    }
    FakeNotification.permission = 'granted';
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
    try { fn(shown); } finally {
      if (real) Object.defineProperty(window, 'Notification', real); else delete window.Notification;
    }
  }

  test('reminders: the OS notification is generic, with no patient or reminder text', () => {
    withFakeNotification(shown => {
      ReminderEngine.sendDesktopNotification({
        id: 'rem-test', patientId: 'pt-x', patientLabel: 'Rm 12 · Test Patient',
        text: 'Recheck potassium for Test Patient', dueAt: new Date().toISOString()
      });
      ReminderEngine.sendDesktopNotification({ id: 'rem-test2', patientId: null, patientLabel: '', text: 'Call the lab' });
      assertEqual(shown.length, 2, 'two notifications');
      shown.forEach(n => {
        assertEqual(n.title, 'RoundingOS reminder', 'title');
        assertEqual(n.body, 'A reminder is due. Open the app to see it.', 'body');
        assert(!/Test Patient|Rm 12|potassium|lab/i.test(n.title + n.body), 'no patient or reminder text');
      });
    });
  });
})();
