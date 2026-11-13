/*
 * ============================================================================
 *  about-me.js – draws the About Me page from window.ABOUT_ME (about-content.js).
 *  You normally only edit about-content.js; change this file to change the layout.
 * ============================================================================
 *  Functions
 *    initials(name)   "Mr. Buell" -> "MB" for the round avatar
 *    render()         builds the profile header, the section cards, the timeline and links
 *  All texts are inserted with textContent (HUB.el), so they can't inject HTML.
 * ============================================================================
 */
(function () {
  'use strict';
  const { $, el } = HUB;
  HUB.cardShell('about-me');
  const me = window.ABOUT_ME || {};

  const initials = name => String(name || '?').replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase()
    || String(name || '?')[0].toUpperCase();

  function render() {
    const page = $('#about');
    page.textContent = '';

    const hero = el('header', 'hero');
    hero.append(el('div', 'avatar', initials(me.name)));
    const ht = el('div');
    ht.append(el('h1', '', me.name || 'About me'), el('p', 'role', me.title || ''), el('p', 'intro', me.intro || ''));
    hero.append(ht);
    page.append(hero);

    const grid = el('section', 'grid');
    (me.sections || []).forEach(s => {
      const box = el('article', 'box');
      box.append(el('h2', '', s.heading || ''));
      const ul = el('ul');
      (s.items || []).forEach(i => ul.append(el('li', '', i)));
      box.append(ul);
      grid.append(box);
    });
    page.append(grid);

    if ((me.timeline || []).length) {
      const tl = el('section', 'box timeline');
      tl.append(el('h2', '', 'Timeline'));
      me.timeline.forEach(t => {
        const row = el('div', 'tl-row');
        row.append(el('span', 'tl-when', t.when || ''), el('span', 'tl-what', t.what || ''));
        tl.append(row);
      });
      page.append(tl);
    }

    const links = (me.links || []).filter(l => HUB.safeUrl(l.url) !== '#');
    if (links.length) {
      const lb = el('section', 'links');
      links.forEach(l => {
        const a = el('a', 'link', l.label || l.url);
        a.href = HUB.safeUrl(l.url);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        lb.append(a);
      });
      page.append(lb);
    }
    page.append(el('p', 'edit-note', 'Edit this page in public/cards/about-me/about-content.js'));
  }

  render();
})();
