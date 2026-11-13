# How it works – every file and function

Read this when you want to change or extend something. Each code file also starts with a
comment block that says the same in short.

## The big picture

```
browser opens public/index.html
   │  loads: site-config.js → cards-registry.js → common.js → visitor-counter.js → main.js
   ▼
welcome screen ── click/Enter ──► visit counted (once per session) ──► card-select screen
                                                                          │ click a card
                                                                          ▼
                                                         public/cards/<id>/index.html
                                                         (loads the shared files + its own scripts)
```

* **No build step, no frameworks.** Plain HTML, CSS and JavaScript. Edit a file, reload the page.
* **Classic `<script>` tags** (not modules), so the site also works when opened by double-click.
* **Shared code** lives in `public/assets/`. **Card code** lives in `public/cards/<id>/`.
* **Global objects** keep things organised:
  * `window.SITE_CONFIG` – settings (site-config.js)
  * `window.HUB_CARDS` – the card list (cards-registry.js)
  * `window.HUB` – shared helpers (common.js, visitor-counter.js)
  * `window.QT` – everything of Quiz Trainer (qt-*.js)
  * A new card can use its own object (for example `window.FLASH`) or a private `(function () { … })()` block.
* **Each page says where it is** with `<html data-root="../../">`, so shared code can build links back to `/public`.

---

## server/server.js
A web server built only from Node's own modules.

| Part | What it does |
|---|---|
| `PORT`, `HOST` | Read from environment variables (default `8080`, `127.0.0.1` = this PC only). |
| `MIME` | File types the server will send. Others → 404. |
| `SECURITY_HEADERS` | Sent with every answer: Content-Security-Policy, nosniff, no framing, no referrer. |
| `send()` | Writes a response with the security headers. |
| `readVisits()` / `writeVisits()` | Read/save `data/visits.json`. Writing goes to a temp file first, then rename (no half-written file). |
| `tooMany(ip)` | Flood protection: max 20 counted visits per IP per minute. |
| `handleVisits()` | `GET /api/visits` → `{count}`. `POST /api/visits` (must have header `X-Requested-With: card-hub`) → count + 1. |
| `serveFile()` | Serves files from `public/` only. Refuses hidden files (`.git`, `.env`) and `../` path tricks. A folder serves its `index.html`. Private folders (see auth.js) redirect to the login unless you are logged in – checked on the real file path in lower case, so `/CARDS/Converter/` can't sneak past on Windows. |

## server/auth.js and server/set-password.js (password for private cards)
| Part | What it does |
|---|---|
| `set-password.js` | Asks for the password twice (hidden), makes a random 16-byte **salt**, hashes with **scrypt** and saves `{salt, hash, params}` in `data/auth.json` (file readable only by you). `--remove` deletes it. |
| `PROTECTED_PREFIXES` | Which URL folders need the password (`/cards/converter/`). |
| `hashPassword(pw, salt)` | scrypt (N=32768, r=8, p=1, 64 bytes) – deliberately slow, so guessing is slow. |
| `isProtected(path)` / `isLoggedIn(req)` | Is this a private page? Does the request carry a valid session cookie? |
| `handleAuth()` | `GET /auth/login` login page · `POST /auth/login` checks the password (constant-time compare) and sets the cookie · `POST /auth/logout` · `GET /auth/status`. |
| Session | A random 256-bit token (64 hex characters) in your cookie. The server's memory keeps only its SHA-256 fingerprint (safe because the token is fully random), valid 8 h. Cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` on https. Restarting the server logs everyone out. |
| Brute-force guard | 5 wrong tries per IP → locked 15 minutes. |
| HTTPS rule | `isLocal()` / `isHttps()`: the login page and form only work on the PC itself or over HTTPS; anywhere else they show “Login needs HTTPS”. |
| Other protections | Logins from other websites are refused (Sec-Fetch-Site / Origin check); the “go back to” address after login must be one of our own pages (no open redirect). |

## public/index.html + assets/main.js (main page)
| Function | What it does |
|---|---|
| `init()` | Puts your name and the site name on the page, builds the cards, shows the welcome screen – or skips it if you already entered in this session / came back with `#cards`. |
| `enterHub()` | Runs on click/Enter on the welcome screen: fade-out, remember "entered", count the visit, show the cards. |
| `showSelect()` | Shows the card grid and the counter. |
| `buildCards()` | Creates one `<button class="game-card">` per entry in `HUB_CARDS` (icon, name, tagline, READY/SOON badge, accent colour). |
| `focusCard(i)` | Highlights card *i* and fills the detail strip (name, description, Play button). |
| `openCard(card)` | Ready card → short animation, then go to its page. Locked card → shake + "will come soon". |
| `onKeys(e)` | Enter on welcome; arrow keys move between cards; Enter opens. |
| `starfield(canvas)` | The flying stars. Stops itself when you leave the welcome screen. Respects "reduce motion". |

## assets/visitor-counter.js
| Function | What it does |
|---|---|
| `HUB.counter.read()` | Gets the number without counting (server first, else this browser's number). |
| `HUB.counter.registerVisit()` | Counts one visit unless this browser session was already counted (sessionStorage flag) – so **reloading never adds visits**. |
| `HUB.counter.render({count, mode})` | Draws the digits; in local mode adds "(this browser only…)". |

## assets/common.js (`HUB`)
| Helper | Use |
|---|---|
| `HUB.$(sel)` | `document.querySelector` |
| `HUB.el(tag, class, text)` | Create an element; text goes in with `textContent` (safe). |
| `HUB.esc(text)` | Escape text before putting it in `innerHTML`. |
| `HUB.shuffle(list)` | Shuffled copy. |
| `HUB.pct(a, b)`, `HUB.clamp(n, lo, hi)`, `HUB.fmtDate(t)` | Small maths/format helpers. |
| `HUB.safeUrl(url)` | Only lets `http(s):`/`mailto:` links through. |
| `HUB.store.get/set` | localStorage that never throws. |
| `HUB.toast(msg)` | Message at the bottom of the screen. |
| `HUB.root()`, `HUB.card(id)`, `HUB.cardUrl(card)` | Paths and registry look-ups. |
| `HUB.cardShell(id)` | Top bar "◀ All cards" + tab title. Call it first on every card page. |

---

## Card: Quiz Trainer (`public/cards/quiz-trainer/`)

Scripts load in this order (see its `index.html`); `qt-app.js` is last and starts everything.

| File | Functions |
|---|---|
| `qt-storage.js` | `QT.db.get/set/del` (IndexedDB, falls back to localStorage) · `QT.getIndex()` list of quizzes · `QT.getQuiz(id)` · `QT.getAttempts(id)` (+ `QT.upgradeAttempt` adds `full`/`count` to old results) · `QT.addAttempt(id, a)` · `QT.getSettings(id, total)` / `QT.saveSettings(id, s)` – range and options remembered **per quiz**. |
| `qt-charts.js` | `QT.lineChart(series, opts)` SVG line chart · `QT.trendOf(attempts)` "Improving / Getting worse / Steady" from **full** attempts. |
| `qt-import.js` | `QT.normalizeQuiz()` checks and cleans a quiz file · `QT.importFiles()` · `QT.backupAll()` · `QT.restoreBackup()` (merges, no duplicates) · `QT.setupDrop()` drag-and-drop. |
| `qt-library.js` | `QT.renderHome()` quizzes + overall progress · `QT.renderQuiz(id)` start panel (range, shuffle, pass mark) and results (tiles, chart with **Full quiz / All attempts** switch, history table) · `buildRangePicker()` From/To boxes + presets · `QT.rangeText()` / `QT.rangeTag()`. |
| `qt-play.js` | `QT.startSession(quiz, set, onlyIds)` · `QT.renderQuestion()` · `needCount()` · `isRight()` · `pick()` · `go()` · keyboard handler · `finish()` saves the attempt · `QT.renderResults()`. |
| `qt-app.js` | `QT.route()` picks the screen from the URL (`#quiz/<id>`) · `QT.ordered(quiz)` · `QT.scored(q)` · `QT.paras()` · `QT.fmtDur()` · `QT.setTop()` · `boot()`. |

**The question range**
* Questions are first sorted by their number (`QT.ordered`). "From 1 to 60" means the 1st to the 60th question in that order.
* Rules: at least 1 question, at most the quiz's total, and *from* ≤ *to* (the boxes correct themselves).
* *Random question order* off → always asked in order, lowest number first. On → the chosen range is shuffled.
* *Random answer order* shuffles A/B/C… (scoring still uses the real answer).
* **Full attempt** = range is 1 → total. Only full attempts are drawn in the progress charts and used for "last/best full score" and the trend.
* **Part attempt** = any smaller range. Saved in the history table ("Q1–60 (60)"), counted in "questions done" and right/wrong totals, and visible with **All attempts** on the chart.
* **Wrong-only practice** (button after an attempt) is saved as "practice".

Saved attempt fields: `at, right, wrong, skipped, unscored, pct, secs, from, to, count, total, full, subset, shuffleQ, shuffleA, instant, wrongIds`.

## Card: Tech Table (`public/cards/tech-table/`)
| Part | What it does |
|---|---|
| `COLUMNS` | The columns. Add a line to add a column (`key`, `label`, optional `value()` / `cell()`). |
| `rows()` | Records after search and sort. |
| `render()` | Draws column letters (A, B, C…), row numbers, header row and records. |
| `sortBy(key)` | Click a header: sort; click again: reverse. |
| `selectCell(td)` | Shows the cell address and value in the formula bar. |
| `showInfo(card)` | The ⓘ dialog: description, how to use, files, "Open card". |
| `exportCsv()` | Downloads `tech-table.csv` (cells are quoted; text starting with `= + - @` is neutralised so Excel can't run it as a formula). |

## Card: Converter (`public/cards/converter/`) – private
Everything runs in the browser. Files are read with the File API and never uploaded; the page's
security policy (`connect-src 'self'`) also blocks sending anything to another server.

| File | What it holds |
|---|---|
| `cv-core.js` | The frame. `CV.addTool({...})` registers a tool. Helpers: `CV.dropZone()` file picker with drag & drop and ▲▼ ordering · `CV.checkFiles()` type/size limits (200 MB per file, 600 MB total) · `CV.readZip()` opens .docx/.xlsx and refuses “zip bombs” (> 400 MB unpacked) · `CV.xml()` safe XML parsing · `CV.download()` · `CV.zip()` many files → one .zip · `CV.results()` result list with “Download all” · `CV.loadImage()` / `CV.imageTo()` picture → canvas → new format · `CV.loadPdfJs()` loads pdf.js only when needed · `CV.openPdf()` with scripts in PDFs switched off · `CV.closePdf()`. Screen: `buildNav()` tool list + search, `openTool(id)` (the URL `#tool-id` keeps your place). |
| `cv-layout.js` | `CV.blocksToPdf(blocks)` writes PDF pages with pdf-lib: headings, paragraphs with bold/italic/underline/colour/size, bullet & number lists, tables (header row, wrapping), pictures, code, page breaks, page numbers. `pdfText()` swaps characters the standard PDF fonts can't show (æøå work; → becomes ->, emoji become ?). |
| `cv-images.js` | **Image converter** (WEBP/PNG/JPG/GIF/BMP/AVIF/SVG/ICO → JPG/PNG/WEBP, quality, max size, background colour) · **Images → PDF** (page = picture, A4 or Letter, orientation, margin). |
| `cv-pdf.js` | **Merge** · **Split / extract** (`CV.parseRanges("1-3, 5, 8-")`) · **Rotate** · **PDF → images** (96/150/300 dpi) · **PDF → text** · **Text/Markdown → PDF** · **Markdown → HTML**. `mdBlocks()` turns Markdown into layout blocks; raw HTML in Markdown is shown as text, never run. |
| `cv-word.js` | `CV.readDocx(file)` reads `word/document.xml`, styles, numbering, links and pictures into blocks (`paragraph()`, `runsOf()`, `table()`); `CV.blocksToHtml()` self-contained HTML (text escaped, pictures embedded, strict CSP inside the file); `CV.blocksToText()`. Tool: **Word → PDF / HTML / Text**. |
| `cv-data.js` | `CV.parseCsv()` (quotes, line breaks in cells, auto separator) · `CV.toCsv()` (optional protection against Excel formula injection) · `CV.readXlsx()` (shared strings, booleans, dates) · `CV.writeXlsx()` (valid .xlsx built with JSZip). Tools: **Excel → CSV**, **CSV → Excel**, **CSV ⇄ JSON**. |
| `cv-units.js` | **Unit converter** (`UNITS` table: add `[name, factor]` to add a unit) and **Colour converter** (HEX/RGB/HSL). |
| `cv-app.js` | Checks the libraries loaded, then `CV.start()`. |
| `vendor/` | jszip 3.10.1, pdf-lib 1.17.1, marked 18.0.10, pdf.js 6.2.108 – copied from npm, with licences and SHA-256 checksums in `vendor/VERSIONS.md`. The classic scripts have `integrity="sha384-…"` in `index.html`: a changed file is refused by the browser. |

**Add a converter tool:** pick the right `cv-*.js` (or make a new one and add it to `index.html`
before `cv-app.js`) and call `CV.addTool({ id, group, icon, name, desc, render(panel) { … } })`.
In `render`, use `CV.dropZone`, `CV.options`, `CV.button`, `CV.status` and `CV.results` – copy
the pattern of an existing tool.

**Limits** – Word → PDF uses standard fonts (a clean copy of the content, not pixel-perfect);
old `.doc`, `.pptx`, HEIC photos and scanned-PDF text recognition (OCR) are not supported.

## Card: About Me (`public/cards/about-me/`)
* `about-content.js` – **your texts** (`name, title, intro, sections, timeline, links`). Edit this.
* `about-me.js` – `initials()` for the avatar, `render()` builds the page. Links are filtered through `HUB.safeUrl` and open with `rel="noopener noreferrer"`.

## Template (`public/cards/_template/`)
A minimal working card (`index.html`, `card.js`, `card.css`) with the security rules in its comments. Copy it for every new card – see README "Add a new card".
