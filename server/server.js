/*
 * ============================================================================
 *  Card Hub – small web server
 * ============================================================================
 *  What it does
 *    1. Serves the website files in ../public (HTML, CSS, JS, images).
 *    2. Keeps the visitor counter in ../data/visits.json, through a tiny API:
 *         GET  /api/visits   -> { "count": 12 }      (read the number)
 *         POST /api/visits   -> { "count": 13 }      (add one visit, return new number)
 *
 *  Why there are no npm packages
 *    Only Node's built-in modules are used (http, fs, path). Nothing to install,
 *    and no third-party code that could be compromised.
 *
 *    3. Protects "private" cards with a password (see auth.js). The password is
 *       created on your PC with `node server/set-password.js` and only its hash is
 *       kept in ../data/auth.json – never in the code, never on GitHub.
 *
 *  Settings (environment variables – nothing secret is written in this file)
 *    PORT  port number, default 8080
 *    HOST  network address, default 127.0.0.1 = only THIS computer can open the site.
 *          Set HOST=0.0.0.0 only if other devices on your network should reach it.
 *
 *  Start:  node server/server.js      (or double-click start-windows.bat)
 * ============================================================================
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const auth = require('./auth');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(__dirname, '..', 'public');   // only files inside this folder are served
const DATA_DIR = path.resolve(__dirname, '..', 'data');  // runtime data, never committed to git (.gitignore)
const VISITS_FILE = path.join(DATA_DIR, 'visits.json');

// File types the server is willing to send. Anything else gets 404.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// Security headers sent with every response.
//   Content-Security-Policy: scripts may only come from this site (no inline scripts, no other domains)
//   X-Content-Type-Options: the browser must trust our Content-Type instead of guessing
//   X-Frame-Options / frame-ancestors: other sites may not embed this site in a frame
//   Referrer-Policy: don't leak the page address to other sites
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

/** Send a response with the security headers added. */
function send(res, status, body, type, extra = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8' }, SECURITY_HEADERS, extra));
  res.end(body);
}

/* ----------------------------- visitor counter ----------------------------- */

/** Read the current count from data/visits.json (0 if the file doesn't exist yet). */
function readVisits() {
  try {
    const n = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf8')).count;
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Save the count. Written to a temp file first, then renamed, so a crash can't leave a half-written file. */
function writeVisits(n) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = VISITS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ count: n, updated: new Date().toISOString() }));
  fs.renameSync(tmp, VISITS_FILE);
}

// Simple flood protection: each IP address may add at most 20 visits per minute.
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();            // keep memory bounded
  return list.length > 20;
}

function handleVisits(req, res) {
  const json = obj => send(res, 200, JSON.stringify(obj), MIME['.json'], { 'Cache-Control': 'no-store' });
  if (req.method === 'GET') return json({ count: readVisits() });
  if (req.method === 'POST') {
    // The page sends a custom header. Browsers refuse to send custom headers from OTHER
    // websites without asking us first (CORS), and we never say yes – so only our own pages can count.
    if (req.headers['x-requested-with'] !== 'card-hub') return send(res, 403, 'Forbidden');
    if (tooMany(req.socket.remoteAddress || '?')) return send(res, 429, 'Too many requests');
    req.resume();                                  // ignore any request body
    const n = readVisits() + 1;
    writeVisits(n);
    return json({ count: n });
  }
  return send(res, 405, 'Method not allowed', undefined, { Allow: 'GET, POST' });
}

/* ------------------------------ static files ------------------------------- */

function serveFile(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  // Block hidden files/folders such as .git or .env
  if (rel.split('/').some(part => part.startsWith('.'))) return send(res, 404, 'Not found');

  let file = path.resolve(ROOT, '.' + rel);
  // Path-traversal protection: the final path must still be inside ROOT ("../../" tricks are refused)
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 404, 'Not found');

  // Private cards: checked on the REAL file path, in lower case (Windows ignores letter case,
  // so /CARDS/Converter/ must not slip past the check).
  const real = ('/' + path.relative(ROOT, file).split(path.sep).join('/')).toLowerCase();
  if (auth.isProtected(real + (real.endsWith('/') ? '' : '/')) && !auth.isLoggedIn(req)) {
    return send(res, 302, '', undefined, { Location: '/auth/login?next=' + encodeURIComponent(rel), 'Cache-Control': 'no-store' });
  }

  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); }
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return send(res, 404, 'Not found');
    fs.readFile(file, (err2, data) => {
      if (err2) return send(res, 404, 'Not found');
      send(res, 200, req.method === 'HEAD' ? undefined : data, type, { 'Cache-Control': auth.isProtected(real + '/') ? 'no-store' : 'no-cache' });
    });
  });
}

/* --------------------------------- server ---------------------------------- */

const server = http.createServer((req, res) => {
  // On HTTPS: tell browsers to always use HTTPS for this site from now on (HSTS)
  if (auth.isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  let u;
  try { u = new URL(req.url, 'http://x'); } catch { return send(res, 400, 'Bad request'); }
  if (u.pathname.startsWith('/auth/')) {
    return auth.handleAuth(req, res, send, u.pathname, u.searchParams).catch(() => send(res, 500, 'Error'));
  }
  if (req.url === '/api/visits' || req.url.startsWith('/api/visits?')) return handleVisits(req, res);
  if (req.url.startsWith('/api/')) return send(res, 404, 'Not found');
  return serveFile(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Card Hub is running:  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
  console.log(auth.loadAuth() ? 'Private cards: password is set.' : 'Private cards: NO password yet – run  node server/set-password.js');
  console.log('Press Ctrl+C to stop.');
});
