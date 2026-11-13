/*
 * ============================================================================
 *  qt-play.js – taking a quiz: the question card, answering, the score.
 * ============================================================================
 *  The running attempt is kept in QT.session:
 *    quiz      the quiz being taken
 *    set       the settings used (from, to, shuffleQ, shuffleA, instant, pass)
 *    qs        the questions of this attempt, in the order they are asked
 *    view      per question: the (maybe shuffled) order of options / terms
 *    ans       your answers: mc -> ['A','C']   matching -> { pairIndex: 'term' }
 *    shown     which questions have their answer revealed
 *    i         the question on screen (index in qs)
 *    finished  true after "Finish"
 *
 *  Functions
 *    QT.startSession(quiz, set, onlyIds)  build an attempt. Questions = the chosen range
 *                         (from–to, counted in question-number order); shuffled only if
 *                         shuffleQ is on. onlyIds = practise just these (wrong ones).
 *    QT.renderQuestion()  draw the current question card
 *    needCount(q)         how many options must be picked ("Choose two" -> 2)
 *    isRight(q, a)        true/false, or null when the question has no stored answer
 *    pick / go            choose an option / move to the previous or next question
 *    finish()             score the attempt and save it (QT.addAttempt)
 *    QT.renderResults()   the score screen
 * ============================================================================
 */
window.QT = window.QT || {};
(function (QT) {
  'use strict';
  const { el, esc, pct, shuffle } = HUB;
  const $ = s => document.querySelector(s);
  const LET = 'ABCDEFGH';
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

  QT.startSession = (quiz, set, onlyIds) => {
    const ordered = QT.ordered(quiz);
    const N = ordered.length;
    let qs = onlyIds ? ordered.filter(q => onlyIds.includes(q.id)) : ordered.slice(set.from - 1, set.to);
    if (set.shuffleQ) qs = shuffle(qs);
    const view = {};
    qs.forEach(q => {
      if (q.type === 'match') {
        const terms = q.terms.length ? q.terms : [...new Set(q.pairs.map(p => p.answer))];
        const order = q.pairs.map((p, i) => i);
        view[q.id] = { pairs: set.shuffleA ? shuffle(order) : order, terms: set.shuffleA ? shuffle(terms) : terms };
      } else {
        view[q.id] = { opts: set.shuffleA ? shuffle(q.options || []) : (q.options || []).slice() };
      }
    });
    QT.session = {
      quiz, set, qs, view, i: 0, ans: {}, shown: {}, start: Date.now(), finished: false,
      subset: !!onlyIds, total: N,
      full: !onlyIds && set.from === 1 && set.to === N
    };
    QT.renderQuestion();
  };

  const needCount = q => {
    const n = (q.answer || []).length;
    if (n) return n;
    const m = (q.hint || '').match(/\b(one|two|three|four|five|six|\d+)\b/i);
    return m ? (WORDS[m[1].toLowerCase()] || Number(m[1])) : 1;
  };
  const isRight = (q, a) => {
    if (!QT.scored(q)) return null;
    if (!a) return false;
    if (q.type === 'match') return q.pairs.every((p, i) => (a[i] || '') === p.answer);
    const want = new Set(q.answer);
    return a.length === want.size && a.every(k => want.has(k));
  };
  const answered = (q, a) => (q.type === 'match' ? !!a && Object.values(a).some(Boolean) : !!a && a.length > 0);
  const imgsOf = (q, where) => (q.images || []).filter(im => ((im.where === 'explanation' || im.where === 'e') ? 'e' : 'q') === where);
  const addImgs = (box, list) => list.forEach(im => { const d = el('div', 'img'); const i = el('img'); i.src = im.src; i.alt = ''; d.append(i); box.append(d); });

  QT.renderQuestion = () => {
    const S = QT.session, q = S.qs[S.i], a = S.ans[q.id], shown = !!S.shown[q.id] || S.finished;
    QT.setTop(S.quiz.title + (S.subset ? ' – practice' : S.full ? '' : ` – Q${S.set.from}–${S.set.to}`), true);
    const v = $('#view'); v.textContent = '';
    const pr = el('div', 'progress'); const bar = el('div'); bar.style.width = pct(S.i + 1, S.qs.length) + '%'; pr.append(bar); v.append(pr);

    const c = el('div', 'qcard');
    const h = el('div', 'qhead');
    h.append(el('span', 'n', 'Question ' + q.num));
    if (q.answerChecked && QT.scored(q)) h.append(el('span', 'ok', '✓'));
    if (q.category) h.append(el('span', 'slash', '/'), el('span', 'cat', q.category));
    h.append(el('span', 'of', `${S.i + 1} of ${S.qs.length}`));
    c.append(h);
    const qt = el('div', 'qtext'); qt.append(QT.paras(q.question)); c.append(qt);
    addImgs(c, imgsOf(q, 'q'));

    const multi = q.type === 'mc' && needCount(q) > 1;
    const hint = q.hint || (q.type === 'match' ? 'Drag & drop' : multi ? `Choose ${needCount(q)}` : '');
    if (hint) c.append(el('span', 'pill', hint));

    if (q.type === 'match') {
      const vw = S.view[q.id];
      const bank = el('div', 'bank'); vw.terms.forEach(t => bank.append(el('span', '', t))); c.append(bank);
      vw.pairs.forEach(pi => {
        const p = q.pairs[pi];
        const r = el('div', 'mrow');
        r.append(el('div', '', p.text));
        const sel = el('select');
        sel.append(new Option('— choose —', ''));
        vw.terms.forEach(t => sel.append(new Option(t, t)));
        sel.value = (a && a[pi]) || '';
        sel.disabled = shown;
        sel.onchange = () => { S.ans[q.id] = Object.assign({}, S.ans[q.id], { [pi]: sel.value }); drawDots(); };
        r.append(sel);
        if (shown && p.answer) {
          const ok = ((a && a[pi]) || '') === p.answer;
          r.classList.add(ok ? 'g' : 'r');
          if (!ok) r.append(el('div', 'fix', 'Correct: ' + p.answer));
        }
        c.append(r);
      });
    } else if (q.options && q.options.length) {
      const want = new Set(q.answer || []);
      S.view[q.id].opts.forEach((o, k) => {
        const b = el('button', 'opt'); b.type = 'button';
        b.append(el('span', 'L', LET[k]), el('span', '', o.text));
        const picked = (a || []).includes(o.key);
        if (shown && QT.scored(q)) {
          // the site's colour code: green = picked & right, yellow = right but not picked, red = picked & wrong
          b.classList.add(picked && want.has(o.key) ? 'g' : want.has(o.key) ? 'y' : picked ? 'r' : 'n');
          b.disabled = true;
        } else {
          if (picked) b.classList.add('sel');
          b.disabled = shown;
          b.onclick = () => pick(q, o.key, multi);
        }
        c.append(b);
      });
    } else {
      c.append(el('p', 'muted', 'No answer options stored for this question – read it, then show the explanation.'));
    }

    const acts = el('div', 'acts');
    if (S.set.instant || S.finished) {
      if (!S.finished) {
        const sb = el('button', 'show', shown ? '👁 Answer shown' : '👁 Show answer');
        sb.onclick = () => { S.shown[q.id] = true; QT.renderQuestion(); };
        sb.disabled = shown;
        acts.append(sb);
      }
      if (shown) {
        const r = isRight(q, a);
        acts.append(r === null ? el('span', 'verdict n', 'Not scored – no stored answer')
          : r ? el('span', 'verdict g', '✓ Correct') : el('span', 'verdict r', answered(q, a) ? '✗ Wrong' : '✗ Not answered'));
      }
    }
    acts.append(el('span', 'kbd', q.type === 'mc' ? '  Keys: A–H pick · Enter show/next · ← →' : '  Keys: Enter show/next · ← →'));
    c.append(acts);

    if (shown && (q.explanation || imgsOf(q, 'e').length)) {
      const ex = el('div', 'box'); ex.append(el('div', 'lab', 'Explanation'), QT.paras(q.explanation));
      addImgs(ex, imgsOf(q, 'e'));
      c.append(ex);
    }
    v.append(c);

    const nav = el('div', 'nav');
    const prev = el('button', 'btn', '← Previous'); prev.disabled = S.i === 0; prev.onclick = () => go(-1);
    const next = el('button', 'btn', 'Next →'); next.disabled = S.i === S.qs.length - 1; next.onclick = () => go(1);
    const fin = el('button', 'btn primary', S.finished ? 'Back to results' : 'Finish & see score');
    fin.onclick = () => (S.finished ? QT.renderResults() : finish());
    nav.append(prev, next, el('div', 'sp'), fin);
    v.append(nav);
    const dots = el('div', 'dots'); dots.id = 'dots'; v.append(dots); drawDots();
  };

  function drawDots() {
    const S = QT.session, d = $('#dots'); if (!d) return;
    d.textContent = '';
    S.qs.forEach((q, i) => {
      const b = el('button', '', String(i + 1)); b.type = 'button';
      if (i === S.i) b.classList.add('cur');
      if (S.shown[q.id] || S.finished) { const r = isRight(q, S.ans[q.id]); if (r !== null) b.classList.add(r ? 'g' : 'r'); }
      else if (answered(q, S.ans[q.id])) b.classList.add('a');
      b.title = 'Question ' + q.num;
      b.onclick = () => { S.i = i; QT.renderQuestion(); };
      d.append(b);
    });
  }

  function pick(q, key, multi) {
    const S = QT.session;
    let a = S.ans[q.id] || [];
    if (multi) a = a.includes(key) ? a.filter(k => k !== key) : [...a, key];
    else a = a[0] === key ? [] : [key];
    S.ans[q.id] = a;
    QT.renderQuestion();
  }
  function go(d) { const S = QT.session; S.i = HUB.clamp(S.i + d, 0, S.qs.length - 1); QT.renderQuestion(); window.scrollTo(0, 0); }

  document.addEventListener('keydown', e => {
    const S = QT.session;
    if (!S || !$('.qcard') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const q = S.qs[S.i];
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Enter') {
      if (e.target.tagName === 'BUTTON' && !e.target.classList.contains('opt')) return;   // let buttons work normally
      e.preventDefault();
      if ((S.set.instant || S.finished) && !S.shown[q.id] && !S.finished) { S.shown[q.id] = true; QT.renderQuestion(); }
      else if (S.i < S.qs.length - 1) go(1);
    } else if (q.type === 'mc' && !S.shown[q.id] && !S.finished && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = LET.indexOf(e.key.toUpperCase());
      const o = S.view[q.id].opts[k];
      if (k >= 0 && o) pick(q, o.key, needCount(q) > 1);
    }
  });

  async function finish() {
    const S = QT.session;
    const scoredQs = S.qs.filter(QT.scored);
    const unanswered = scoredQs.filter(q => !answered(q, S.ans[q.id])).length;
    if (unanswered && !confirm(`${unanswered} question${unanswered === 1 ? ' is' : 's are'} not answered and will count as wrong. Finish anyway?`)) return;
    const right = scoredQs.filter(q => isRight(q, S.ans[q.id])).length;
    S.result = {
      at: Date.now(), right, wrong: scoredQs.length - right, skipped: unanswered, unscored: S.qs.length - scoredQs.length,
      pct: pct(right, scoredQs.length), secs: Math.round((Date.now() - S.start) / 1000),
      from: S.subset ? null : S.set.from, to: S.subset ? null : S.set.to, count: S.qs.length, total: S.total,
      full: S.full, subset: S.subset,
      shuffleQ: S.set.shuffleQ, shuffleA: S.set.shuffleA, instant: S.set.instant,
      wrongIds: scoredQs.filter(q => !isRight(q, S.ans[q.id])).map(q => q.id)
    };
    S.finished = true;
    await QT.addAttempt(S.quiz.id, S.result);
    QT.renderResults();
  }

  QT.renderResults = () => {
    const S = QT.session, r = S.result;
    QT.setTop(S.quiz.title, true);
    const v = $('#view'); v.textContent = '';
    const p = el('div', 'panel');
    const passed = r.pct >= (S.set.pass || 0);
    p.innerHTML = `<h2>${S.subset ? 'Practice round finished' : 'Attempt finished'}</h2>
      <div class="big ${passed ? 'pass' : 'fail'}">${r.pct}%</div>
      <p class="muted">${passed ? 'Passed' : 'Below the pass mark of ' + Number(S.set.pass) + '%'} · ${esc(QT.rangeText(r, S.total))} · time ${QT.fmtDur(r.secs)}</p>`;
    const st = el('div', 'stats');
    [[r.right, 'right', 'g'], [r.wrong, 'wrong', 'r'], [r.skipped, 'not answered (counted wrong)'], [r.unscored, 'not scored (no answer stored)']]
      .forEach(([val, k, cls]) => { const x = el('div', 'stat ' + (cls || '')); x.append(el('div', 'v', val), el('div', 'k', k)); st.append(x); });
    p.append(st);
    p.append(el('p', 'small muted', r.full ? 'Full-quiz attempt: added to your progress chart.' : 'Part attempt: saved in this quiz’s history (not in the full-quiz chart).'));
    const row = el('div', 'row');
    const rev = el('button', 'btn', '🔍 Review answers'); rev.onclick = () => { S.i = 0; QT.renderQuestion(); };
    const again = el('button', 'btn primary', '↻ New attempt');
    again.onclick = () => { QT.session = null; location.hash = '#quiz/' + encodeURIComponent(S.quiz.id); QT.route(); };
    row.append(rev);
    if (r.wrongIds.length) { const w = el('button', 'btn', `Practise the ${r.wrongIds.length} wrong`); w.onclick = () => QT.startSession(S.quiz, S.set, r.wrongIds); row.append(w); }
    row.append(again);
    p.append(row);
    v.append(p);
    if (r.wrongIds.length) {
      const wl = el('div', 'panel'); wl.append(el('h2', '', 'Wrong this time'));
      r.wrongIds.forEach(id => {
        const i = S.qs.findIndex(q => q.id === id), q = S.qs[i];
        const b = el('div', 'qrow'); b.tabIndex = 0;
        b.innerHTML = `<div><div class="t">Question ${esc(q.num)}${q.category ? ' · <span class="muted">' + esc(q.category) + '</span>' : ''}</div><div class="m">${esc(q.question.split('\n')[0].slice(0, 140))}</div></div><div></div>`;
        b.onclick = () => { S.i = i; QT.renderQuestion(); };
        wl.append(b);
      });
      v.append(wl);
    }
  };
})(window.QT);
