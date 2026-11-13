/*
 * ============================================================================
 *  cv-layout.js – turns "blocks" (paragraphs, headings, lists, tables, images)
 *  into a real PDF file with pdf-lib. Used by Word → PDF and Text/Markdown → PDF.
 * ============================================================================
 *  Block types (what the Word and Markdown readers produce):
 *    { type: 'p', style: 'normal'|'h1'..'h6'|'title', align: 'left'|'center'|'right'|'justify',
 *      list: { level, marker: '•' or '3.' } (optional),
 *      runs: [{ text, b, i, u, size, code, color }] }
 *    { type: 'table', rows: [[ [runs…], [runs…] ], …] }
 *    { type: 'img', bytes: Uint8Array, mime: 'image/png'|'image/jpeg', w, h }   (w/h in px, optional)
 *    { type: 'code', text }        monospace block
 *    { type: 'hr' }                horizontal line
 *    { type: 'pagebreak' }
 *
 *  Main function
 *    CV.blocksToPdf(blocks, { title, pageSize: 'A4'|'Letter', margin }) -> Uint8Array (the PDF)
 *
 *  Inner workings
 *    pdfText(s)        the built-in PDF fonts only know "Western" characters (incl. æ ø å é ü …).
 *                      Others are replaced (→ becomes ->, emoji become ?) so the PDF never fails.
 *    layoutRuns()      splits runs into words, measures them and builds lines that fit the width
 *    drawLines()       draws the lines, with bold/italic/underline, alignment and page breaks
 *  Limits: uses the standard PDF fonts (Helvetica/Times look-alike), so the result is a clean
 *  copy of the content, not a pixel-perfect copy of the Word layout.
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';

  // Characters the standard PDF fonts (WinAnsi) can show besides ASCII and Latin-1
  const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const REPLACE = { '→': '->', '←': '<-', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=', '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', ' ': ' ', '‑': '-', '−': '-', '→': '->', '●': '•', '▪': '•', '◦': '◦' };
  const pdfText = s => {
    let out = '';
    for (const ch of String(s ?? '')) {
      const c = ch.codePointAt(0);
      if (ch === '\t') out += '    ';
      else if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_EXTRA.includes(ch)) out += ch;
      else if (REPLACE[ch] !== undefined) out += REPLACE[ch] === '◦' ? 'o' : REPLACE[ch];
      else if (c < 32) out += ' ';
      else out += '?';
    }
    return out;
  };
  CV.pdfText = pdfText;

  const SIZES = { title: 24, h1: 20, h2: 16, h3: 14, h4: 12.5, h5: 11.5, h6: 11, normal: 11 };

  CV.blocksToPdf = async (blocks, opts = {}) => {
    const { PDFDocument, StandardFonts, rgb, PageSizes } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(opts.title || 'Document');
    doc.setProducer('Card Hub Converter (pdf-lib)');
    doc.setCreator('Card Hub Converter');
    const fonts = {
      r: await doc.embedFont(StandardFonts.Helvetica),
      b: await doc.embedFont(StandardFonts.HelveticaBold),
      i: await doc.embedFont(StandardFonts.HelveticaOblique),
      bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
      code: await doc.embedFont(StandardFonts.Courier)
    };
    const fontOf = r => r.code ? fonts.code : r.b && r.i ? fonts.bi : r.b ? fonts.b : r.i ? fonts.i : fonts.r;
    const [PW, PH] = opts.pageSize === 'Letter' ? PageSizes.Letter : PageSizes.A4;
    const M = opts.margin || 56;
    const W = PW - 2 * M;
    let page, y;
    const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M; };
    const need = h => { if (y - h < M) newPage(); };
    newPage();

    const colorOf = hex => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return rgb(0.1, 0.1, 0.15);
      const n = parseInt(m[1], 16);
      return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    };

    /** Build lines from runs: [{ words: [{text, run, font, size, w}], width, height }] */
    function layoutRuns(runs, width, baseSize, forceBold) {
      const words = [];
      runs.forEach(r => {
        const size = r.size || baseSize;
        const run = forceBold ? Object.assign({}, r, { b: true }) : r;
        const font = fontOf(run);
        // keep explicit line breaks, split the rest into words + spaces
        String(r.text ?? '').split('\n').forEach((part, pi) => {
          if (pi > 0) words.push({ br: true, size });
          (pdfText(part).match(/\S+|\s+/g) || []).forEach(t => words.push({ text: t, run, font, size, w: font.widthOfTextAtSize(t, size), space: /^\s+$/.test(t) }));
        });
      });
      const lines = []; let cur = [], cw = 0, maxSize = baseSize;
      const push = () => {
        while (cur.length && cur[cur.length - 1].space) { cw -= cur.pop().w; }
        lines.push({ words: cur, width: cw, height: maxSize * 1.35 });
        cur = []; cw = 0; maxSize = baseSize;
      };
      for (const wd of words) {
        if (wd.br) { push(); continue; }
        if (wd.space && !cur.length) continue;
        if (cw + wd.w > width && cur.length) push();
        if (wd.space && !cur.length) continue;
        // a single word longer than the line: cut it into pieces
        if (wd.w > width) {
          let t = wd.text;
          while (t.length) {
            let n = t.length;
            while (n > 1 && wd.font.widthOfTextAtSize(t.slice(0, n), wd.size) > width - cw) n--;
            const piece = t.slice(0, n);
            cur.push(Object.assign({}, wd, { text: piece, w: wd.font.widthOfTextAtSize(piece, wd.size) }));
            cw += cur[cur.length - 1].w; maxSize = Math.max(maxSize, wd.size);
            t = t.slice(n);
            if (t.length) push();
          }
          continue;
        }
        cur.push(wd); cw += wd.w; maxSize = Math.max(maxSize, wd.size);
      }
      if (cur.length || !lines.length) push();
      return lines;
    }

    /** Draw lines at x; moves y down; breaks pages when needed (if allowBreak). */
    function drawLines(lines, x, width, align, target) {
      const tgt = target || { get page() { return page; } };
      for (let li = 0; li < lines.length; li++) {
        const ln = lines[li];
        if (!target) need(ln.height);
        const baseline = (target ? target.y : y) - ln.height * 0.78;
        let gap = 0, cx = x;
        if (align === 'center') cx = x + (width - ln.width) / 2;
        else if (align === 'right') cx = x + width - ln.width;
        else if (align === 'justify' && li < lines.length - 1) {
          const spaces = ln.words.filter(w => w.space).length;
          if (spaces) gap = (width - ln.width) / spaces;
        }
        ln.words.forEach(wd => {
          if (wd.space) { cx += wd.w + gap; return; }
          tgt.page.drawText(wd.text, { x: cx, y: baseline, size: wd.size, font: wd.font, color: colorOf(wd.run.color) });
          if (wd.run.u || wd.run.link) tgt.page.drawLine({ start: { x: cx, y: baseline - 1.5 }, end: { x: cx + wd.w, y: baseline - 1.5 }, thickness: 0.6, color: colorOf(wd.run.color) });
          cx += wd.w;
        });
        if (target) target.y -= ln.height; else y -= ln.height;
      }
    }

    async function embedImage(b) {
      try {
        if (b.mime === 'image/png') return await doc.embedPng(b.bytes);
        if (b.mime === 'image/jpeg') return await doc.embedJpg(b.bytes);
        // other types (gif, bmp, webp…): convert to PNG in the browser first
        const img = await CV.loadImage(new Blob([b.bytes], { type: b.mime }));
        const { blob } = await CV.imageTo(img, { type: 'image/png' });
        return await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
      } catch { return null; }
    }

    for (const b of blocks) {
      if (b.type === 'pagebreak') { if (y < PH - M - 1) newPage(); continue; }
      if (b.type === 'hr') { need(14); y -= 7; page.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.75) }); y -= 7; continue; }

      if (b.type === 'img') {
        const im = await embedImage(b);
        if (!im) { drawLines(layoutRuns([{ text: '[image could not be included]', i: true, color: '#888888' }], W, 10), M, W, 'left'); continue; }
        let w = b.w ? b.w * 0.75 : im.width * 0.75, h = b.h ? b.h * 0.75 : im.height * 0.75;   // px -> pt
        const k = Math.min(1, W / w, (PH - 2 * M) / h); w *= k; h *= k;
        need(h + 8);
        page.drawImage(im, { x: M + (b.align === 'center' ? (W - w) / 2 : 0), y: y - h, width: w, height: h });
        y -= h + 8;
        continue;
      }

      if (b.type === 'code') {
        const lines = layoutRuns([{ text: b.text, code: true }], W - 16, 9.5);
        lines.forEach(ln => {
          need(ln.height);
          page.drawRectangle({ x: M, y: y - ln.height, width: W, height: ln.height, color: rgb(0.95, 0.95, 0.97) });
          drawLines([ln], M + 8, W - 16, 'left');
        });
        y -= 8;
        continue;
      }

      if (b.type === 'table') {
        const cols = Math.max(1, ...b.rows.map(r => r.length));
        const cw = W / cols, pad = 4, size = 9.5;
        y -= 4;
        for (let ri = 0; ri < b.rows.length; ri++) {
          const row = b.rows[ri];
          const cells = Array.from({ length: cols }, (_, ci) => layoutRuns(row[ci] || [{ text: '' }], cw - 2 * pad, size, ri === 0 && b.header));
          let h = Math.max(...cells.map(ls => ls.reduce((s, l) => s + l.height, 0))) + 2 * pad;
          h = Math.min(h, PH - 2 * M);
          need(h);
          const top = y;
          cells.forEach((ls, ci) => {
            const x = M + ci * cw;
            if (ri === 0 && b.header) page.drawRectangle({ x, y: top - h, width: cw, height: h, color: rgb(0.93, 0.94, 0.97) });
            page.drawRectangle({ x, y: top - h, width: cw, height: h, borderColor: rgb(0.72, 0.73, 0.78), borderWidth: 0.6 });
            const t = { y: top - pad, page };
            let used = 0;
            drawLines(ls.filter(l => (used += l.height) <= h - 2 * pad), x + pad, cw - 2 * pad, 'left', t);
          });
          y = top - h;
        }
        y -= 8;
        continue;
      }

      // paragraph / heading / list item
      const style = b.style || 'normal';
      const size = SIZES[style] || SIZES.normal;
      const heading = style !== 'normal';
      const indent = b.list ? 16 + 16 * (b.list.level || 0) : (b.indent || 0);
      if (heading) need(size * 2.6);
      if (heading) y -= size * 0.5;
      const runs = (b.runs || []).filter(r => r.text !== undefined);
      if (!runs.length || runs.every(r => !String(r.text).trim())) { y -= size * 0.8; continue; }   // empty paragraph = small gap
      const lines = layoutRuns(runs, W - indent, size, heading);
      if (b.list) {
        need(lines[0].height);
        const mk = pdfText(b.list.marker || '•');
        page.drawText(mk, { x: M + indent - 12 - (mk.length > 1 ? fonts.r.widthOfTextAtSize(mk, size) - 6 : 0), y: y - lines[0].height * 0.78, size, font: fonts.r, color: rgb(0.1, 0.1, 0.15) });
      }
      drawLines(lines, M + indent, W - indent, b.align || 'left');
      y -= heading ? size * 0.35 : (b.list ? 2 : size * 0.55);
    }

    // page numbers
    const pages = doc.getPages();
    if (pages.length > 1) pages.forEach((p, i) => {
      const t = `${i + 1} / ${pages.length}`;
      p.drawText(t, { x: PW / 2 - fonts.r.widthOfTextAtSize(t, 8.5) / 2, y: M / 2, size: 8.5, font: fonts.r, color: rgb(0.55, 0.55, 0.6) });
    });
    return doc.save();
  };
})(window.CV);
