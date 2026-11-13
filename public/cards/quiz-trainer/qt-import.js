/*
 * ============================================================================
 *  qt-import.js – getting quizzes in and out of the trainer.
 * ============================================================================
 *  Functions
 *    QT.normalizeQuiz(raw, fileName)  check a quiz file and bring it into one clean shape
 *    QT.importFiles(files)            read chosen/dropped .json files (quizzes or a backup)
 *    QT.backupAll()                   download every quiz + all results as one file
 *    QT.restoreBackup(backup)         load such a backup file (results are merged, not doubled)
 *    QT.setupDrop()                   lets you drop files anywhere on the page
 *
 *  Safety: a quiz file is DATA. Its texts are only ever shown with textContent or
 *  HUB.esc(), so HTML/script inside a quiz file can't run. Image sources are only
 *  accepted if they are data: images or http(s) addresses.
 * ============================================================================
 */
window.QT = window.QT || {};
(function (QT) {
  'use strict';
  const LET = 'ABCDEFGH';
  const MAX_FILE_MB = 60;
  const arrows = /^[\s→⇒➜➔➝⟶>»:=\-–—]+/;
  const safeImg = src => /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src) || /^https?:\/\//i.test(src);

  QT.normalizeQuiz = (raw, fileName) => {
    if (!raw || !Array.isArray(raw.questions)) throw new Error('not a quiz file');
    const questions = raw.questions.map((q, i) => {
      const type = ['mc', 'match', 'text'].includes(q.type) ? q.type : 'mc';
      const o = {
        id: String(q.id || 'q' + i),
        num: Number.isFinite(Number(q.num)) && q.num !== '' ? Number(q.num) : i + 1,
        type,
        category: String(q.category || ''),
        hint: String(q.hint || ''),
        question: String(q.question || q.q || ''),
        explanation: String(q.explanation || ''),
        images: (Array.isArray(q.images) ? q.images : []).filter(im => im && safeImg(String(im.src || ''))),
        answerChecked: q.answerChecked !== false
      };
      if (type === 'match') {
        o.terms = (q.terms || []).map(String);
        o.pairs = (q.pairs || []).map(p => ({ text: String(p.text || ''), answer: String(p.answer || '').replace(arrows, '').trim() }));
      } else {
        o.options = (q.options || []).map((p, k) => typeof p === 'string' ? { key: LET[k], text: p } : { key: String(p.key || LET[k]), text: String(p.text || '') });
        o.answer = (q.answer || []).map(String);
      }
      return o;
    });
    const title = String(raw.title || (fileName || 'Quiz').replace(/\.json$/i, ''));
    return {
      id: String(raw.id || 'qz-' + title.toLowerCase().replace(/\W+/g, '-') + '-' + questions.length),
      title,
      subtitle: String(raw.subtitle || ''),
      questions
    };
  };

  QT.importFiles = async files => {
    let added = 0;
    for (const f of files) {
      try {
        if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`bigger than ${MAX_FILE_MB} MB`);
        const raw = JSON.parse(await f.text());
        if (raw.format === 'quiz-trainer-backup') { await QT.restoreBackup(raw); added++; continue; }
        const quiz = QT.normalizeQuiz(raw, f.name);
        const idx = await QT.getIndex();
        const old = idx.find(x => x.id === quiz.id);
        const entry = { id: quiz.id, title: quiz.title, subtitle: quiz.subtitle, count: quiz.questions.length, added: old ? old.added : Date.now(), updated: Date.now() };
        await QT.db.set('quiz:' + quiz.id, quiz);
        await QT.db.set('index', old ? idx.map(x => (x.id === quiz.id ? entry : x)) : [...idx, entry]);
        HUB.toast(old ? `Updated “${quiz.title}” – your history is kept` : `Added “${quiz.title}” (${quiz.questions.length} questions)`);
        added++;
      } catch (e) {
        HUB.toast(`${f.name}: not a quiz file (${e.message})`);
      }
    }
    if (added) QT.route();
  };

  QT.backupAll = async () => {
    const idx = await QT.getIndex();
    const out = { format: 'quiz-trainer-backup', version: 2, saved: new Date().toISOString(), index: idx, quizzes: {}, attempts: {} };
    for (const q of idx) { out.quizzes[q.id] = await QT.getQuiz(q.id); out.attempts[q.id] = (await QT.db.get('att:' + q.id)) || []; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
    a.download = 'quiz-trainer-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  QT.restoreBackup = async b => {
    const idx = await QT.getIndex();
    for (const q of b.index || []) {
      if (!b.quizzes || !b.quizzes[q.id]) continue;
      await QT.db.set('quiz:' + q.id, QT.normalizeQuiz(b.quizzes[q.id]));
      const mine = (await QT.db.get('att:' + q.id)) || [];
      const seen = new Set(mine.map(a => a.at));
      const merged = [...mine, ...((b.attempts || {})[q.id] || []).filter(a => !seen.has(a.at))].sort((x, y) => x.at - y.at);
      await QT.db.set('att:' + q.id, merged);
      const i = idx.findIndex(x => x.id === q.id);
      if (i >= 0) idx[i] = q; else idx.push(q);
    }
    await QT.db.set('index', idx);
    HUB.toast('Backup loaded');
  };

  QT.setupDrop = () => {
    const drop = () => document.querySelector('.drop');
    document.addEventListener('dragover', e => { e.preventDefault(); const d = drop(); if (d) d.classList.add('over'); });
    document.addEventListener('dragleave', e => { if (!e.relatedTarget) { const d = drop(); if (d) d.classList.remove('over'); } });
    document.addEventListener('drop', e => {
      e.preventDefault();
      const d = drop(); if (d) d.classList.remove('over');
      if (e.dataTransfer.files.length) QT.importFiles([...e.dataTransfer.files]);
    });
    const input = document.getElementById('file');
    input.addEventListener('change', () => { QT.importFiles([...input.files]); input.value = ''; });
  };
})(window.QT);
