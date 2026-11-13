# Security choices

## No secrets in the code
* Nothing secret is written in any file. The only setting with personal flavour is the welcome
  name in `public/assets/site-config.js` – public by design, and in one place so it's easy to change.
* Server settings (`PORT`, `HOST`) come from **environment variables**, not from the code.
* If you ever need a secret (API key, password), put it in an environment variable or a `.env`
  file **outside `public/`**, and read it in `server/server.js`. `.env` is already in `.gitignore`.
  Never put a secret in `public/` – every file there is sent to the browser.

## What stays out of git (`.gitignore`)
`data/` (visitor count **and `auth.json`, your password hash**), every `.json` except `package.json`
(exported quizzes and backups are third-party content), `.env` / key files, editor and OS files.

## Password for private cards (Converter)
* The password is **never** in the code, in GitHub or in the browser. `node server/set-password.js`
  saves only a **salted scrypt hash** in `data/auth.json` on your PC (file permission: owner only).
* Login: constant-time comparison, 5 wrong tries → 15-minute lock per IP, random 256-bit session id
  (the server keeps only its SHA-256 fingerprint) in an `HttpOnly; SameSite=Strict` cookie (`Secure` on https), sessions expire after 8 hours,
  🔒 Lock logs out. Logins posted from other websites are refused; the redirect after login only
  goes to this site's own pages.
* Every file of the private card (HTML, scripts, libraries) is behind the login on the server –
  checked on the real file path, case-insensitive (Windows).
* GitHub Pages can't check passwords, so the workflow **removes the private card before
  publishing** and the hub shows it as “Private · only on my PC”.
* **HTTPS only for the password**: the login is refused over plain http unless you are on the PC
  itself (`localhost` / `127.0.0.1`), so the password never crosses a network unencrypted. On
  HTTPS the server also sends `Strict-Transport-Security` (browsers then always use HTTPS).
* Honest limit: opening `public/index.html` by double-click (no server) skips the login – that
  requires access to your PC's files anyway.

## Converter safety
* Files are converted in the browser and never uploaded; `connect-src 'self'` blocks sending them anywhere.
* Third-party libraries are stored in the repo (no CDN), pinned versions, licences included,
  SHA-256 listed in `vendor/VERSIONS.md`, and checked by the browser with Subresource Integrity.
* pdf.js runs with `isEvalSupported:false` and `enableScripting:false` – JavaScript inside PDFs never runs.
* .docx/.xlsx files are refused if they unpack to more than 400 MB (zip bombs); size limits per file.
* XML is parsed with the browser's `DOMParser` (no scripts, no external entities).
* Converted HTML escapes all text, only keeps http(s)/mailto links, and carries its own strict CSP.
* SVG pictures are drawn as images, so scripts inside them never run.
* CSV exports can neutralise cells starting with `= + - @` (Excel formula injection).

## Browser side
* **Content-Security-Policy** on every page (meta tag) and from the server (header): scripts only
  from this site, no inline scripts, no plugins, no other domains, no form posts, no framing.
* **No `eval`**, no inline `onclick="…"` – events are attached in the scripts.
* **Text is never treated as HTML**: pages use `textContent` (`HUB.el`) or escape with `HUB.esc`.
  Quiz files are treated as untrusted data; image sources must be `data:image/…` or http(s).
* **Links** from About Me pass `HUB.safeUrl` (blocks `javascript:` links) and open with
  `rel="noopener noreferrer"`.
* **CSV export** neutralises cells starting with `= + - @` (spreadsheet formula injection).
* Quiz data and results stay in the visitor's own browser (IndexedDB). The server never receives them.

## Server side (`server/server.js`)
* Listens on **127.0.0.1** by default – only your PC can open it.
* **Only files inside `public/`** are served; `../` tricks and hidden files (`.git`, `.env`) give 404;
  only known file types are sent.
* Security headers: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
* Visitor API: only `GET`/`POST`; a `POST` needs the header `X-Requested-With: card-hub`, which other
  websites can't send without our permission (we never give it). Max 20 counts per IP per minute.
  The request body is ignored.
* **No third-party packages** – nothing to keep updated, no supply-chain risk.

## Before putting it on the internet – checklist
- [ ] Use HTTPS (e.g. Caddy or nginx in front of `server.js`, or a static host for `public/`).
- [ ] Set your password with `node server/set-password.js` on the server itself (never copy `data/` into git).
- [ ] Keep `HOST=127.0.0.1` behind the proxy; don't expose Node directly.
- [ ] Read through `public/` – everything there becomes public (About Me text, config).
- [ ] Don't publish quiz content copied from other sites.
- [ ] Keep Node.js updated (LTS).
- [ ] If you add logins or a database later: hash passwords (never store them plainly), use
      secure cookies, and validate every input on the server.
