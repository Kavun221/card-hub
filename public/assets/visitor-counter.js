/*
 * ============================================================================
 *  visitor-counter.js – the visitor number at the bottom of the main page.
 * ============================================================================
 *  When is a visit counted?
 *    Only when someone ENTERS from the welcome screen (click or Enter), and only
 *    once per browser session. Reloading the page never adds a visit, because
 *    the page remembers in sessionStorage that this session was already counted.
 *
 *  Where is the number kept?
 *    Server mode – the site runs on server/server.js: the number is saved on the
 *                  server (data/visits.json), so it is the same for everybody.
 *    Local mode  – the site was opened as a file, or the server can't be reached:
 *                  the number is kept in this browser only (localStorage).
 * ============================================================================
 */
window.HUB = window.HUB || {};
(function (HUB) {
  'use strict';
  const cfg = window.SITE_CONFIG || {};
  const SESSION_FLAG = 'hub:visitCounted';
  const LOCAL_KEY = 'visitsLocal';

  /** True when the page is served over http(s), i.e. a server could answer. */
  const canUseServer = () => /^https?:$/.test(location.protocol) && !!cfg.counterApi;

  /** Ask the server: GET reads the number, POST adds one. Returns the number, or null on failure. */
  async function askServer(method) {
    try {
      const res = await fetch(HUB.root() + cfg.counterApi.replace(/^\//, ''), {
        method,
        headers: { 'X-Requested-With': 'card-hub' },   // the server only accepts POSTs with this header
        cache: 'no-store'
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Number.isSafeInteger(data.count) ? data.count : null;
    } catch {
      return null;
    }
  }

  /** Has this browser session already been counted? */
  function alreadyCounted() {
    try { return sessionStorage.getItem(SESSION_FLAG) === '1'; } catch { return false; }
  }
  function markCounted() {
    try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch { /* ignore */ }
  }

  HUB.counter = {
    /** Read the current number without counting. Returns { count, mode }. */
    async read() {
      if (canUseServer()) {
        const n = await askServer('GET');
        if (n !== null) return { count: n, mode: 'server' };
      }
      return { count: HUB.store.get(LOCAL_KEY, 0), mode: 'local' };
    },

    /** Count one visit (if this session isn't counted yet). Returns { count, mode }. */
    async registerVisit() {
      if (alreadyCounted()) return this.read();
      if (canUseServer()) {
        const n = await askServer('POST');
        if (n !== null) { markCounted(); return { count: n, mode: 'server' }; }
      }
      const n = HUB.store.get(LOCAL_KEY, 0) + 1;
      HUB.store.set(LOCAL_KEY, n);
      markCounted();
      return { count: n, mode: 'local' };
    },

    /** Draw the number into the footer: each digit in its own box, like an arcade counter. */
    render({ count, mode }) {
      const box = document.getElementById('visitorCount');
      const note = document.getElementById('counterMode');
      if (!box) return;
      const digits = String(count).padStart(cfg.counterDigits || 6, '0');
      box.textContent = '';
      [...digits].forEach((d, i) => {
        const s = HUB.el('span', 'digit', d);
        s.style.animationDelay = i * 40 + 'ms';
        box.append(s);
      });
      box.setAttribute('aria-label', `${count} visitors`);
      if (note) note.textContent = mode === 'server' ? '' : '(this browser only – start the server to count everyone)';
    }
  };
})(window.HUB);
