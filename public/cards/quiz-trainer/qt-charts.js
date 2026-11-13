/*
 * ============================================================================
 *  qt-charts.js – the progress chart and the "improving / getting worse" label.
 * ============================================================================
 *  The chart is plain SVG built as text: no chart library, works offline.
 *
 *  Functions
 *    QT.lineChart(series, opts)   SVG text of a line chart.
 *        series = [{ name, color, points: [{ v: 0–100, label: 'tooltip text' }] }]
 *        opts   = { h: height, pass: pass-mark line in % }
 *    QT.trendOf(attempts)         compares recent full-quiz scores with earlier ones
 *                                 -> { cls: 'up'|'down'|'flat', text } or null
 * ============================================================================
 */
window.QT = window.QT || {};
(function (QT) {
  'use strict';
  const esc = HUB.esc;

  QT.COLORS = ['#5b5fe0', '#1f9d55', '#e07a1f', '#d1406e', '#0e9aa7', '#8b5cf6', '#b08900', '#4b5563'];

  QT.lineChart = (series, opts = {}) => {
    const W = 760, H = opts.h || 240, L = 40, R = 14, T = 12, B = 30;    // size and margins
    const maxN = Math.max(2, ...series.map(s => s.points.length));
    const x = i => L + (W - L - R) * (i / (maxN - 1));
    const y = v => T + (H - T - B) * (1 - v / 100);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="inherit" font-size="11" role="img" aria-label="Score per attempt">`;
    [0, 25, 50, 75, 100].forEach(v => {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e7e8f0" ${v ? 'stroke-dasharray="3 4"' : ''}/>`;
      s += `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" fill="#8a8ea3">${v}%</text>`;
    });
    if (opts.pass) {
      s += `<line x1="${L}" x2="${W - R}" y1="${y(opts.pass)}" y2="${y(opts.pass)}" stroke="#1f9d55" stroke-opacity=".5" stroke-dasharray="6 4"/>`;
      s += `<text x="${W - R}" y="${y(opts.pass) - 5}" text-anchor="end" fill="#1f9d55">pass ${Number(opts.pass)}%</text>`;
    }
    const step = Math.ceil(maxN / 12);
    for (let i = 0; i < maxN; i += step) s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" fill="#8a8ea3">#${i + 1}</text>`;
    series.forEach(se => {
      if (!se.points.length) return;
      const color = /^#[0-9a-f]{3,8}$/i.test(se.color) ? se.color : '#5b5fe0';
      const d = se.points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
      if (se.points.length > 1) s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      se.points.forEach((p, i) => {
        s += `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"><title>${esc(se.name)} – #${i + 1}: ${Number(p.v)}%\n${esc(p.label || '')}</title></circle>`;
      });
    });
    if (!series.some(se => se.points.length)) s += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#8a8ea3" font-size="13">${esc(opts.empty || 'No attempts yet')}</text>`;
    return s + '</svg>';
  };

  QT.trendOf = attempts => {
    const v = attempts.filter(a => a.full).map(a => a.pct);
    if (v.length < 2) return null;
    const avg = list => list.reduce((p, c) => p + c, 0) / list.length;
    let diff;
    if (v.length >= 4) { const k = Math.min(3, Math.floor(v.length / 2)); diff = avg(v.slice(-k)) - avg(v.slice(-2 * k, -k)); }
    else diff = v[v.length - 1] - v[0];
    diff = Math.round(diff);
    if (diff >= 3) return { cls: 'up', text: `▲ Improving +${diff} pts` };
    if (diff <= -3) return { cls: 'down', text: `▼ Getting worse ${diff} pts` };
    return { cls: 'flat', text: '■ Steady' };
  };
})(window.QT);
