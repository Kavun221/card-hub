/*
 * ============================================================================
 *  qt-storage.js – where Quiz Trainer keeps its data (in the browser).
 * ============================================================================
 *  Storage: IndexedDB (the browser's built-in database, can hold large quizzes
 *  with images). If IndexedDB is not available, localStorage is used instead.
 *  Data stays on the computer/browser where the site is opened.
 *
 *  Keys that are stored
 *    index          list of quizzes: [{ id, title, subtitle, count, added, updated }]
 *    quiz:<id>      the full quiz (questions, options, answers…)
 *    att:<id>       list of attempts (results) for that quiz
 *    set:<id>       the start settings you last used for that quiz (range, shuffle…)
 *
 *  Functions (all on the global object QT)
 *    QT.db.get(key) / QT.db.set(key, value) / QT.db.del(key)   low-level read/write/delete
 *    QT.getIndex()            the list of quizzes
 *    QT.getQuiz(id)           one quiz
 *    QT.getAttempts(id)       attempts of one quiz, upgraded to the current format
 *    QT.addAttempt(id, a)     save one attempt
 *    QT.getSettings(id, n)    start settings of a quiz (n = number of questions)
 *    QT.saveSettings(id, s)   remember start settings
 * ============================================================================
 */
window.QT = window.QT || {};
(function (QT) {
  'use strict';

  QT.db = (() => {
    let opening = null;
    let useLocal = typeof indexedDB === 'undefined';
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('quiz-trainer', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
    // run one request inside a transaction and wait until it is committed
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      });
    };
    const local = {
      get: k => { try { const v = localStorage.getItem('qt:' + k); return v ? JSON.parse(v) : undefined; } catch { return undefined; } },
      set: (k, v) => localStorage.setItem('qt:' + k, JSON.stringify(v)),
      del: k => localStorage.removeItem('qt:' + k)
    };
    return {
      async get(k) { if (!useLocal) try { return await run('readonly', s => s.get(k)); } catch { useLocal = true; } return local.get(k); },
      async set(k, v) { if (!useLocal) try { return await run('readwrite', s => s.put(v, k)); } catch { useLocal = true; } return local.set(k, v); },
      async del(k) { if (!useLocal) try { return await run('readwrite', s => s.delete(k)); } catch { useLocal = true; } return local.del(k); }
    };
  })();

  QT.getIndex = async () => (await QT.db.get('index')) || [];
  QT.getQuiz = id => QT.db.get('quiz:' + id);

  /**
   * Attempts saved by older versions had no range. They are upgraded here:
   *   full  = the whole quiz was taken (counts in the overall progress chart)
   *   count = number of questions in the attempt
   */
  QT.upgradeAttempt = a => {
    const u = Object.assign({}, a);
    if (u.full === undefined) u.full = !u.subset && !u.limit;
    if (u.count === undefined) u.count = (u.right || 0) + (u.wrong || 0) + (u.unscored || 0);
    return u;
  };
  QT.getAttempts = async id => ((await QT.db.get('att:' + id)) || []).map(QT.upgradeAttempt);
  QT.addAttempt = async (id, attempt) => {
    const list = (await QT.db.get('att:' + id)) || [];
    list.push(attempt);
    await QT.db.set('att:' + id, list);
  };

  /** Default start settings: the whole quiz, in order. */
  QT.getSettings = async (id, total) => {
    const s = Object.assign({ shuffleQ: false, shuffleA: false, instant: true, pass: 70, from: 1, to: total }, (await QT.db.get('set:' + id)) || {});
    s.from = HUB.clamp(Number(s.from) || 1, 1, total);
    s.to = HUB.clamp(Number(s.to) || total, s.from, total);
    return s;
  };
  QT.saveSettings = (id, s) => QT.db.set('set:' + id, s);
})(window.QT);
