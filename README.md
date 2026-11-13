# Card Hub

A personal website that works like a game menu:

1. **Welcome screen** – "Welcome Mr. Buell". Click anywhere or press Enter.
2. **Card select** – choose a card like choosing a character in a game (mouse, or arrow keys + Enter).
3. **Visitor counter** at the bottom of the card-select screen.

Every feature is a **card**. The current cards:

| Card | What it does | Folder |
|---|---|---|
| **Quiz Trainer** | Practise quizzes exported from Quiz Collector: pick a question range, shuffle, track progress | `public/cards/quiz-trainer/` |
| **Tech Table** | Spreadsheet of all cards with links and ⓘ info | `public/cards/tech-table/` |
| **About Me** | Your profile page (edit `about-content.js`) | `public/cards/about-me/` |
| **Converter** 🔒 | Private: Word → PDF, WEBP → JPG, PDF merge/split, Excel/CSV and more – all in the browser | `public/cards/converter/` |
| Coming soon ×3 | Locked slots for future cards | – |

More detail on every file and function: **[HOW-IT-WORKS.md](HOW-IT-WORKS.md)**. Security choices: **[SECURITY.md](SECURITY.md)**.

---

## Run it on your PC

### Option A – with the server (recommended)
The visitor counter is then shared by everybody who visits.

1. Install **Node.js LTS** from <https://nodejs.org> (one time).
2. Double-click **`start-windows.bat`**. The site opens at <http://127.0.0.1:8080/>.
3. To stop: close the black window.

(Or in a terminal: `node server/server.js`. Other port: `set PORT=9000` first on Windows.)

### Private cards (Converter): set your password once
The Converter is protected by a password that **only exists on your PC**:

1. In the `card-hub` folder: right-click → **Open in Terminal** →
   ```
   node server/set-password.js
   ```
   Type a password (at least 10 characters) twice. Only a *hash* of it is saved, in `data/auth.json`
   – never the password itself, never in the code, never on GitHub (`data/` is git-ignored).
2. Restart the server (close the window, double-click `start-windows.bat` again).
3. Open the Converter card → type your password → it stays unlocked for 8 hours or until you press **🔒 Lock**.

Change the password: run the same command again. Remove it: `node server/set-password.js --remove`.
5 wrong passwords lock the login for 15 minutes.

On **GitHub Pages** the Converter is shown as *“Private · only on my PC”* and its files are not
published (GitHub Pages can't check passwords). The code is in the repository – that's fine, it
contains no secrets.

### Option B – without a server
Double-click `public/index.html`. Everything works, but the visitor counter only counts
**this browser** (it says so under the number). The Converter opens without a password in this
mode (there is no server to ask), and its PDF-reading tools need the server.

> Your quizzes and results are saved in the browser, per address. The server address
> (`http://127.0.0.1:8080`) and the double-click address (`file://…`) are different "places",
> so use one of them consistently, or move data with **Backup all** → **Load backup**.
> Quizzes from the old single-file `quiz-trainer.html` can be moved the same way.

---

## Folder structure

```
card-hub/
├─ README.md, HOW-IT-WORKS.md, SECURITY.md   documentation
├─ start-windows.bat / start-mac-linux.sh     start the server
├─ package.json                               lets you run "npm start" (no packages needed)
├─ server/server.js                           small web server + visitor-counter API
├─ server/auth.js                             password login for private cards
├─ server/set-password.js                     create/change your password (hash saved in data/)
├─ data/                                      visits.json + auth.json – on your PC only, not in git
└─ public/                                    EVERYTHING the browser loads (this is "the website")
   ├─ index.html                              welcome screen + card select
   ├─ assets/
   │  ├─ site-config.js                       your name, site name, counter settings  ← edit
   │  ├─ cards-registry.js                    the list of cards                       ← edit
   │  ├─ common.js / common.css               shared helpers and styles
   │  ├─ visitor-counter.js                   the visitor counter
   │  ├─ main.js / main.css                   welcome + card select logic and look
   │  └─ favicon.svg
   └─ cards/
      ├─ _template/                           copy this to start a new card
      ├─ quiz-trainer/                        one folder per card, with its own scripts
      ├─ tech-table/
      ├─ about-me/
      └─ converter/                           private card; vendor/ holds the libraries + licences
```

---

## Add a new card (step by step)

1. **Copy** `public/cards/_template` to `public/cards/<your-id>` (for example `public/cards/flashcards`).
2. In the new folder's `card.js` change `HUB.cardShell('my-card-id')` to your id (`'flashcards'`).
3. **Register it**: in `public/assets/cards-registry.js` replace one `slot-…` entry (or add a new block):
   ```js
   {
     id: 'flashcards',
     name: 'Flashcards',
     icon: '🃏',
     tagline: 'Flip and learn',
     description: 'What the card does – shown in the Tech Table info box.',
     howTo: ['First tip', 'Second tip'],
     status: 'ready',
     path: 'cards/flashcards/index.html',
     category: 'Learning',
     version: '1.0',
     added: '2026-12-01',
     accent: '#0e9aa7',
     files: ['cards/flashcards/index.html', 'card.js', 'card.css']
   },
   ```
4. Reload the site. The card appears on the card-select screen **and** as a row in the Tech Table.
5. Write the card's code in its own folder. When a card grows, split it into several files
   (like Quiz Trainer: `qt-storage.js`, `qt-play.js`, …) and list them in the card's `index.html`.

Old cards stay as they are; refer to them by name (Quiz Trainer, Tech Table, About Me, Converter).

**Make a card private:** add `private: true` to its registry entry, add its folder to
`PROTECTED_PREFIXES` in `server/auth.js`, and add an `rm -rf public/cards/<id>` line to
`.github/workflows/pages.yml` so it isn't published.

---

## Change texts

| What | Where |
|---|---|
| Welcome name, site name | `public/assets/site-config.js` |
| Card names, descriptions, icons, colours, order | `public/assets/cards-registry.js` |
| About Me page | `public/cards/about-me/about-content.js` |
| Colours of the whole site | `public/assets/common.css` (`--hub-…` variables) |

---

## Later: GitHub and your own website

**GitHub (code storage)**
```
git init
git add .
git commit -m "Card Hub"
git remote add origin https://github.com/<you>/card-hub.git
git push -u origin main
```
`.gitignore` already keeps `data/`, quiz files, backups and any `.env` file out of the repository.
**Do not commit quiz files** you collected from other sites – that content belongs to those sites.
If the repository is public, keep it free of anything personal.

**Hosting**
- *Static hosting* (GitHub Pages, Netlify…): upload the `public/` folder. Everything works,
  except that the visitor counter falls back to "this browser only" (static hosts can't run `server.js`).
- *Your own server / VPS*: run `node server/server.js` behind a web server with HTTPS
  (for example Caddy or nginx as a reverse proxy). Keep `HOST=127.0.0.1` and let the proxy face the internet.
  See SECURITY.md for the checklist.
