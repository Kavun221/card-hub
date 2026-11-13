/*
 * ============================================================================
 *  cv-word.js – Word (.docx) tools: Word → PDF, Word → HTML, Word → Text.
 * ============================================================================
 *  A .docx file is a ZIP with XML files inside:
 *    word/document.xml          the text (paragraphs <w:p>, runs <w:r>, tables <w:tbl>)
 *    word/styles.xml            style names ("heading 1", "Title", …)
 *    word/numbering.xml         bullet / number lists
 *    word/_rels/document.xml.rels  links and pictures (rId → file / URL)
 *    word/media/*               the pictures
 *
 *  Functions
 *    CV.readDocx(file)       -> { blocks, title }  (blocks as described in cv-layout.js)
 *    paragraph(p)            one <w:p> → a paragraph block (+ pictures, page breaks)
 *    runsOf(node)            text pieces with bold / italic / underline / size / colour
 *    table(tbl)              one <w:tbl> → a table block
 *    CV.blocksToHtml(blocks) clean, self-contained HTML (pictures embedded, text escaped)
 *    CV.blocksToText(blocks) plain text
 *  Not supported (skipped): text boxes, footnotes, headers/footers, comments, EMF/WMF pictures.
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const kids = (n, name) => [...(n ? n.childNodes : [])].filter(c => c.nodeType === 1 && (!name || c.localName === name));
  const kid = (n, name) => kids(n, name)[0] || null;
  const wattr = (n, a) => (n ? (n.getAttributeNS(W, a) ?? n.getAttribute('w:' + a)) : null);
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' };
  const onOff = n => !!n && !/^(0|false|off|none)$/i.test(wattr(n, 'val') || '');

  CV.readDocx = async file => {
    const zip = await CV.readZip(file);
    const text = async p => (zip.file(p) ? zip.file(p).async('string') : null);
    const docXml = await text('word/document.xml');
    if (!docXml) throw new Error('this is not a Word .docx file (word/document.xml missing)');
    const doc = CV.xml(docXml);

    // style id -> lower-case style name, and the style's own bold/size
    const styles = {}, styleNum = {}, basedOn = {};
    const st = await text('word/styles.xml');
    if (st) kids(CV.xml(st).documentElement, 'style').forEach(s => {
      const id = wattr(s, 'styleId');
      styles[id] = (wattr(kid(s, 'name'), 'val') || '').toLowerCase();
      basedOn[id] = wattr(kid(s, 'basedOn'), 'val');
      const np = kid(kid(s, 'pPr'), 'numPr');          // lists can be defined in the paragraph STYLE ("List Bullet")
      if (np) styleNum[id] = { numId: wattr(kid(np, 'numId'), 'val'), ilvl: wattr(kid(np, 'ilvl'), 'val') };
    });
    const numOfStyle = id => { for (let k = 0; id && k < 8; k++, id = basedOn[id]) if (styleNum[id]) return styleNum[id]; return null; };

    // numbering: numId -> abstractNum levels -> format ('bullet', 'decimal', …)
    const numFmt = {};
    const nu = await text('word/numbering.xml');
    if (nu) {
      const nd = CV.xml(nu).documentElement;
      const abs = {};
      kids(nd, 'abstractNum').forEach(a => {
        abs[wattr(a, 'abstractNumId')] = Object.fromEntries(kids(a, 'lvl').map(l => [wattr(l, 'ilvl'), wattr(kid(l, 'numFmt'), 'val') || 'bullet']));
      });
      kids(nd, 'num').forEach(n => { numFmt[wattr(n, 'numId')] = abs[wattr(kid(n, 'abstractNumId'), 'val')] || {}; });
    }

    // relationships: rId -> target (pictures inside the zip, links outside)
    const rels = {};
    const rx = await text('word/_rels/document.xml.rels');
    if (rx) [...CV.xml(rx).documentElement.childNodes].filter(n => n.nodeType === 1).forEach(r => {
      rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' };
    });

    const counters = {};
    const blocks = [];

    function runsOf(node, link) {
      const out = [];
      kids(node).forEach(c => {
        if (c.localName === 'hyperlink') {
          const rel = rels[c.getAttributeNS(R, 'id') || c.getAttribute('r:id')];
          out.push(...runsOf(c, rel && rel.external ? rel.target : null));
        } else if (c.localName === 'r' || c.localName === 'ins' || c.localName === 'smartTag') {
          if (c.localName !== 'r') { out.push(...runsOf(c, link)); return; }
          const pr = kid(c, 'rPr');
          const fmt = {
            b: onOff(kid(pr, 'b')), i: onOff(kid(pr, 'i')),
            u: !!kid(pr, 'u') && wattr(kid(pr, 'u'), 'val') !== 'none',
            size: kid(pr, 'sz') ? Number(wattr(kid(pr, 'sz'), 'val')) / 2 : undefined,
            color: kid(pr, 'color') && /^[0-9a-f]{6}$/i.test(wattr(kid(pr, 'color'), 'val')) ? '#' + wattr(kid(pr, 'color'), 'val') : undefined,
            link: link || undefined
          };
          if (link && !fmt.color) fmt.color = '#1f5fbf';
          kids(c).forEach(t => {
            if (t.localName === 't') out.push(Object.assign({ text: t.textContent }, fmt));
            else if (t.localName === 'tab') out.push(Object.assign({ text: '\t' }, fmt));
            else if (t.localName === 'br' || t.localName === 'cr') {
              if (wattr(t, 'type') === 'page') out.push({ pagebreak: true });
              else out.push(Object.assign({ text: '\n' }, fmt));
            } else if (t.localName === 'drawing' || t.localName === 'pict') {
              const blip = t.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
              const id = blip && (blip.getAttributeNS(R, 'embed') || blip.getAttribute('r:embed'));
              const ext = t.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
              if (id) out.push({ image: id, cx: ext ? Number(ext.getAttribute('cx')) : 0, cy: ext ? Number(ext.getAttribute('cy')) : 0 });
            }
          });
        }
      });
      return out;
    }

    async function imageBlock(item) {
      const rel = rels[item.image];
      if (!rel || rel.external) return null;
      const p = ('word/' + rel.target).replace(/\/[^/]+\/\.\.\//g, '/').replace(/^word\/\//, '');
      const f = zip.file(p.startsWith('word/') ? p : 'word/' + rel.target.replace(/^\//, ''));
      const ext = CV.ext(rel.target);
      if (!f || !MIME[ext]) return { type: 'p', runs: [{ text: `[picture “${rel.target.split('/').pop()}” not supported]`, i: true, color: '#888888' }] };
      // EMU -> px (914400 EMU per inch, 96 px per inch)
      return { type: 'img', bytes: await f.async('uint8array'), mime: MIME[ext], w: item.cx ? item.cx / 9525 : 0, h: item.cy ? item.cy / 9525 : 0 };
    }

    async function paragraph(p) {
      const pr = kid(p, 'pPr');
      const sid = wattr(kid(pr, 'pStyle'), 'val') || '';
      const sname = styles[sid] || sid.toLowerCase();
      let style = 'normal';
      const hm = sname.match(/^heading\s*(\d)/) || sid.match(/^Heading(\d)/i);
      if (hm) style = 'h' + Math.min(6, Number(hm[1]));
      else if (/^title$/.test(sname)) style = 'title';
      else if (/^subtitle$/.test(sname)) style = 'h3';
      const jc = wattr(kid(pr, 'jc'), 'val');
      const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc] || 'left';
      let list = null;
      const np = kid(pr, 'numPr');
      const sn = numOfStyle(sid);
      if (np || sn) {
        const lvl = Number((np && wattr(kid(np, 'ilvl'), 'val')) || (sn && sn.ilvl) || 0);
        const id = (np && wattr(kid(np, 'numId'), 'val')) || (sn && sn.numId);
        if (id && id !== '0') {
          const fmt = (numFmt[id] || {})[String(lvl)] || 'bullet';
          const key = id + ':' + lvl;
          Object.keys(counters).forEach(k => { const [i2, l2] = k.split(':'); if (i2 === id && Number(l2) > lvl) delete counters[k]; });
          counters[key] = (counters[key] || 0) + 1;
          const n = counters[key];
          const marker = fmt === 'bullet' ? ['•', '◦', '▪'][lvl % 3]
            : fmt === 'lowerLetter' ? String.fromCharCode(96 + ((n - 1) % 26) + 1) + '.'
              : fmt === 'upperLetter' ? String.fromCharCode(64 + ((n - 1) % 26) + 1) + '.'
                : fmt === 'lowerRoman' ? roman(n).toLowerCase() + '.' : fmt === 'upperRoman' ? roman(n) + '.' : n + '.';
          list = { level: lvl, marker, ordered: fmt !== 'bullet' };
        }
      }
      if (kid(pr, 'pageBreakBefore')) blocks.push({ type: 'pagebreak' });
      const items = runsOf(p);
      let runs = [];
      const flush = () => { blocks.push({ type: 'p', style, align, list, runs }); runs = []; list = null; };
      let hadContent = false;
      for (const it of items) {
        if (it.pagebreak) { if (runs.length) flush(); blocks.push({ type: 'pagebreak' }); hadContent = true; continue; }
        if (it.image) { if (runs.some(r => String(r.text).trim())) flush(); else runs = []; const ib = await imageBlock(it); if (ib) blocks.push(ib); hadContent = true; continue; }
        runs.push(it);
      }
      if (runs.length || !hadContent) flush();
    }

    async function table(tbl) {
      const rows = [];
      for (const tr of kids(tbl, 'tr')) {
        const row = [];
        for (const tc of kids(tr, 'tc')) {
          const cell = [];
          kids(tc, 'p').forEach((p, i) => { if (i) cell.push({ text: '\n' }); cell.push(...runsOf(p).filter(r => r.text !== undefined)); });
          row.push(cell);
        }
        rows.push(row);
      }
      blocks.push({ type: 'table', rows, header: true });   // first row drawn as a header
    }

    const body = kid(doc.documentElement, 'body');
    for (const n of kids(body)) {
      if (n.localName === 'p') await paragraph(n);
      else if (n.localName === 'tbl') await table(n);
      else if (n.localName === 'sdt') { for (const c of kids(kid(n, 'sdtContent'))) { if (c.localName === 'p') await paragraph(c); else if (c.localName === 'tbl') await table(c); } }
    }
    const first = blocks.find(b => b.type === 'p' && b.runs.some(r => String(r.text || '').trim()));
    return { blocks, title: first ? first.runs.map(r => r.text || '').join('').trim().slice(0, 80) : CV.baseName(file.name) };
  };

  function roman(n) {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = ''; map.forEach(([v, r]) => { while (n >= v) { s += r; n -= v; } }); return s;
  }

  /* ------------------------------- HTML / text ------------------------------ */
  const esc = HUB.esc;
  const runsHtml = runs => runs.map(r => {
    if (r.text === undefined) return '';
    let t = esc(r.text).replace(/\n/g, '<br>').replace(/\t/g, '&emsp;');
    if (r.code) t = `<code>${t}</code>`;
    if (r.b) t = `<strong>${t}</strong>`;
    if (r.i) t = `<em>${t}</em>`;
    if (r.u && !r.link) t = `<u>${t}</u>`;
    const st = [r.size ? `font-size:${Number(r.size)}pt` : '', r.color && /^#[0-9a-f]{6}$/i.test(r.color) && !r.link ? `color:${r.color}` : ''].filter(Boolean).join(';');
    if (st) t = `<span style="${st}">${t}</span>`;
    if (r.link && HUB.safeUrl(r.link) !== '#') t = `<a href="${esc(HUB.safeUrl(r.link))}" rel="noopener noreferrer">${t}</a>`;
    return t;
  }).join('');

  const toDataUrl = (bytes, mime) => {
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return `data:${mime};base64,${btoa(s)}`;
  };

  CV.blocksToHtml = (blocks, title) => {
    const out = [];
    let listOpen = null;
    const closeList = () => { if (listOpen) { out.push(`</${listOpen}>`); listOpen = null; } };
    blocks.forEach(b => {
      if (b.type === 'p' && b.list) {
        const tag = b.list.ordered ? 'ol' : 'ul';
        if (listOpen !== tag) { closeList(); out.push(`<${tag}>`); listOpen = tag; }
        out.push(`<li style="margin-left:${b.list.level * 1.5}em">${runsHtml(b.runs)}</li>`);
        return;
      }
      closeList();
      if (b.type === 'p') {
        const tag = b.style === 'title' ? 'h1' : b.style === 'normal' ? 'p' : b.style;
        const al = b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
        out.push(`<${tag}${al}>${runsHtml(b.runs) || '&nbsp;'}</${tag}>`);
      } else if (b.type === 'table') {
        out.push('<table>' + b.rows.map((r, i) => '<tr>' + r.map(c => (i === 0 && b.header ? `<th>${runsHtml(c)}</th>` : `<td>${runsHtml(c)}</td>`)).join('') + '</tr>').join('') + '</table>');
      } else if (b.type === 'img' && ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'].includes(b.mime)) {
        out.push(`<p><img alt="" src="${toDataUrl(b.bytes, b.mime)}"${b.w ? ` width="${Math.round(b.w)}"` : ''}></p>`);
      } else if (b.type === 'code') out.push(`<pre>${esc(b.text)}</pre>`);
      else if (b.type === 'hr') out.push('<hr>');
      else if (b.type === 'pagebreak') out.push('<div class="pagebreak"></div>');
    });
    closeList();
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${esc(title || 'Document')}</title>
<style>body{font:16px/1.55 Calibri,"Segoe UI",Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#1f2335}
table{border-collapse:collapse;margin:12px 0;width:100%}td,th{border:1px solid #c9ccd8;padding:6px 8px;vertical-align:top}th{background:#f1f2f6}
img{max-width:100%;height:auto}pre{background:#f4f4f7;padding:10px;overflow:auto}.pagebreak{page-break-after:always;border-top:1px dashed #ccc;margin:24px 0}</style>
</head><body>
${out.join('\n')}
</body></html>`;
  };

  CV.blocksToText = blocks => blocks.map(b => {
    const t = runs => runs.map(r => r.text || '').join('');
    if (b.type === 'p') return (b.list ? '  '.repeat(b.list.level) + b.list.marker + ' ' : '') + t(b.runs);
    if (b.type === 'table') return b.rows.map(r => r.map(c => t(c).replace(/\n/g, ' ')).join('\t')).join('\n');
    if (b.type === 'code') return b.text;
    if (b.type === 'pagebreak') return '\f';
    return '';
  }).join('\n').replace(/\n{3,}/g, '\n\n');

  /* ---------------------------------- tool ---------------------------------- */
  CV.addTool({
    id: 'word', group: 'Word', icon: '📝', name: 'Word → PDF / HTML / Text',
    desc: 'Convert .docx files. Keeps headings, bold/italic/underline, lists, tables, pictures and page breaks.',
    keywords: 'docx word pdf html txt',
    render(panel) {
      const { el } = HUB;
      const dz = CV.dropZone({ accept: '.docx', multiple: true, label: 'Word files (.docx)' });
      const to = CV.select([['pdf', 'PDF document'], ['html', 'HTML web page'], ['txt', 'Plain text (.txt)']], 'pdf');
      const size = CV.select([['A4', 'A4'], ['Letter', 'Letter']], 'A4');
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Convert to', to), CV.field('Page size (PDF)', size)), go);
      panel.append(el('p', 'note', 'Note: the PDF uses standard fonts, so it is a clean copy of the content – not a pixel-perfect copy of the Word layout. For an exact copy of a complicated layout, use Word’s own File → Save as → PDF. Old .doc files: open and save them as .docx first.'));
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['docx'] });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          for (let i = 0; i < files.length; i++) {
            st.progress('Converting', i + 1, files.length);
            const { blocks, title } = await CV.readDocx(files[i]);
            const base = CV.baseName(files[i].name);
            if (to.value === 'pdf') res.add(new Blob([await CV.blocksToPdf(blocks, { title, pageSize: size.value })], { type: 'application/pdf' }), base + '.pdf');
            else if (to.value === 'html') res.add(new Blob([CV.blocksToHtml(blocks, title)], { type: 'text/html' }), base + '.html');
            else res.add(new Blob(['﻿' + CV.blocksToText(blocks)], { type: 'text/plain;charset=utf-8' }), base + '.txt');
          }
          st.ok(`Done – ${files.length} file${files.length === 1 ? '' : 's'} converted.`);
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });
})(window.CV);
