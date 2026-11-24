/* RoundingOS: service worker registration, "Update available" and "Install app".
 * Separate from app.js on purpose: none of this touches patient data or state.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ---------- Toast (same look as app.js toasts, but stays until acted on) ---------- */
  function stickyToast(message, actions) {
    const box = $('toastContainer');
    if (!box) return null;
    const t = document.createElement('div');
    t.className = 'toast';
    const span = document.createElement('span');
    span.textContent = message;
    t.appendChild(span);
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = a.label;
      b.addEventListener('click', () => { t.remove(); a.onClick(); });
      t.appendChild(b);
    });
    box.appendChild(t);
    return t;
  }

  /* ---------- Service worker ---------- */
  const swSupported = 'serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  let updateShown = false;
  let reloadRequested = false;

  function offerUpdate(worker) {
    if (!worker || updateShown) return;
    updateShown = true;
    const updateItem = $('pwaUpdateBtn');
    const apply = () => {
      reloadRequested = true;
      worker.postMessage('SKIP_WAITING');
    };
    if (updateItem) {
      updateItem.classList.remove('hidden');
      updateItem.addEventListener('click', apply, { once: true });
    }
    stickyToast('Update available. Reload when you are ready.', [
      { label: 'Reload', onClick: apply },
      { label: 'Later', onClick: () => {} }
    ]);
  }

  if (swSupported) {
    // Reload only after the user asked for it, never on its own mid-shift
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadRequested) location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // A controller already exists → this is an update, not the first install
            if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
          });
        });
        // Check for a new version when the app comes back to the foreground, at most hourly
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60 * 60 * 1000) {
            lastCheck = Date.now();
            reg.update().catch(() => {});
          }
        });
      }).catch(() => { /* offline support unavailable; the app still works online */ });
    });
  }

  /* ---------- Install app ---------- */
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let deferredPrompt = null;

  function closeToolsMenu() {
    const dd = $('toolsDropdown');
    if (dd) dd.classList.add('hidden');
    const btn = $('toolsMenuBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function showInstallHelp() {
    const modal = $('installHelpModal');
    if (!modal) return;
    $('installHelpIos').classList.toggle('hidden', !isIos);
    $('installHelpOther').classList.toggle('hidden', isIos);
    modal.classList.remove('hidden');
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // keep Chrome's mini-bar away; the menu item offers it instead
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const item = $('installAppBtn');
    if (item) item.classList.add('hidden');
  });

  /* ---------- "Not encrypted yet" banner: every launch, hidden for the session on × ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const banner = $('testDataBanner');
    if (!banner) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('roundingos_testdata_banner') === 'hidden'; } catch (e) { /* ignore */ }
    banner.classList.toggle('hidden', dismissed);
    $('testDataBannerClose').addEventListener('click', () => {
      banner.classList.add('hidden');
      try { sessionStorage.setItem('roundingos_testdata_banner', 'hidden'); } catch (e) { /* ignore */ }
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    const item = $('installAppBtn');
    if (!item) return;
    if (isStandalone()) { item.classList.add('hidden'); return; }
    item.addEventListener('click', async () => {
      closeToolsMenu();
      if (deferredPrompt) {
        const p = deferredPrompt;
        deferredPrompt = null;
        p.prompt();
        try { await p.userChoice; } catch (err) { /* ignore */ }
      } else {
        showInstallHelp();
      }
    });
  });
})();
