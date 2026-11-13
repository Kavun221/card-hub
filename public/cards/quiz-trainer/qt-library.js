/*
 * ============================================================================
 *  qt-library.js – the two "menu" screens of Quiz Trainer.
 * ============================================================================
 *  QT.renderHome()        list of your quizzes + overall progress (all quizzes)
 *  QT.renderQuiz(id)      one quiz: choose the question range and options, Start,
 *                         and see your results for that quiz
 *
 *  Full attempt vs part attempt
 *    Full  = you took ALL questions of the quiz (range 1 → total). Only these are
 *            drawn in the progress charts and used for "last / best score" and the trend,
 *            so the overall numbers always compare like with like.
 *    Part  = a range such as 1–60 or 10–20. Saved in the history table and counted in
 *            "questions done" / right / wrong; can be shown with the "All attempts" chart.
 *
 *  Helper functions
 *    statTiles(list)        a row of number tiles  [[value, label, colour], …]
 *    rangeText(a, total)    "Full quiz (260)" / "Q1–60 (60)" / "Wrong-only practice (8)"
 *    buildRangePicker(…)    the From / To boxes with presets (All, 1–10, Next block…)
 * ============================================================================
 */
window.QT = window.QT || {};
(function (QT) {
  'use strict';
  const { el, esc, pct, fmtDate } = HUB;
  const $ = s => document.querySelector(s);

  function statTiles(list) {
    const box = el('div', 'stats');
    list.forEach(([value, label, cls]) => {
      const t = el('div', 'stat ' + (cls || ''));
      t.append(el('div', 'v', value), el('div', 'k', label));
      box.append(t);
    });
    return box;
  }

  QT.rangeText = (a, total) => {
    if (a.subset) return `Wrong-only practice (${a.count})`;
    if (a.full) return `Full quiz (${a.count})`;
    if (a.from) return `Q${a.from}–${a.to} (${a.count})`;
    return `${a.count} questions`;
  };
  QT.rangeTag = a => {
    const t = el('span', 'tag ' + (a.subset ? 'prac' : a.full ? 'full' : 'part'), a.subset ? 'practice' : a.full ? 'full' : 'part');
    return t;
  };

  /* ------------------------------- home screen ------------------------------ */
  QT.renderHome = async () => {
    QT.setTop('Quiz Trainer', false);
    const v = $('#view'); v.textContent = '';
    const idx = await QT.getIndex();
    const atts = {};
    for (const q of idx) atts[q.id] = await QT.getAttempts(q.id);

    const imp = el('div', 'panel');
    imp.innerHTML = '<h2>Add a quiz</h2><div class="drop" tabindex="0" role="button"><b>Click to choose a quiz file</b> or drop it here<br><span class="small">Use “⬇ Export quiz (JSON)” in Quiz Collector. Importing the same quiz again updates it and keeps your history.</span></div>';
    const drop = imp.querySelector('.drop');
    drop.onclick = () => $('#file').click();
    drop.onkeydown = e => { if (e.key === 'Enter') $('#file').click(); };
    v.append(imp);

    if (idx.length) {
      const all = Object.values(atts).flat();
      const full = all.filter(a => a.full);
      const fullR = full.reduce((s, a) => s + a.right, 0), fullW = full.reduce((s, a) => s + a.wrong, 0);
      const tot = el('div', 'panel');
      tot.append(el('h2', '', 'Overall progress'));
      tot.append(statTiles([
        [full.length, 'full-quiz attempts'],
        [all.filter(a => !a.full).length, 'part / practice attempts'],
        [all.reduce((s, a) => s + a.count, 0), 'questions done in total'],
        [full.length ? pct(fullR, fullR + fullW) + '%' : '–', 'right in full quizzes', 'g']
      ]));
      const ch = el('div', 'chart');
      ch.innerHTML = QT.lineChart(idx.map((q, i) => ({
        name: q.title, color: QT.COLORS[i % QT.COLORS.length],
        points: atts[q.id].filter(a => a.full).map(a => ({ v: a.pct, label: fmtDate(a.at) }))
      })), { empty: 'No full-quiz attempts yet' });
      const lg = el('div', 'legend');
      idx.forEach((q, i) => { const s = el('span'); s.innerHTML = `<i class="dot" style="background:${QT.COLORS[i % QT.COLORS.length]}"></i>${esc(q.title)}`; lg.append(s); });
      tot.append(ch, lg, el('div', 'small muted', 'Score of each FULL-quiz attempt (x = attempt number). Part ranges and wrong-only practice are in each quiz’s history.'));
      v.append(tot);

      const lib = el('div', 'panel');
      lib.append(el('h2', '', 'My quizzes'));
      const list = el('div', 'quizzes');
      idx.forEach((q, i) => {
        const a = atts[q.id], f = a.filter(x => x.full), last = f[f.length - 1];
        const best = f.length ? Math.max(...f.map(x => x.pct)) : null;
        const r = el('div', 'qrow'); r.tabIndex = 0; r.setAttribute('role', 'link');
        const left = el('div');
        left.innerHTML = `<div class="t"><span style="color:${QT.COLORS[i % QT.COLORS.length]}">●</span> ${esc(q.title)}</div>
          <div class="m">${Number(q.count)} questions · ${f.length} full · ${a.length - f.length} part${last ? ` · last full ${last.pct}% · best ${best}%` : ''} · ${a.reduce((s, x) => s + x.count, 0)} questions done</div>`;
        const right = el('div');
        const t = QT.trendOf(a); if (t) right.append(el('span', 'trend ' + t.cls, t.text));
        r.append(left, right);
        const open = () => { location.hash = '#quiz/' + encodeURIComponent(q.id); };
        r.onclick = open; r.onkeydown = e => { if (e.key === 'Enter') open(); };
        list.append(r);
      });
      lib.append(list);
      v.append(lib);
    }
    const foot = el('div', 'row');
    const b1 = el('button', 'btn', '⬇ Backup all (quizzes + history)'); b1.onclick = QT.backupAll;
    const b2 = el('button', 'btn', 'Load backup'); b2.onclick = () => $('#file').click();
    foot.append(b1, b2, el('span', 'small muted', 'Your quizzes and results are saved in this browser.'));
    v.append(foot);
  };

  /* --------------------------- range picker (From/To) ------------------------ */
  function buildRangePicker(ordered, set) {
    const N = ordered.length;
    const box = el('div', 'range');
    box.append(el('div', '', 'Which questions?'));
    const row = el('div', 'row');
    const from = el('input'); from.type = 'number'; from.min = 1; from.max = N; from.value = set.from; from.setAttribute('aria-label', 'From question');
    const to = el('input'); to.type = 'number'; to.min = 1; to.max = N; to.value = set.to; to.setAttribute('aria-label', 'To question');
    row.append(el('span', '', 'From question'), from, el('span', '', 'to'), to, el('span', 'small muted', `of ${N}`));
    const presets = el('div', 'row');
    const info = el('div', 'info');
    box.append(row, presets, info);

    // keep the numbers valid: 1 ≤ from ≤ to ≤ N
    const fix = changed => {
      let f = HUB.clamp(Math.round(Number(from.value)) || 1, 1, N);
      let t = HUB.clamp(Math.round(Number(to.value)) || N, 1, N);
      if (f > t) { if (changed === 'from') t = f; else f = t; }
      from.value = f; to.value = t;
      set.from = f; set.to = t;
      const n = t - f + 1, first = ordered[f - 1], last = ordered[t - 1];
      const nums = first && last && (Number(first.num) !== f || Number(last.num) !== t) ? ` (question #${HUB.esc(first.num)} to #${HUB.esc(last.num)})` : '';
      info.innerHTML = n === N
        ? `<b>${n} questions – the full quiz.</b> Counts in your overall progress chart.`
        : `<b>${n} question${n === 1 ? '' : 's'}</b>${nums}. A part attempt: saved in your history, not in the full-quiz chart.`;
    };
    const setRange = (f, t) => { from.value = f; to.value = t; fix('to'); };
    const add = (label, fn) => { const b = el('button', 'preset', label); b.type = 'button'; b.onclick = fn; presets.append(b); };
    add(`All (1–${N})`, () => setRange(1, N));
    [10, 25, 60].filter(k => k < N).forEach(k => add(`1–${k}`, () => setRange(1, k)));
    add('Next block ▶', () => {                // e.g. 1–10 -> 11–20
      const len = set.to - set.from + 1;
      const f = set.to + 1 > N ? 1 : set.to + 1;
      setRange(f, Math.min(N, f + len - 1));
    });
    from.addEventListener('change', () => fix('from'));
    to.addEventListener('change', () => fix('to'));
    fix('to');
    return box;
  }

  /* -------------------------------- quiz screen ------------------------------ */
  QT.renderQuiz = async id => {
    const quiz = await QT.getQuiz(id);
    if (!quiz) { location.hash = ''; return; }
    QT.setTop(quiz.title, true);
    const ordered = QT.ordered(quiz);
    const N = ordered.length;
    const atts = await QT.getAttempts(id);
    const full = atts.filter(a => a.full);
    const set = await QT.getSettings(id, N);
    const v = $('#view'); v.textContent = '';
    const nScored = quiz.questions.filter(QT.scored).length;
    const nUnchecked = quiz.questions.filter(q => QT.scored(q) && !q.answerChecked).length;

    // ---- start panel ----
    const p = el('div', 'panel');
    p.append(el('h2', '', 'Start a new attempt'));
    if (quiz.subtitle) p.append(el('p', 'muted small', quiz.subtitle));
    p.append(el('p', 'small muted', `${N} questions · ${nScored} with a stored answer (only these are scored)`));
    if (nUnchecked) p.append(el('div', 'warnline', `${nUnchecked} answer${nUnchecked === 1 ? ' was' : 's were'} captured automatically and not checked in Quiz Collector – if one looks wrong, fix it there and import the quiz again.`));
    const s = el('div', 'settings');
    s.append(buildRangePicker(ordered, set));
    const opt = (key, text) => {
      const l = el('label'); const c = el('input'); c.type = 'checkbox'; c.checked = !!set[key];
      c.onchange = () => { set[key] = c.checked; };
      l.append(c, document.createTextNode(' ' + text)); s.append(l);
    };
    opt('shuffleQ', 'Random question order (within the chosen range). Off = always in order, lowest number first');
    opt('shuffleA', 'Random answer order (A, B, C… are shuffled – explanations that mention letters may not match)');
    opt('instant', 'Show the answer after each question (like the quiz site). Off = exam mode, answers at the end');
    const pl = el('label'); const pi = el('input'); pi.type = 'number'; pi.min = 0; pi.max = 100; pi.value = set.pass;
    pi.onchange = () => { set.pass = HUB.clamp(Number(pi.value) || 0, 0, 100); pi.value = set.pass; };
    pl.append(document.createTextNode('Pass mark '), pi, document.createTextNode(' %')); s.append(pl);
    p.append(s);
    const go = el('button', 'btn primary', '▶ Start quiz');
    go.onclick = async () => { await QT.saveSettings(id, set); QT.startSession(quiz, Object.assign({}, set), null); };
    p.append(go);
    v.append(p);

    // ---- results panel ----
    const st = el('div', 'panel');
    st.append(el('h2', '', 'My results'));
    const R = atts.reduce((a, x) => a + x.right, 0), Wr = atts.reduce((a, x) => a + x.wrong, 0);
    st.append(statTiles([
      [full.length, 'full-quiz attempts'],
      [atts.length - full.length, 'part / practice attempts'],
      [atts.reduce((a, x) => a + x.count, 0), 'questions done'],
      [R, 'right in total', 'g'],
      [Wr, 'wrong in total', 'r'],
      [full.length ? full[full.length - 1].pct + '%' : '–', 'last full score'],
      [full.length ? Math.max(...full.map(a => a.pct)) + '%' : '–', 'best full score']
    ]));
    const t = QT.trendOf(atts);
    if (t) { const tr = el('p'); tr.append(el('span', 'trend ' + t.cls, t.text), el('span', 'small muted', '  full-quiz scores compared with your earlier ones')); st.append(tr); }

    // chart: full quiz only (default) or all attempts
    const seg = el('div', 'seg');
    const bFull = el('button', 'on', 'Full quiz'), bAll = el('button', '', 'All attempts');
    seg.append(bFull, bAll);
    const ch = el('div', 'chart');
    const draw = mode => {
      bFull.classList.toggle('on', mode === 'full'); bAll.classList.toggle('on', mode === 'all');
      const list = mode === 'full' ? full : atts;
      ch.innerHTML = QT.lineChart([{ name: quiz.title, color: QT.COLORS[0],
        points: list.map(a => ({ v: a.pct, label: `${fmtDate(a.at)} · ${QT.rangeText(a, N)} · ${a.right}/${a.right + a.wrong}` })) }],
      { pass: set.pass, empty: mode === 'full' ? 'No full-quiz attempts yet – choose “All” in the range to do one' : 'No attempts yet' });
    };
    bFull.onclick = () => draw('full'); bAll.onclick = () => draw('all');
    st.append(seg, ch); draw('full');

    if (atts.length) {
      const tb = el('table', 'hist');
      tb.innerHTML = '<tr><th>Date</th><th>Questions</th><th>Score</th><th>Right</th><th>Wrong</th><th>Time</th><th>Settings</th></tr>';
      atts.slice().reverse().forEach(a => {
        const tr = el('tr');
        const td = (txt, cls) => { const c = el('td', cls || '', txt); tr.append(c); return c; };
        td(fmtDate(a.at));
        const q = td(''); q.append(QT.rangeTag(a), document.createTextNode(' ' + QT.rangeText(a, N)));
        const sc = td(''); sc.append(el('b', '', a.pct + '%'));
        td(String(a.right), 'right'); td(String(a.wrong), 'wrong');
        td(QT.fmtDur(a.secs || 0));
        td([a.shuffleQ ? 'random Qs' : 'in order', a.shuffleA ? 'random answers' : '', a.instant === false ? 'exam' : ''].filter(Boolean).join(', '), 'small muted');
        tb.append(tr);
      });
      st.append(tb);
    }
    v.append(st);

    const d = el('div', 'row');
    const clr = el('button', 'btn', 'Reset history');
    clr.onclick = async () => { if (confirm('Delete all attempts for this quiz?')) { await QT.db.del('att:' + id); QT.route(); } };
    const del = el('button', 'btn danger', 'Delete quiz');
    del.onclick = async () => {
      if (!confirm(`Delete “${quiz.title}” and its history?`)) return;
      await QT.db.del('quiz:' + id); await QT.db.del('att:' + id); await QT.db.del('set:' + id);
      await QT.db.set('index', (await QT.getIndex()).filter(x => x.id !== id));
      location.hash = '';
    };
    d.append(clr, del);
    v.append(d);
  };
})(window.QT);
