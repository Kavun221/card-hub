/*
 * ============================================================================
 *  qt-app.js – starts Quiz Trainer and decides which screen to show.
 *  Loaded LAST, after the other qt-*.js files.
 * ============================================================================
 *  Screens and their address (the part after # in the URL)
 *    (empty)          home: your quizzes          -> QT.renderHome()   (qt-library.js)
 *    #quiz/<id>       one quiz: settings + stats  -> QT.renderQuiz(id) (qt-library.js)
 *    while a quiz is running, the question card   -> QT.renderQuestion() (qt-play.js)
 *
 *  Helpers defined here (used by the other files)
 *    QT.route()        show the right screen
 *    QT.setTop(t, b)   page heading + whether "← All quizzes" is shown
 *    QT.ordered(quiz)  questions sorted by their number = the order "1 to N" refers to
 *    QT.scored(q)      does this question have a stored answer (can it be scored)?
 *    QT.paras(text)    turn text into <p> paragraphs (safe: textContent)
 *    QT.fmtDur(secs)   "4m 12s"
 * ============================================================================
 */
window.QT = window.QT || {};
(function (QT) {
  'use strict';
  const $ = s => document.querySelector(s);

  QT.session = null;

  QT.ordered = quiz => quiz.questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (Number(a.q.num) || 0) - (Number(b.q.num) || 0) || a.i - b.i)   // by number, stable
    .map(x => x.q);

  QT.scored = q => (q.type === 'match'
    ? (q.pairs || []).length > 0 && q.pairs.every(p => p.answer)
    : q.type !== 'text' && (q.answer || []).length > 0 && (q.options || []).length > 1);

  QT.paras = text => {
    const f = document.createDocumentFragment();
    String(text || '').split('\n').filter(l => l.trim()).forEach(l => f.append(HUB.el('p', '', l)));
    return f;
  };

  QT.fmtDur = s => (s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm' : Math.floor(s / 60) + 'm ' + (s % 60) + 's');

  QT.setTop = (title, showHome) => { $('#hTitle').textContent = title; $('#homeBtn').hidden = !showHome; };

  QT.route = async () => {
    const S = QT.session;
    if (S && !S.finished) return QT.renderQuestion();
    if (S && S.finished && !location.hash.startsWith('#quiz/')) QT.session = null;
    const m = location.hash.match(/^#quiz\/(.+)$/);
    if (m) return QT.renderQuiz(decodeURIComponent(m[1]));
    return QT.renderHome();
  };

  function boot() {
    HUB.cardShell('quiz-trainer');                 // top bar "◀ All cards"
    QT.setupDrop();
    $('#homeBtn').onclick = () => {
      const S = QT.session;
      if (S && !S.finished && !confirm('Leave this quiz? Your answers in this attempt are not saved.')) return;
      QT.session = null;
      if (location.hash) location.hash = ''; else QT.route();
    };
    window.addEventListener('hashchange', () => {
      const S = QT.session;
      if (S && !S.finished) return;               // don't jump away in the middle of an attempt
      QT.session = null;
      QT.route();
    });
    window.addEventListener('beforeunload', e => {
      const S = QT.session;
      if (S && !S.finished && Object.keys(S.ans).length) { e.preventDefault(); e.returnValue = ''; }
    });
    QT.route();
  }

  boot();
})(window.QT);
