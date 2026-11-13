/*
 * ============================================================================
 *  cv-core.js – the frame of the Converter card. Every tool plugs into this.
 * ============================================================================
 *  Privacy: all converting happens IN YOUR BROWSER. Files are read with the
 *  File API and never sent anywhere (the page's security policy also blocks any
 *  connection to other servers).
 *
 *  How a tool is added (see cv-images.js for real examples):
 *      CV.addTool({
 *        id: 'webp-to-jpg', group: 'Images', icon: '🖼️', name: 'Image converter',
 *        desc: 'One line explaining the tool',
 *        render(panel) { ... build the tool's controls inside panel ... }
 *      });
 *
 *  Helpers for tools (all on window.CV)
 *    CV.dropZone(opts)          file picker + drag & drop area, returns { el, files() }
 *    CV.checkFiles(list, opts)  size / type limits – returns an error text or ''
 *    CV.download(blob, name)    save a file to the Downloads folder
 *    CV.results(panel)          a result list: .add(blob, name, note), .zipButton()
 *    CV.zip(items)              many files -> one .zip Blob (JSZip)
 *    CV.baseName / CV.safeName  file-name helpers
 *    CV.status(panel)           a status line: .info/.ok/.error/.progress
 *    CV.button / CV.select / CV.number / CV.check   small form helpers
 *    CV.readZip(file)           open .docx/.xlsx safely (blocks "zip bombs")
 *    CV.loadPdfJs()             loads pdf.js only when a PDF tool needs it
 *  Screen
 *    buildNav()   the tool list on the left, grouped and searchable
 *    openTool(id) shows one tool (URL keeps #tool-id so reload stays on it)
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';
  const { $, el } = HUB;

  CV.MAX_FILE_MB = 200;           // largest single file
  CV.MAX_TOTAL_MB = 600;          // largest total per conversion
  CV.MAX_UNZIPPED_MB = 400;       // largest unpacked size of a .docx/.xlsx
  CV.tools = [];
  CV.GROUPS = ['Images', 'PDF', 'Word', 'Text', 'Data', 'Units'];

  CV.addTool = tool => { CV.tools.push(tool); };

  /* ------------------------------ file names ------------------------------ */
  CV.baseName = name => String(name || 'file').replace(/\.[^.]+$/, '');
  // Keep only safe characters in a download name (no folders, no control characters)
  CV.safeName = name => String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(0, 150) || 'file';
  CV.ext = name => (String(name).match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
  CV.fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

  /* ------------------------------- limits --------------------------------- */
  CV.checkFiles = (list, { exts = null, max = 999 } = {}) => {
    if (!list.length) return 'Choose a file first.';
    if (list.length > max) return `Choose at most ${max} file${max === 1 ? '' : 's'}.`;
    let total = 0;
    for (const f of list) {
      if (f.size > CV.MAX_FILE_MB * 1048576) return `${f.name} is bigger than ${CV.MAX_FILE_MB} MB.`;
      if (exts && !exts.includes(CV.ext(f.name))) return `${f.name}: this tool takes ${exts.map(e => '.' + e).join(', ')} files.`;
      total += f.size;
    }
    if (total > CV.MAX_TOTAL_MB * 1048576) return `Together the files are bigger than ${CV.MAX_TOTAL_MB} MB.`;
    return '';
  };

  /* ------------------------------- download ------------------------------- */
  CV.download = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = CV.safeName(name);
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };

  CV.zip = async items => {
    const z = new JSZip();
    const used = new Set();
    items.forEach(({ blob, name }) => {
      let n = CV.safeName(name), k = 2;
      while (used.has(n)) n = CV.baseName(CV.safeName(name)) + ` (${k++}).` + CV.ext(name);
      used.add(n);
      z.file(n, blob);
    });
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  };

  /** Open a zip-based file (.docx, .xlsx) and refuse "zip bombs" (tiny file that unpacks to gigabytes). */
  CV.readZip = async file => {
    const zip = await JSZip.loadAsync(file);
    let total = 0;
    zip.forEach((p, f) => { total += (f._data && f._data.uncompressedSize) || 0; });
    if (total > CV.MAX_UNZIPPED_MB * 1048576) throw new Error(`unpacks to more than ${CV.MAX_UNZIPPED_MB} MB – refused for safety`);
    return zip;
  };

  /** Parse XML text safely (DOMParser never runs scripts or loads external files). */
  CV.xml = text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('the file is damaged (XML error)');
    return doc;
  };

  /* --------------------------- pdf.js (on demand) -------------------------- */
  let pdfjsPromise = null;
  CV.loadPdfJs = () => {
    if (location.protocol === 'file:') return Promise.reject(new Error('PDF reading needs the server – start it with start-windows.bat'));
    if (!pdfjsPromise) {
      pdfjsPromise = import('./vendor/pdf.min.mjs').then(lib => {
        lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href;
        return lib;
      });
    }
    return pdfjsPromise;
  };
  CV.openPdf = async (pdfjs, file) => pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,         // never run code generated from the PDF
    enableScripting: false,         // ignore JavaScript inside PDFs
    disableAutoFetch: true,
    disableStream: true
  }).promise;

  /** Close a PDF opened with CV.openPdf and free its memory (works with every pdf.js version). */
  CV.closePdf = async doc => {
    try { if (typeof doc.destroy === 'function') await doc.destroy(); else if (doc.loadingTask) await doc.loadingTask.destroy(); } catch { /* already closed */ }
  };

  /* ------------------------------ UI helpers ------------------------------ */
  CV.button = (text, cls = 'btn') => { const b = el('button', cls, text); b.type = 'button'; return b; };
  CV.field = (label, input, hint) => {
    const w = el('label', 'field');
    w.append(el('span', 'field-label', label), input);
    if (hint) w.append(el('span', 'field-hint', hint));
    return w;
  };
  CV.select = (options, value) => {
    const s = el('select');
    options.forEach(([v, t]) => s.append(new Option(t, v)));
    if (value !== undefined) s.value = value;
    return s;
  };
  CV.number = (value, min, max, step = 1) => {
    const i = el('input'); i.type = 'number'; i.value = value; i.min = min; i.max = max; i.step = step;
    return i;
  };
  CV.check = (text, checked) => {
    const l = el('label', 'checkline'); const c = el('input'); c.type = 'checkbox'; c.checked = !!checked;
    l.append(c, document.createTextNode(' ' + text));
    l.input = c;
    return l;
  };
  CV.options = (...fields) => { const o = el('div', 'options'); o.append(...fields); return o; };

  CV.status = panel => {
    const s = el('div', 'status'); s.setAttribute('role', 'status'); s.setAttribute('aria-live', 'polite');
    panel.append(s);
    const set = (cls, text) => { s.className = 'status ' + cls; s.textContent = text; };
    return {
      el: s,
      info: t => set('info', t), ok: t => set('ok', '✓ ' + t), error: t => set('error', '⚠ ' + t),
      progress: (t, done, total) => set('info', total ? `${t} ${done}/${total}…` : t + '…'),
      clear: () => set('', '')
    };
  };

  CV.results = panel => {
    const box = el('div', 'results'); panel.append(box);
    const items = [];
    const api = {
      clear() { items.length = 0; box.textContent = ''; },
      add(blob, name, note) {
        items.push({ blob, name });
        const row = el('div', 'result');
        const info = el('div', 'result-info');
        info.append(el('div', 'result-name', name), el('div', 'result-meta', CV.fmtSize(blob.size) + (note ? ' · ' + note : '')));
        const dl = CV.button('⬇ Download', 'btn small');
        dl.onclick = () => CV.download(blob, name);
        row.append(el('div', 'result-icon', '📄'), info, dl);
        box.append(row);
        api.refreshZip();
      },
      refreshZip() {
        const old = box.querySelector('.zip-row'); if (old) old.remove();
        if (items.length < 2) return;
        const r = el('div', 'zip-row');
        const b = CV.button(`⬇ Download all (${items.length}) as .zip`, 'btn primary small');
        b.onclick = async () => { b.disabled = true; b.textContent = 'Packing…'; CV.download(await CV.zip(items), 'converted-files.zip'); b.disabled = false; b.textContent = `⬇ Download all (${items.length}) as .zip`; };
        r.append(b); box.prepend(r);
      },
      items
    };
    return api;
  };

  /**
   * CV.dropZone({ accept: '.docx', multiple: true, label: 'Word files' })
   * A click-or-drop area with a list of the chosen files (with ✕ to remove, ▲▼ to reorder).
   */
  CV.dropZone = ({ accept = '', multiple = false, label = 'files', reorder = false, onChange = () => {} } = {}) => {
    const wrap = el('div', 'dz-wrap');
    const zone = el('div', 'dropzone'); zone.tabIndex = 0; zone.setAttribute('role', 'button');
    zone.append(el('div', 'dz-icon', '📂'), el('div', 'dz-text', `Click to choose ${label} or drop ${multiple ? 'them' : 'it'} here`),
      el('div', 'dz-hint', (accept ? accept.split(',').join(' ') + ' · ' : '') + 'stays on this computer'));
    const input = el('input'); input.type = 'file'; input.hidden = true; input.multiple = multiple; if (accept) input.accept = accept;
    const list = el('div', 'dz-list');
    let files = [];
    const draw = () => {
      list.textContent = '';
      files.forEach((f, i) => {
        const r = el('div', 'dz-file');
        r.append(el('span', 'dz-name', f.name), el('span', 'dz-size', CV.fmtSize(f.size)));
        if (reorder && files.length > 1) {
          const up = CV.button('▲', 'mini'); up.disabled = i === 0; up.title = 'Move up';
          up.onclick = () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); onChange(files); };
          const dn = CV.button('▼', 'mini'); dn.disabled = i === files.length - 1; dn.title = 'Move down';
          dn.onclick = () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; draw(); onChange(files); };
          r.append(up, dn);
        }
        const x = CV.button('✕', 'mini'); x.title = 'Remove';
        x.onclick = () => { files.splice(i, 1); draw(); onChange(files); };
        r.append(x);
        list.append(r);
      });
    };
    const add = fl => { files = multiple ? files.concat([...fl]) : [...fl].slice(0, 1); draw(); onChange(files); };
    zone.onclick = () => input.click();
    zone.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = () => { add(input.files); input.value = ''; };
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer.files.length) add(e.dataTransfer.files); });
    wrap.append(zone, input, list);
    return { el: wrap, files: () => files.slice(), clear: () => { files = []; draw(); } };
  };

  /** Load an image file into an <img> (works for jpg, png, webp, gif, bmp, avif, svg, ico). */
  CV.loadImage = file => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name}: this browser can't read this image type`)); };
    img.src = url;
  });

  /** Draw an image on a canvas (optionally resized) and export it. */
  CV.imageTo = async (img, { type = 'image/png', quality = 0.92, maxW = 0, maxH = 0, bg = null } = {}) => {
    let w = img.naturalWidth || img.width || 1000, h = img.naturalHeight || img.height || 1000;
    const k = Math.min(1, maxW ? maxW / w : 1, maxH ? maxH / h : 1);
    w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    x.drawImage(img, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, type, quality));
    if (!blob) throw new Error('this browser can not create ' + type);
    return { blob, w, h };
  };

  /* --------------------------------- screen -------------------------------- */
  function buildNav() {
    const nav = $('#toolNav'); nav.textContent = '';
    const q = $('#toolSearch').value.trim().toLowerCase();
    CV.GROUPS.forEach(g => {
      const tools = CV.tools.filter(t => t.group === g && (!q || (t.name + ' ' + t.desc + ' ' + (t.keywords || '')).toLowerCase().includes(q)));
      if (!tools.length) return;
      nav.append(el('div', 'nav-group', g));
      tools.forEach(t => {
        const b = CV.button('', 'nav-item'); b.dataset.id = t.id;
        b.append(el('span', 'nav-icon', t.icon), el('span', 'nav-name', t.name));
        b.onclick = () => openTool(t.id);
        nav.append(b);
      });
    });
    markActive();
  }
  function markActive() {
    const id = (location.hash || '').slice(1);
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  }
  function openTool(id) {
    const t = CV.tools.find(x => x.id === id) || CV.tools[0];
    if (location.hash !== '#' + t.id) history.replaceState(null, '', '#' + t.id);
    const panel = $('#toolPanel'); panel.textContent = '';
    const head = el('div', 'tool-head');
    head.append(el('div', 'tool-icon', t.icon));
    const ht = el('div'); ht.append(el('h2', '', t.name), el('p', 'tool-desc', t.desc)); head.append(ht);
    panel.append(head);
    try { t.render(panel); } catch (e) { panel.append(el('p', 'status error', 'This tool failed to start: ' + e.message)); }
    markActive();
    panel.focus({ preventScroll: true });
  }
  CV.openTool = openTool;

  CV.start = () => {
    HUB.cardShell('converter');
    // logout button (only when served by the server with a login)
    if (/^https?:$/.test(location.protocol)) {
      fetch('/auth/status', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(s => {
        if (!s || !s.loggedIn) return;
        const b = CV.button('🔒 Lock', 'lock-btn');
        b.title = 'Log out of the private cards';
        b.onclick = async () => {
          await fetch('/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'card-hub' } }).catch(() => {});
          location.href = HUB.root() + 'index.html#cards';
        };
        document.querySelector('.hub-bar').append(b);
      }).catch(() => {});
    }
    $('#toolSearch').addEventListener('input', buildNav);
    buildNav();
    openTool((location.hash || '').slice(1));
  };
})(window.CV);
