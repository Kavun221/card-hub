/*
 * ============================================================================
 *  cards-registry.js – THE list of cards. One entry = one card.
 * ============================================================================
 *  The card-select screen (main page) and the Tech Table both read this list,
 *  so a new card only has to be added here once.
 *
 *  Fields of a card
 *    id          short unique name, also the folder name in /public/cards/<id>/
 *    name        title shown on the card
 *    icon        an emoji (or short text) shown as the card's picture
 *    tagline     one short line under the name
 *    description longer text shown in the Tech Table's info box
 *    howTo       list of short tips shown in the info box
 *    status      'ready' (opens) or 'soon' (locked, shows "coming soon")
 *    path        page that opens, relative to /public (only for 'ready')
 *    category    used for grouping/sorting in the Tech Table
 *    version     your own version number for the card
 *    added       date the card was added (YYYY-MM-DD)
 *    accent      the card's colour
 *    files       the card's files (shown in the info box, helps you find the code)
 *    private     true = needs your password (server/auth.js). On GitHub Pages and other
 *                static hosts a private card is shown locked ("only on my PC").
 *
 *  ADD A NEW CARD: copy a block, give it a new id, create /public/cards/<id>/
 *  with an index.html (copy cards/_template). See README.md, "Add a new card".
 * ============================================================================
 */
window.HUB_CARDS = [
  {
    id: 'quiz-trainer',
    name: 'Quiz Trainer',
    icon: '🧠',
    tagline: 'Practice the quizzes you collected',
    description: 'Import quiz files exported from Quiz Collector and practise them like on the quiz site. Choose which questions (for example 1–60), shuffle questions and answers, and follow your progress over time.',
    howTo: [
      'Export a quiz from Quiz Collector with “⬇ Export quiz (JSON)”.',
      'Open Quiz Trainer and drop the file on “Add a quiz”.',
      'Pick a question range, choose shuffle options and press Start.',
      'Full-quiz attempts are drawn in the progress chart; part attempts are kept in the history.'
    ],
    status: 'ready',
    path: 'cards/quiz-trainer/index.html',
    category: 'Learning',
    version: '2.0',
    added: '2026-11-13',
    accent: '#6d6ff5',
    files: ['cards/quiz-trainer/index.html', 'qt-storage.js', 'qt-charts.js', 'qt-import.js', 'qt-library.js', 'qt-play.js', 'qt-app.js', 'quiz-trainer.css']
  },
  {
    id: 'tech-table',
    name: 'Tech Table',
    icon: '📊',
    tagline: 'Every card in one table',
    description: 'A spreadsheet-style overview of all cards: open any card from its link, sort by any column, search, and press ⓘ to read what a card does.',
    howTo: [
      'Click a column header to sort, click again to reverse.',
      'Type in the search box to filter rows.',
      'Click a cell to see its full content in the formula bar.',
      '“Export CSV” downloads the table for Excel.'
    ],
    status: 'ready',
    path: 'cards/tech-table/index.html',
    category: 'Tools',
    version: '1.0',
    added: '2026-11-13',
    accent: '#22a06b',
    files: ['cards/tech-table/index.html', 'tech-table.js', 'tech-table.css']
  },
  {
    id: 'about-me',
    name: 'About Me',
    icon: '👤',
    tagline: 'Who is behind the hub',
    description: 'A profile page. The text comes from cards/about-me/about-content.js – edit that file to add sections, skills and links.',
    howTo: [
      'Open public/cards/about-me/about-content.js in a text editor.',
      'Change the texts, add sections or links, save and reload the page.'
    ],
    status: 'ready',
    path: 'cards/about-me/index.html',
    category: 'Info',
    version: '1.0',
    added: '2026-11-13',
    accent: '#e0832e',
    files: ['cards/about-me/index.html', 'about-content.js', 'about-me.js', 'about-me.css']
  },
  {
    id: 'converter',
    name: 'Converter',
    icon: '🔁',
    tagline: 'Word → PDF, WEBP → JPG and more',
    description: 'Convert files in the browser – nothing is uploaded: images (WEBP/PNG/JPG/GIF/BMP/AVIF/SVG → JPG/PNG/WEBP, images → PDF), PDF (merge, split, rotate, to images, to text), Word (.docx → PDF/HTML/text), text/Markdown → PDF/HTML, Excel/CSV/JSON, plus unit and colour converters. Private: needs your password and the server on your PC.',
    howTo: [
      'Set your password once: in the card-hub folder run  node server/set-password.js',
      'Start the server (start-windows.bat) and open the Converter card – log in with your password.',
      'Pick a tool on the left, drop your files, press Convert, download the result.',
      '🔒 Lock (top right) logs you out. On GitHub Pages this card is locked and not published.'
    ],
    status: 'ready',
    private: true,
    path: 'cards/converter/index.html',
    category: 'Tools',
    version: '1.0',
    added: '2026-11-13',
    accent: '#0e9aa7',
    files: ['cards/converter/index.html', 'cv-core.js', 'cv-layout.js', 'cv-images.js', 'cv-pdf.js', 'cv-word.js', 'cv-data.js', 'cv-units.js', 'cv-app.js', 'converter.css', 'vendor/ (libraries + licences)', 'server/auth.js', 'server/set-password.js']
  },
  // ---- locked slots: replace one with a real card when you build it ----
  { id: 'slot-5', name: 'Coming soon', icon: '🔒', tagline: 'Will come soon', description: 'A future card.', howTo: [], status: 'soon', path: '', category: 'Future', version: '–', added: '', accent: '#59607a', files: [] },
  { id: 'slot-6', name: 'Coming soon', icon: '🔒', tagline: 'Will come soon', description: 'A future card.', howTo: [], status: 'soon', path: '', category: 'Future', version: '–', added: '', accent: '#59607a', files: [] },
  { id: 'slot-7', name: 'Coming soon', icon: '🔒', tagline: 'Will come soon', description: 'A future card.', howTo: [], status: 'soon', path: '', category: 'Future', version: '–', added: '', accent: '#59607a', files: [] }
];
