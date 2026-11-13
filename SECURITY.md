# Security choices

## No secrets in the code
* Nothing secret is written in any file. The only setting with personal flavour is the welcome
  name in `public/assets/site-config.js` – public by design, and in one place so it's easy to change.
* Server settings (`PORT`, `HOST`) come from **environment variables**, not from the code.
* If you ever need a secret (API key, password), put it in an environment variable or a `.env`
  file **outside `public/`**, and read it in `server/server.js`. `.env` is already in `.gitignore`.
  Never put a secret in `public/` – every file there is sent to the browser.

## What stays out of git (`.gitignore`)
`data/` (visitor count), quiz files and Quiz Trainer backups (third-party content and your results),
`.env` / key files, editor and OS files.

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
- [ ] Keep `HOST=127.0.0.1` behind the proxy; don't expose Node directly.
- [ ] Read through `public/` – everything there becomes public (About Me text, config).
- [ ] Don't publish quiz content copied from other sites.
- [ ] Keep Node.js updated (LTS).
- [ ] If you add logins or a database later: hash passwords (never store them plainly), use
      secure cookies, and validate every input on the server.
