/*
 * ============================================================================
 *  cv-pdf.js – PDF and text tools
 * ============================================================================
 *  PDF group
 *    Merge PDFs            several PDFs → one (choose the order)           pdf-lib
 *    Split / extract pages "1-3, 5, 8-" → new PDF, or every page as its own PDF
 *    Rotate pages          90/180/270° for all or chosen pages
 *    PDF → images          every page as PNG or JPG                          pdf.js
 *    PDF → text            all text as a .txt file                           pdf.js
 *  Text group
 *    Text / Markdown → PDF  .txt or .md (headings, lists, bold, tables, code) marked + cv-layout
 *
 *  Safety: pdf.js runs with isEvalSupported:false and enableScripting:false (cv-core.js),
 *  so JavaScript hidden in a PDF is never run. Password-protected PDFs are refused.
 *
 *  parseRanges("1-3, 5, 8-", 10) -> [0,1,2,4,7,8,9]   (page numbers start at 1 for you, 0 for pdf-lib)
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';
  const { el } = HUB;

  CV.parseRanges = (text, count) => {
    const out = [];
    const parts = String(text || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) throw new Error('write which pages, for example 1-3, 5');
    for (const part of parts) {
      const m = part.match(/^(\d*)\s*-\s*(\d*)$/) || part.match(/^(\d+)$/);
      if (!m) throw new Error(`“${part}” is not a page or range`);
      let a, b;
      if (m.length === 2) { a = b = Number(m[1]); } else { a = m[1] ? Number(m[1]) : 1; b = m[2] ? Number(m[2]) : count; }
      if (a < 1 || b > count || a > b) throw new Error(`“${part}” is outside 1–${count}`);
      for (let i = a; i <= b; i++) out.push(i - 1);
    }
    return out;
  };

  const loadPdf = async file => {
    try { return await PDFLib.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); }
    catch (e) { throw new Error(/encrypt/i.test(e.message) ? `${file.name} is password-protected – remove the password first` : `${file.name}: ${e.message}`); }
  };
  const pdfBlob = async doc => new Blob([await doc.save()], { type: 'application/pdf' });

  CV.addTool({
    id: 'pdf-merge', group: 'PDF', icon: '🧩', name: 'Merge PDFs',
    desc: 'Join several PDF files into one. Use ▲▼ to set the order.',
    keywords: 'combine join pdf',
    render(panel) {
      const dz = CV.dropZone({ accept: '.pdf', multiple: true, label: 'PDF files', reorder: true });
      const go = CV.button('Merge', 'btn primary');
      panel.append(dz.el, go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['pdf'] }) || (files.length < 2 ? 'Choose at least 2 PDF files.' : '');
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          const out = await PDFLib.PDFDocument.create();
          for (let i = 0; i < files.length; i++) {
            st.progress('Adding', i + 1, files.length);
            const src = await loadPdf(files[i]);
            (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
          }
          res.add(await pdfBlob(out), 'merged.pdf', `${out.getPageCount()} pages`);
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'pdf-split', group: 'PDF', icon: '✂️', name: 'Split / extract pages',
    desc: 'Take some pages out of a PDF, or save every page as its own PDF.',
    keywords: 'split extract pages pdf',
    render(panel) {
      const dz = CV.dropZone({ accept: '.pdf', label: 'a PDF file' });
      const mode = CV.select([['range', 'Pages I choose → one PDF'], ['each', 'Every page → its own PDF']], 'range');
      const ranges = el('input'); ranges.placeholder = 'e.g. 1-3, 5, 8-'; ranges.value = '1-3';
      const go = CV.button('Split', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('What', mode), CV.field('Pages', ranges, '“8-” = page 8 to the end')), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['pdf'], max: 1 });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          const src = await loadPdf(files[0]);
          const n = src.getPageCount(), base = CV.baseName(files[0].name);
          if (mode.value === 'range') {
            const idx = CV.parseRanges(ranges.value, n);
            const out = await PDFLib.PDFDocument.create();
            (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
            res.add(await pdfBlob(out), `${base} (pages ${ranges.value.replace(/\s+/g, '')}).pdf`, `${idx.length} pages`);
          } else {
            for (let i = 0; i < n; i++) {
              st.progress('Page', i + 1, n);
              const out = await PDFLib.PDFDocument.create();
              out.addPage((await out.copyPages(src, [i]))[0]);
              res.add(await pdfBlob(out), `${base} - page ${i + 1}.pdf`);
            }
          }
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'pdf-rotate', group: 'PDF', icon: '🔄', name: 'Rotate pages',
    desc: 'Turn all pages, or only some, by 90°, 180° or 270°.',
    keywords: 'rotate turn pdf',
    render(panel) {
      const dz = CV.dropZone({ accept: '.pdf', label: 'a PDF file' });
      const deg = CV.select([['90', '90° clockwise'], ['180', '180°'], ['270', '90° anticlockwise']], '90');
      const ranges = el('input'); ranges.placeholder = 'empty = all pages';
      const go = CV.button('Rotate', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Turn by', deg), CV.field('Pages', ranges, 'e.g. 2, 4-6 – empty = all')), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['pdf'], max: 1 });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          const doc = await loadPdf(files[0]);
          const pages = doc.getPages();
          const idx = ranges.value.trim() ? CV.parseRanges(ranges.value, pages.length) : pages.map((p, i) => i);
          idx.forEach(i => pages[i].setRotation(PDFLib.degrees((pages[i].getRotation().angle + Number(deg.value)) % 360)));
          res.add(await pdfBlob(doc), CV.baseName(files[0].name) + ' (rotated).pdf', `${idx.length} page${idx.length === 1 ? '' : 's'} turned`);
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'pdf-to-images', group: 'PDF', icon: '🖼️', name: 'PDF → images',
    desc: 'Save the pages of a PDF as PNG or JPG pictures.',
    keywords: 'pdf to jpg pdf to png',
    render(panel) {
      const dz = CV.dropZone({ accept: '.pdf', label: 'a PDF file' });
      const fmt = CV.select([['image/png', 'PNG'], ['image/jpeg', 'JPG']], 'image/png');
      const dpi = CV.select([['96', '96 dpi (screen)'], ['150', '150 dpi (good)'], ['300', '300 dpi (print)']], '150');
      const ranges = el('input'); ranges.placeholder = 'empty = all pages';
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Format', fmt), CV.field('Quality', dpi), CV.field('Pages', ranges, 'e.g. 1-3 – empty = all')), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['pdf'], max: 1 });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          st.info('Loading PDF reader…');
          const pdfjs = await CV.loadPdfJs();
          const doc = await CV.openPdf(pdfjs, files[0]);
          const idx = ranges.value.trim() ? CV.parseRanges(ranges.value, doc.numPages) : [...Array(doc.numPages).keys()];
          const ext = fmt.value === 'image/png' ? 'png' : 'jpg';
          for (let k = 0; k < idx.length; k++) {
            st.progress('Page', k + 1, idx.length);
            const page = await doc.getPage(idx[k] + 1);
            const vp = page.getViewport({ scale: Number(dpi.value) / 72 });
            const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
            const blob = await new Promise(r => c.toBlob(r, fmt.value, 0.92));
            res.add(blob, `${CV.baseName(files[0].name)} - page ${idx[k] + 1}.${ext}`, `${c.width}×${c.height}`);
            page.cleanup();
          }
          await CV.closePdf(doc);
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'pdf-to-text', group: 'PDF', icon: '🔤', name: 'PDF → text',
    desc: 'Pull all the text out of a PDF into a .txt file (scanned pages have no text).',
    keywords: 'pdf to txt extract text',
    render(panel) {
      const dz = CV.dropZone({ accept: '.pdf', multiple: true, label: 'PDF files' });
      const go = CV.button('Get text', 'btn primary');
      panel.append(dz.el, go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['pdf'] });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          const pdfjs = await CV.loadPdfJs();
          for (const f of files) {
            const doc = await CV.openPdf(pdfjs, f);
            const pages = [];
            for (let p = 1; p <= doc.numPages; p++) {
              st.progress(f.name + ': page', p, doc.numPages);
              const tc = await (await doc.getPage(p)).getTextContent();
              pages.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('').trim());
            }
            await CV.closePdf(doc);
            const text = pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
            const chars = pages.join('').replace(/\s/g, '').length;
            res.add(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }), CV.baseName(f.name) + '.txt', chars ? `${chars} characters` : 'no text found – scanned pages?');
          }
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  /* ----------------------------- text / markdown ---------------------------- */
  // Markdown tokens (from marked.lexer) → layout blocks
  function mdBlocks(tokens, blocks = []) {
    const inline = toks => {
      const out = [];
      const walk = (ts, fmt) => (ts || []).forEach(t => {
        if (t.type === 'strong') walk(t.tokens, Object.assign({}, fmt, { b: true }));
        else if (t.type === 'em') walk(t.tokens, Object.assign({}, fmt, { i: true }));
        else if (t.type === 'codespan') out.push(Object.assign({ text: t.text, code: true }, fmt));
        else if (t.type === 'link') walk(t.tokens, Object.assign({}, fmt, { link: t.href, color: '#1f5fbf' }));
        else if (t.type === 'br') out.push({ text: '\n' });
        else if (t.type === 'del') walk(t.tokens, fmt);
        else if (t.tokens) walk(t.tokens, fmt);
        else out.push(Object.assign({ text: decode(t.text ?? t.raw ?? '') }, fmt));
      });
      walk(toks, {});
      return out;
    };
    tokens.forEach(t => {
      if (t.type === 'heading') blocks.push({ type: 'p', style: 'h' + Math.min(6, t.depth), runs: inline(t.tokens) });
      else if (t.type === 'paragraph' || t.type === 'text') blocks.push({ type: 'p', runs: inline(t.tokens || [{ type: 'text', text: t.text }]) });
      else if (t.type === 'list') t.items.forEach((it, i) => {
        const marker = t.ordered ? (Number(t.start || 1) + i) + '.' : '•';
        const sub = it.tokens.filter(x => x.type !== 'list');
        blocks.push({ type: 'p', list: { level: 0, marker, ordered: t.ordered }, runs: inline(sub.flatMap(x => x.tokens || [{ type: 'text', text: x.text || '' }])) });
        it.tokens.filter(x => x.type === 'list').forEach(nl => nl.items.forEach((ni, j) => blocks.push({ type: 'p', list: { level: 1, marker: nl.ordered ? (j + 1) + '.' : '◦' }, runs: inline(ni.tokens.flatMap(x => x.tokens || [])) })));
      });
      else if (t.type === 'code') blocks.push({ type: 'code', text: t.text });
      else if (t.type === 'blockquote') mdBlocks(t.tokens, []).forEach(b => { if (b.runs) b.runs.forEach(r => { r.i = true; r.color = '#555566'; }); b.indent = 14; blocks.push(b); });
      else if (t.type === 'hr') blocks.push({ type: 'hr' });
      else if (t.type === 'table') blocks.push({ type: 'table', header: true, rows: [t.header.map(c => inline(c.tokens)), ...t.rows.map(r => r.map(c => inline(c.tokens)))] });
      else if (t.type === 'html') blocks.push({ type: 'p', runs: [{ text: t.text }] });     // raw HTML is shown as text, never run
      else if (t.type === 'space') { /* gap */ }
    });
    return blocks;
  }
  const decode = s => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));

  CV.addTool({
    id: 'text-to-pdf', group: 'Text', icon: '🗒️', name: 'Text / Markdown → PDF',
    desc: '.txt or .md files to PDF. Markdown headings, lists, bold, links, tables and code blocks are kept.',
    keywords: 'txt to pdf md to pdf markdown',
    render(panel) {
      const dz = CV.dropZone({ accept: '.txt,.md,.markdown,.csv,.log', multiple: true, label: 'text files' });
      const mode = CV.select([['auto', 'Automatic (.md = Markdown)'], ['md', 'Always Markdown'], ['plain', 'Plain text (keep lines)']], 'auto');
      const size = CV.select([['A4', 'A4'], ['Letter', 'Letter']], 'A4');
      const go = CV.button('Make PDF', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Read as', mode), CV.field('Page size', size)), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['txt', 'md', 'markdown', 'csv', 'log'] });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          for (let i = 0; i < files.length; i++) {
            st.progress('Converting', i + 1, files.length);
            const f = files[i], text = (await f.text()).replace(/^﻿/, '');
            const md = mode.value === 'md' || (mode.value === 'auto' && /^(md|markdown)$/.test(CV.ext(f.name)));
            const blocks = md ? mdBlocks(marked.lexer(text)) : [{ type: 'code', text }];
            if (!md) blocks[0] = { type: 'p', runs: [{ text }] };
            res.add(new Blob([await CV.blocksToPdf(blocks, { title: CV.baseName(f.name), pageSize: size.value })], { type: 'application/pdf' }), CV.baseName(f.name) + '.pdf');
          }
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'md-to-html', group: 'Text', icon: '🌐', name: 'Markdown → HTML',
    desc: 'Turn a .md file into a clean web page. Raw HTML inside the Markdown is shown as text, never run.',
    keywords: 'md to html markdown',
    render(panel) {
      const dz = CV.dropZone({ accept: '.md,.markdown,.txt', multiple: true, label: 'Markdown files' });
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['md', 'markdown', 'txt'] });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          for (const f of files) {
            const blocks = mdBlocks(marked.lexer((await f.text()).replace(/^﻿/, '')));
            res.add(new Blob([CV.blocksToHtml(blocks, CV.baseName(f.name))], { type: 'text/html' }), CV.baseName(f.name) + '.html');
          }
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });
})(window.CV);
