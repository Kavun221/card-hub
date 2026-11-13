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
| `serveFile()` | Serves files from `public/` only. Refuses hidden files (`.git`, `.env`) and `../` path tricks. A folder serves its `index.html`. |

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

## Card: About Me (`public/cards/about-me/`)
* `about-content.js` – **your texts** (`name, title, intro, sections, timeline, links`). Edit this.
* `about-me.js` – `initials()` for the avatar, `render()` builds the page. Links are filtered through `HUB.safeUrl` and open with `rel="noopener noreferrer"`.

## Template (`public/cards/_template/`)
A minimal working card (`index.html`, `card.js`, `card.css`) with the security rules in its comments. Copy it for every new card – see README "Add a new card".
