/*
 * ============================================================================
 *  site-config.js – the site's settings. Edit these values freely.
 * ============================================================================
 *  Only put PUBLIC information here: everything in /public is sent to the
 *  browser, so anyone who opens the site can read it. Never put passwords,
 *  API keys or tokens in this file (or any file under /public).
 * ============================================================================
 */
window.SITE_CONFIG = Object.freeze({
  // Shown on the welcome screen: "Welcome <ownerName>"
  ownerName: 'Mr. Buell',

  // Name of the whole site (browser tab title and header)
  siteName: 'Card Hub',

  // Where the visitor counter is stored when the site runs on the server (server/server.js).
  // If the server isn't reachable (site opened by double-clicking index.html), the counter
  // falls back to counting in this browser only.
  counterApi: '/api/visits',

  // How many digits the counter shows (000123)
  counterDigits: 6
});
