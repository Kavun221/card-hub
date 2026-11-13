/*
 * card.js – the code of this card. Keep everything for this card in this folder.
 * Rules that keep the site safe:
 *   - put text on the page with HUB.el(tag, class, text) or element.textContent
 *   - if you must use innerHTML, wrap outside data in HUB.esc(...)
 *   - no inline <script> or onclick="..." in the HTML (blocked by the security policy);
 *     attach events here with addEventListener
 *   - never write passwords / API keys in any file under /public
 */
(function () {
  'use strict';
  const { $, el } = HUB;
  HUB.cardShell('my-card-id');          // <- change to your card's id (adds the "◀ All cards" bar)

  const app = $('#app');
  app.append(el('h1', '', 'My new card'), el('p', '', 'Build your card here.'));
  const btn = el('button', 'btn', 'Click me');
  btn.addEventListener('click', () => HUB.toast('It works!'));
  app.append(btn);
})();
