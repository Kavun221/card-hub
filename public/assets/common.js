/*
 * ============================================================================
 *  common.js – small helpers shared by every page. Everything lives in the
 *  global object HUB, so pages call HUB.el(...), HUB.toast(...) and so on.
 * ============================================================================
 */
window.HUB = window.HUB || {};
(function (HUB) {
  'use strict';

  /** HUB.$('#id') – shortcut for document.querySelector. */
  HUB.$ = sel => document.querySelector(sel);

  /**
   * HUB.el('div', 'my-class', 'text') – create an element.
   * Text is set with textContent, so it is never interpreted as HTML (safe for any text).
   */
  HUB.el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };

  /**
   * HUB.esc(text) – make text safe to put inside innerHTML.
   * Use it on ANY value that did not come from your own code (quiz files, user input…).
   */
  HUB.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** HUB.shuffle(list) – a shuffled COPY of a list (Fisher–Yates). */
  HUB.shuffle = list => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  /** HUB.pct(part, whole) – whole-number percentage, 0 when whole is 0. */
  HUB.pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  /** HUB.clamp(n, min, max) – keep a number inside a range. */
  HUB.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /** HUB.fmtDate(timestamp) – "13 Nov 2026, 14:21" in the visitor's own format. */
  HUB.fmtDate = t => new Date(t).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /** HUB.safeUrl(url) – only allow http(s) and mailto links (blocks "javascript:" links). */
  HUB.safeUrl = url => (/^(https?:|mailto:)/i.test(String(url || '').trim()) ? String(url).trim() : '#');

  /**
   * HUB.store – localStorage that never crashes (storage can be blocked or full).
   * HUB.store.get('key', fallback) / HUB.store.set('key', value)
   */
  HUB.store = {
    get(key, fallback) { try { const v = localStorage.getItem('hub:' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('hub:' + key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
  };

  /** HUB.toast('message') – a short message at the bottom of the screen. */
  HUB.toast = msg => {
    let t = document.getElementById('hub-toast');
    if (!t) { t = HUB.el('div', 'hub-toast'); t.id = 'hub-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('on'), 2600);
  };

  /**
   * HUB.root – path from the current page back to /public.
   * Each page says where it is with <html data-root="../../">; the main page has data-root="".
   */
  HUB.root = () => document.documentElement.getAttribute('data-root') || '';

  /** HUB.card(id) – the registry entry of a card (from cards-registry.js). */
  HUB.card = id => (window.HUB_CARDS || []).find(c => c.id === id);

  /**
   * HUB.isStaticHost() – true on GitHub Pages / Netlify / Cloudflare Pages and when the site is
   * opened as a file: there is no server there, so no password check and no shared counter.
   */
  HUB.isStaticHost = () => location.protocol === 'file:' || /(\.github\.io|\.netlify\.app|\.pages\.dev)$/i.test(location.hostname);

  /** HUB.isLocked(card) – locked = "coming soon", or a private card on a host without the server. */
  HUB.isLocked = card => card.status !== 'ready' || !card.path || (card.private && HUB.isStaticHost() && location.protocol !== 'file:');

  /** HUB.cardUrl(card) – link to a card's page from the current page. */
  HUB.cardUrl = card => HUB.root() + card.path;

  /**
   * HUB.cardShell('card-id') – call this at the top of every card page.
   * Adds the slim top bar with "◀ All cards" and the card's name, and sets the tab title.
   */
  HUB.cardShell = id => {
    const card = HUB.card(id) || { name: id, icon: '' };
    const cfg = window.SITE_CONFIG || {};
    document.title = `${card.name} · ${cfg.siteName || 'Card Hub'}`;
    const bar = HUB.el('nav', 'hub-bar');
    const back = HUB.el('a', 'hub-back', '◀ All cards');
    back.href = HUB.root() + 'index.html#cards';
    const title = HUB.el('span', 'hub-bar-title', `${card.icon || ''} ${card.name}`.trim());
    bar.append(back, title);
    document.body.prepend(bar);
    return card;
  };
})(window.HUB);
