/*
 * ============================================================================
 *  auth.js – password protection for "private" cards (used by server.js)
 * ============================================================================
 *  Where is the password?
 *    NOWHERE in the code. You create it on your PC with:
 *        node server/set-password.js
 *    That stores only a scrypt HASH (+ random salt) in data/auth.json.
 *    data/ is in .gitignore, so it never goes to GitHub. A hash can't be turned
 *    back into the password.
 *
 *  How a login works
 *    1. You open a protected page (e.g. /cards/converter/) -> redirected to /auth/login
 *    2. You type the password -> the server hashes it with the stored salt and compares
 *       (constant-time compare, so timing reveals nothing)
 *    3. Correct -> a random 256-bit session id is put in a cookie:
 *         HttpOnly  (page scripts can't read it)
 *         SameSite=Strict (other websites can't use it)
 *         Secure    (when the site runs on https)
 *       The session lives only in the server's memory and expires after 8 hours.
 *       The server keeps only the SHA-256 fingerprint of that random token, never the
 *       token itself: the token is 256 random bits, so its SHA-256 can't be reversed
 *       or guessed – even someone reading the server's memory can't log in with it.
 *    4. Wrong -> after 5 wrong tries the IP must wait 15 minutes.
 *    5. The login only works over HTTPS – or over plain http on this PC itself
 *       (localhost), where the password never travels over a network.
 *
 *  Functions
 *    loadAuth()                 read data/auth.json (null if no password set yet)
 *    hashPassword(pw, salt)     scrypt hash (also used by set-password.js)
 *    isProtected(path)          is this URL behind the password?
 *    isLoggedIn(req)            valid session cookie?
 *    handleAuth(req, res, send) the /auth/* routes: login page, login, logout, status
 * ============================================================================
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

// URL folders that need the password. Add a folder here to protect another card.
const PROTECTED_PREFIXES = ['/cards/converter/'];

const SESSION_HOURS = 8;
const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

const sessions = new Map();   // SHA-256(sessionId) -> expiry time (ms)
const fingerprint = token => crypto.createHash('sha256').update(token).digest('hex');
const failures = new Map();   // ip -> { count, until }

function hashPassword(password, saltHex, params = SCRYPT) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), params.keylen,
    { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem || SCRYPT.maxmem }).toString('hex');
}

function loadAuth() {
  try {
    const a = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return a && a.hash && a.salt ? a : null;
  } catch {
    return null;
  }
}

function isProtected(urlPath) {
  return PROTECTED_PREFIXES.some(p => urlPath === p.slice(0, -1) || urlPath.startsWith(p));
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function isLoggedIn(req) {
  const id = cookies(req).hub_session;
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return false;
  const key = fingerprint(id);
  const exp = sessions.get(key);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(key); return false; }
  return true;
}

const isHttps = req => req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';

// Plain http is only allowed when you sit at the PC itself (localhost). Anywhere else the password
// would travel unencrypted over the network, so the login is refused unless the site uses HTTPS.
const isLocal = req => {
  const ip = String(req.socket.remoteAddress || '');
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  return /^(127\.|::1$|::ffff:127\.)/.test(ip) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && !req.headers['x-forwarded-for'];
};
const httpsOnlyPage = () => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>HTTPS needed</title><link rel="stylesheet" href="/assets/common.css"></head>
<body class="dark" style="display:grid;place-items:center;min-height:100vh"><div style="max-width:520px;padding:24px;text-align:center">
<div style="font-size:46px">🔐</div><h1>Login needs HTTPS</h1>
<p>This page was opened over plain http from another device. A password sent that way could be read by others on the network, so the login is switched off.</p>
<p>Open the site through HTTPS (see README → “Your own server”), or log in on the PC itself at http://127.0.0.1:8080.</p></div></body></html>`;

// Same-origin check for POSTs (blocks other websites from submitting our forms)
function sameOrigin(req) {
  // Modern browsers say where a request comes from in Sec-Fetch-Site.
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none';
  const origin = req.headers.origin;
  if (!origin) return true;               // not a browser (or a very old one): no cross-site risk
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

// Only allow redirects to our own pages ("/…", never "//other-site" or "http://…")
function safeNext(next) {
  return typeof next === 'string' && /^\/[^/\\]/.test(next) && !/[\r\n]/.test(next) ? next : '/index.html#cards';
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function loginPage(message, next) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Locked card</title><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/common.css">
<style>
body{min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 40%,#1b1f4a,#080a18 70%)}
.box{width:min(380px,92vw);background:#161a36;border:1px solid #2a2f55;border-radius:18px;padding:28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.lock{font-size:46px}h1{margin:6px 0 4px;font-family:var(--hub-display);font-size:24px}p{color:#9aa0c8;margin:0 0 18px;font-size:14px}
input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #2a2f55;background:#0e1130;color:#eef0ff;font:inherit;font-size:16px}
button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:#0e9aa7;color:#fff;font-weight:800;letter-spacing:.08em;cursor:pointer;font-size:14px}
.msg{color:#ff8f8f;font-weight:600;min-height:20px;margin:10px 0 0}a{color:#ffd166}
</style></head><body class="dark"><form class="box" method="post" action="/auth/login" autocomplete="off">
<div class="lock">🔒</div><h1>Private card</h1><p>Enter your password to open it.</p>
<input type="hidden" name="next" value="${esc(next)}">
<input type="password" name="password" placeholder="Password" required autofocus aria-label="Password">
<button type="submit">UNLOCK</button><div class="msg">${esc(message || '')}</div>
<p style="margin-top:14px"><a href="/index.html#cards">◀ Back to all cards</a></p></form></body></html>`;
}

function noPasswordPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>No password set</title><link rel="stylesheet" href="/assets/common.css"></head>
<body class="dark" style="display:grid;place-items:center;min-height:100vh"><div style="max-width:520px;padding:24px;text-align:center">
<div style="font-size:46px">🔐</div><h1>No password set yet</h1>
<p>This card is private. Create your password on this PC first – in the card-hub folder run:</p>
<pre style="background:#0e1130;padding:12px;border-radius:10px">node server/set-password.js</pre>
<p>Then restart the server and open the card again.</p><p><a style="color:#ffd166" href="/index.html#cards">◀ Back to all cards</a></p></div></body></html>`;
}

/**
 * Handles /auth/login (GET page, POST form), /auth/logout (POST), /auth/status (GET).
 * `send(res, status, body, type, extraHeaders)` comes from server.js (adds security headers).
 */
async function handleAuth(req, res, send, urlPath, query) {
  const html = 'text/html; charset=utf-8';
  const formCsp = { 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'", 'Cache-Control': 'no-store' };

  if (urlPath === '/auth/status' && req.method === 'GET') {
    return send(res, 200, JSON.stringify({ passwordSet: !!loadAuth(), loggedIn: isLoggedIn(req) }), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
  }

  if (urlPath === '/auth/login' && !isHttps(req) && !isLocal(req)) {
    req.resume();
    return send(res, 403, httpsOnlyPage(), html, formCsp);
  }

  if (urlPath === '/auth/login' && req.method === 'GET') {
    if (!loadAuth()) return send(res, 200, noPasswordPage(), html, formCsp);
    return send(res, 200, loginPage('', safeNext(query.get('next'))), html, formCsp);
  }

  if (urlPath === '/auth/login' && req.method === 'POST') {
    const auth = loadAuth();
    if (!auth) return send(res, 200, noPasswordPage(), html, formCsp);
    if (!sameOrigin(req)) return send(res, 403, 'Forbidden');
    const ip = req.socket.remoteAddress || '?';
    const f = failures.get(ip);
    if (f && f.until > Date.now()) {
      const min = Math.ceil((f.until - Date.now()) / 60000);
      return send(res, 429, loginPage(`Too many wrong tries. Wait ${min} minute${min === 1 ? '' : 's'}.`, '/'), html, formCsp);
    }
    let body;
    try { body = new URLSearchParams(await readBody(req)); } catch { return send(res, 413, 'Too large'); }
    const next = safeNext(body.get('next'));
    const given = Buffer.from(hashPassword(body.get('password') || '', auth.salt, auth.params || SCRYPT), 'hex');
    const stored = Buffer.from(auth.hash, 'hex');
    const ok = given.length === stored.length && crypto.timingSafeEqual(given, stored);
    if (!ok) {
      // start counting again if the last lock is over or the last wrong try was long ago
      const fresh = !f || (f.until && f.until <= Date.now()) || Date.now() - f.last > LOCK_MINUTES * 60000;
      const count = (fresh ? 0 : f.count) + 1;
      failures.set(ip, { count, last: Date.now(), until: count >= MAX_TRIES ? Date.now() + LOCK_MINUTES * 60000 : 0 });
      if (failures.size > 5000) failures.clear();
      const left = MAX_TRIES - count;
      return send(res, 401, loginPage(left > 0 ? `Wrong password. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : `Wrong password. Locked for ${LOCK_MINUTES} minutes.`, next), html, formCsp);
    }
    failures.delete(ip);
    const id = crypto.randomBytes(32).toString('hex');
    sessions.set(fingerprint(id), Date.now() + SESSION_HOURS * 3600000);
    for (const [k, exp] of sessions) if (exp < Date.now()) sessions.delete(k);   // tidy up old sessions
    const cookie = `hub_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${isHttps(req) ? '; Secure' : ''}`;
    return send(res, 303, '', html, { 'Set-Cookie': cookie, Location: next, 'Cache-Control': 'no-store' });
  }

  if (urlPath === '/auth/logout' && req.method === 'POST') {
    if (!sameOrigin(req) || req.headers['x-requested-with'] !== 'card-hub') return send(res, 403, 'Forbidden');
    const id = cookies(req).hub_session;
    if (id) sessions.delete(fingerprint(id));
    return send(res, 200, '{"ok":true}', 'application/json; charset=utf-8', { 'Set-Cookie': 'hub_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0', 'Cache-Control': 'no-store' });
  }

  return send(res, 404, 'Not found');
}

module.exports = { AUTH_FILE, DATA_DIR, SCRYPT, hashPassword, loadAuth, isProtected, isLoggedIn, handleAuth, safeNext, isHttps };
