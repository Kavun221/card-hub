/*
 * ============================================================================
 *  cv-data.js – spreadsheet and data tools
 * ============================================================================
 *    Excel (.xlsx) → CSV     choose the sheet and the separator (; is what Norwegian Excel expects)
 *    CSV → Excel (.xlsx)     numbers stay numbers, the first row is bold
 *    CSV → JSON / JSON → CSV
 *
 *  Functions
 *    CV.parseCsv(text, sep)   RFC 4180 CSV reader (quotes, "" inside quotes, line breaks in cells);
 *                             sep 'auto' picks , ; or tab by looking at the first line
 *    CV.toCsv(rows, sep, safe) rows → CSV text; safe=true puts ' before = + - @ so Excel can't run
 *                             a cell as a formula ("CSV injection")
 *    CV.readXlsx(file)        → [{ name, rows }]  (shared strings, numbers, booleans, dates)
 *    CV.writeXlsx(rows, name) → .xlsx Blob (a minimal, valid Excel file built with JSZip)
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';
  const { el } = HUB;

  CV.parseCsv = (text, sep = 'auto') => {
    text = String(text).replace(/^﻿/, '');
    if (sep === 'auto') {
      const first = text.split(/\r?\n/)[0] || '';
      const count = c => first.split(c).length - 1;
      sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
      if (!count(sep)) sep = ',';
    }
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { rows, sep };
  };

  CV.toCsv = (rows, sep = ',', safe = false) => rows.map(r => r.map(v => {
    let s = v === null || v === undefined ? '' : String(v);
    if (safe && /^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    return /["\n\r]/.test(s) || s.includes(sep) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(sep)).join('\r\n');

  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  const excelDate = (n, withTime) => {
    const d = new Date(Math.round((n - 25569) * 86400000));
    const iso = d.toISOString();
    return withTime && n % 1 ? iso.slice(0, 19).replace('T', ' ') : iso.slice(0, 10);
  };

  CV.readXlsx = async file => {
    const zip = await CV.readZip(file);
    const read = async p => (zip.file(p) ? CV.xml(await zip.file(p).async('string')) : null);
    const wb = await read('xl/workbook.xml');
    if (!wb) throw new Error('this is not an Excel .xlsx file');
    const rels = {};
    const rd = await read('xl/_rels/workbook.xml.rels');
    if (rd) [...rd.getElementsByTagName('Relationship')].forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const ss = [];
    const sd = await read('xl/sharedStrings.xml');
    if (sd) [...sd.getElementsByTagName('si')].forEach(si => ss.push([...si.getElementsByTagName('t')].map(t => t.textContent).join('')));
    // which cell styles are dates
    const dateStyle = [];
    const st = await read('xl/styles.xml');
    if (st) {
      const custom = {};
      [...st.getElementsByTagName('numFmt')].forEach(n => { custom[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') || ''; });
      const xfs = st.getElementsByTagName('cellXfs')[0];
      if (xfs) [...xfs.getElementsByTagName('xf')].forEach((x, i) => {
        const id = Number(x.getAttribute('numFmtId'));
        const code = custom[id] || '';
        dateStyle[i] = DATE_FMTS.has(id) || (/[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,%\s]+$/.test(code)) ? (/h|s/i.test(code) || id === 22 ? 'dt' : 'd') : '';
      });
    }
    const sheets = [];
    for (const s of [...wb.getElementsByTagName('sheet')]) {
      const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
      let target = rels[rid] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      const sh = await read(target);
      if (!sh) continue;
      const rows = [];
      [...sh.getElementsByTagName('row')].forEach(r => {
        const ri = Number(r.getAttribute('r')) - 1;
        const row = rows[ri] = rows[ri] || [];
        [...r.getElementsByTagName('c')].forEach((c, k) => {
          const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : k;
          const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
          let val = '';
          if (t === 's') val = ss[Number(v && v.textContent)] ?? '';
          else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
          else if (v) {
            val = v.textContent;
            const ds = dateStyle[Number(c.getAttribute('s') || 0)];
            if (ds && t !== 'str' && t !== 'e' && val !== '' && !isNaN(Number(val))) val = excelDate(Number(val), ds === 'dt');
          }
          row[ci] = val;
        });
      });
      for (let i = 0; i < rows.length; i++) rows[i] = Array.from(rows[i] || [], x => x ?? '');
      const width = Math.max(0, ...rows.map(r => r.length));
      sheets.push({ name: s.getAttribute('name') || 'Sheet', rows: rows.map(r => r.concat(Array(width - r.length).fill(''))) });
    }
    return sheets;
  };

  CV.writeXlsx = async (rows, sheetName = 'Sheet1') => {
    const x = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    const isNum = s => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(String(s).trim()) && String(s).trim().length < 16 && !/^0\d/.test(String(s).trim());
    const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      const style = ri === 0 ? ' s="1"' : '';
      if (v === '' || v === null || v === undefined) return '';
      return isNum(v) ? `<c r="${ref}"${style}><v>${String(v).trim()}</v></c>` : `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const name = x(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    z.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    z.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const SEP = [[';', '; semicolon (Norwegian Excel)'], [',', ', comma'], ['\t', 'Tab']];

  CV.addTool({
    id: 'xlsx-to-csv', group: 'Data', icon: '📗', name: 'Excel → CSV',
    desc: 'Save one or all sheets of an .xlsx file as CSV.',
    keywords: 'xlsx csv excel spreadsheet',
    render(panel) {
      let cache = null;   // sheets of the chosen file, read as soon as it is chosen
      const which = CV.select([['all', 'All sheets']], 'all');
      const dz = CV.dropZone({ accept: '.xlsx', label: 'an Excel file (.xlsx)', onChange: async files => {
        cache = null; which.textContent = ''; which.append(new Option('All sheets', 'all'));
        if (!files.length || CV.checkFiles(files, { exts: ['xlsx'], max: 1 })) return;
        try { cache = await CV.readXlsx(files[0]); cache.forEach((s, i) => which.append(new Option(`${s.name} (${s.rows.length} rows)`, String(i)))); }
        catch (e) { st.error(e.message); }
      } });
      const sep = CV.select(SEP, ';');
      const safe = CV.check('Protect against formulas (put \' before cells that start with = + - @)', true);
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Separator', sep), CV.field('Sheet', which)), safe, go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['xlsx'], max: 1 });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          const sheets = cache || await CV.readXlsx(files[0]);
          const pick = which.value === 'all' ? sheets : [sheets[Number(which.value)]];
          pick.forEach(s => res.add(new Blob(['﻿' + CV.toCsv(s.rows, sep.value, safe.input.checked)], { type: 'text/csv;charset=utf-8' }),
            `${CV.baseName(files[0].name)}${sheets.length > 1 ? ' - ' + s.name : ''}.csv`, `${s.rows.length} rows`));
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'csv-to-xlsx', group: 'Data', icon: '📊', name: 'CSV → Excel',
    desc: 'Turn CSV files into real .xlsx files (numbers stay numbers, header row in bold).',
    keywords: 'csv xlsx excel',
    render(panel) {
      const dz = CV.dropZone({ accept: '.csv,.txt,.tsv', multiple: true, label: 'CSV files' });
      const sep = CV.select([['auto', 'Find automatically']].concat(SEP), 'auto');
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Separator', sep)), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['csv', 'txt', 'tsv'] });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          for (const f of files) {
            const { rows } = CV.parseCsv(await f.text(), sep.value);
            res.add(await CV.writeXlsx(rows, CV.baseName(f.name)), CV.baseName(f.name) + '.xlsx', `${rows.length} rows`);
          }
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'csv-json', group: 'Data', icon: '🔁', name: 'CSV ⇄ JSON',
    desc: 'CSV → JSON (first row = names) or JSON (a list of objects) → CSV.',
    keywords: 'csv json convert',
    render(panel) {
      const dz = CV.dropZone({ accept: '.csv,.json,.txt', multiple: true, label: 'CSV or JSON files' });
      const sep = CV.select([['auto', 'Find automatically']].concat(SEP), 'auto');
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('CSV separator', sep, 'for JSON → CSV, “Find automatically” uses ;')), go);
      panel.append(el('p', 'note', '.csv files become .json and .json files become .csv.'));
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: ['csv', 'json', 'txt'] });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          for (const f of files) {
            const text = await f.text();
            if (CV.ext(f.name) === 'json') {
              let data = JSON.parse(text.replace(/^﻿/, ''));
              if (!Array.isArray(data)) data = [data];
              const keys = [...new Set(data.flatMap(o => (o && typeof o === 'object' ? Object.keys(o) : ['value'])))];
              const rows = [keys, ...data.map(o => keys.map(k => { const v = o && typeof o === 'object' ? o[k] : o; return v && typeof v === 'object' ? JSON.stringify(v) : v ?? ''; }))];
              res.add(new Blob(['﻿' + CV.toCsv(rows, sep.value === 'auto' ? ';' : sep.value, true)], { type: 'text/csv;charset=utf-8' }), CV.baseName(f.name) + '.csv', `${data.length} rows`);
            } else {
              const { rows } = CV.parseCsv(text, sep.value);
              const [head = [], ...body] = rows;
              const names = head.map((h, i) => h.trim() || 'column' + (i + 1));
              const list = body.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(names.map((n, i) => [n, r[i] ?? ''])));
              res.add(new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }), CV.baseName(f.name) + '.json', `${list.length} records`);
            }
          }
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });
})(window.CV);
