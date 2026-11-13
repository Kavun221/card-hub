/*
 * ============================================================================
 *  main.js – logic of the main page (index.html)
 * ============================================================================
 *  Flow
 *    1. Page opens -> the welcome screen ("Welcome Mr. Buell") is shown,
 *       unless you already entered in this browser session (then straight to the cards).
 *    2. Click or Enter -> enterHub(): counts the visit, shows the card-select screen.
 *    3. Card-select screen -> buildCards() draws one card per registry entry.
 *       Mouse or arrow keys choose a card, click / Enter opens it (openCard).
 *
 *  Functions
 *    init()            start-up: fill in texts, decide which screen to show
 *    enterHub()        leave the welcome screen and count the visit
 *    showSelect()      show the card-select screen and the counter
 *    buildCards()      create the card elements from window.HUB_CARDS
 *    focusCard(i)      highlight card number i and show it in the detail strip
 *    openCard(card)    go to the card's page, or say "coming soon" if it's locked
 *    onKeys(e)         keyboard: arrows move, Enter opens
 *    starfield()       the moving stars behind the welcome text
 * ============================================================================
 */
(function () {
  'use strict';
  const { $, el } = HUB;
  const cfg = window.SITE_CONFIG || {};
  const cards = window.HUB_CARDS || [];
  const ENTERED = 'hub:entered';          // sessionStorage flag: welcome already passed in this session
  let current = 0;                        // index of the highlighted card
  let stopStars = () => {};

  function init() {
    $('#welcomeName').textContent = cfg.ownerName || '';
    $('#siteName').textContent = cfg.siteName || 'Card Hub';
    document.title = cfg.siteName || 'Card Hub';
    buildCards();

    let entered = false;
    try { entered = sessionStorage.getItem(ENTERED) === '1'; } catch { /* ignore */ }
    if (entered || location.hash === '#cards') {
      // Coming back from a card: skip the welcome, just show the number (no new visit).
      showSelect(false);
      HUB.counter.read().then(r => HUB.counter.render(r));
    } else {
      stopStars = starfield($('#stars'));
      const w = $('#welcome');
      w.addEventListener('click', enterHub);
      w.focus();
    }
    document.addEventListener('keydown', onKeys);
  }

  function enterHub() {
    if ($('#welcome').hidden || $('#welcome').classList.contains('leaving')) return;
    try { sessionStorage.setItem(ENTERED, '1'); } catch { /* ignore */ }
    $('#welcome').classList.add('leaving');               // CSS fade/zoom-out
    setTimeout(() => { $('#welcome').hidden = true; stopStars(); showSelect(true); }, 550);
    HUB.counter.registerVisit().then(r => HUB.counter.render(r));
  }

  function showSelect(animate) {
    $('#welcome').hidden = true;
    const s = $('#select');
    s.hidden = false;
    if (animate) s.classList.add('enter');
    $('#counterBar').hidden = false;
    if (location.hash !== '#cards') history.replaceState(null, '', '#cards');
    focusCard(current);
  }

  function buildCards() {
    const grid = $('#cardGrid');
    grid.textContent = '';
    cards.forEach((card, i) => {
      const c = el('button', 'game-card' + (card.status === 'ready' ? '' : ' locked'));
      c.type = 'button';
      c.setAttribute('role', 'listitem');
      c.style.setProperty('--accent', card.accent || '#6d6ff5');
      c.style.setProperty('--delay', i * 70 + 'ms');
      const art = el('div', 'card-art');
      art.append(el('div', 'card-icon', card.icon || '★'));
      const body = el('div', 'card-body');
      body.append(
        el('div', 'card-name', card.name),
        el('div', 'card-tag', card.tagline || ''),
        el('div', 'card-meta', card.status === 'ready' ? `${card.category} · v${card.version}` : 'Locked')
      );
      const badge = el('div', 'card-badge', card.status === 'ready' ? 'READY' : 'SOON');
      c.append(badge, art, body);
      c.addEventListener('mouseenter', () => focusCard(i, false));
      c.addEventListener('focus', () => focusCard(i, false));
      c.addEventListener('click', () => openCard(card, c));
      grid.append(c);
    });
  }

  function focusCard(i, moveFocus = true) {
    const els = [...document.querySelectorAll('.game-card')];
    if (!els.length) return;
    current = (i + els.length) % els.length;
    els.forEach((e, k) => e.classList.toggle('active', k === current));
    if (moveFocus && document.activeElement !== els[current] && !$('#select').hidden) els[current].focus({ preventScroll: false });
    const card = cards[current];
    $('#dIcon').textContent = card.icon || '★';
    $('#dName').textContent = card.name;
    $('#dDesc').textContent = card.status === 'ready' ? card.description : 'This card will come soon.';
    const go = $('#dGo');
    go.disabled = card.status !== 'ready';
    go.textContent = card.status === 'ready' ? 'Play ▶' : 'Locked 🔒';
    go.onclick = () => openCard(card, els[current]);
    $('#detail').style.setProperty('--accent', card.accent || '#6d6ff5');
  }

  function openCard(card, cardEl) {
    if (card.status !== 'ready' || !card.path) {
      if (cardEl) { cardEl.classList.remove('shake'); void cardEl.offsetWidth; cardEl.classList.add('shake'); }
      HUB.toast(`${card.name}: will come soon`);
      return;
    }
    if (cardEl) cardEl.classList.add('chosen');
    document.body.classList.add('fade-out');
    setTimeout(() => { location.href = HUB.cardUrl(card); }, 380);
  }

  function onKeys(e) {
    if (!$('#welcome').hidden) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enterHub(); }
      return;
    }
    const els = [...document.querySelectorAll('.game-card')];
    const perRow = Math.max(1, Math.round($('#cardGrid').clientWidth / (els[0] ? els[0].offsetWidth + 18 : 240)));
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow };
    if (e.key in moves) { e.preventDefault(); focusCard(current + moves[e.key]); }
    else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); openCard(cards[current], els[current]); }
  }

  /** Moving stars on a canvas. Returns a function that stops the animation. */
  function starfield(canvas) {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let w, h, stars = [], raf = 0;
    const size = () => {
      w = canvas.width = canvas.offsetWidth * devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * devicePixelRatio;
      stars = Array.from({ length: 160 }, () => ({ x: Math.random() * w - w / 2, y: Math.random() * h - h / 2, z: Math.random() * w }));
    };
    const frame = () => {
      ctx.fillStyle = 'rgba(8, 10, 24, 0.35)';
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        s.z -= reduce ? 0 : 2.2 * devicePixelRatio;
        if (s.z <= 1) { s.z = w; s.x = Math.random() * w - w / 2; s.y = Math.random() * h - h / 2; }
        const k = 160 / s.z, x = s.x * k + w / 2, y = s.y * k + h / 2, r = Math.max(0.4, 1.8 - s.z / w * 1.8) * devicePixelRatio;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.fillStyle = `rgba(190, 200, 255, ${1 - s.z / w})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    size(); frame();
    window.addEventListener('resize', size);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); };
  }

  init();
})();
