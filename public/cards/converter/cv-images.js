/*
 * ============================================================================
 *  cv-images.js – image tools
 * ============================================================================
 *  1. Image converter   WEBP / PNG / JPG / GIF / BMP / AVIF / SVG / ICO  →  JPG, PNG or WEBP
 *                       (batch, quality, optional max width/height, background colour for JPG)
 *  2. Images → PDF      one picture per page (page fitted to the picture, or A4/Letter)
 *
 *  How it works: the browser decodes the picture into an <img>, draws it on a <canvas>,
 *  and the canvas writes the new format (CV.loadImage + CV.imageTo in cv-core.js).
 *  SVG files are drawn as pictures – any script inside an SVG is never run.
 *  HEIC (iPhone) photos can't be read by Chrome; set the iPhone to "Most compatible".
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';
  const { el } = HUB;
  const IMG_EXTS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'avif', 'svg', 'ico', 'jfif'];
  const ACCEPT = IMG_EXTS.map(e => '.' + e).join(',');

  CV.addTool({
    id: 'image-convert', group: 'Images', icon: '🖼️', name: 'Image converter',
    desc: 'WEBP, PNG, JPG, GIF, BMP, AVIF, SVG, ICO → JPG, PNG or WEBP. Many files at once, with quality and resize.',
    keywords: 'webp to jpg png to jpg jpg to png resize compress',
    render(panel) {
      const dz = CV.dropZone({ accept: ACCEPT, multiple: true, label: 'pictures' });
      const fmt = CV.select([['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WEBP']], 'image/jpeg');
      const q = CV.number(90, 10, 100);
      const maxW = CV.number(0, 0, 20000, 10);
      const maxH = CV.number(0, 0, 20000, 10);
      const bg = el('input'); bg.type = 'color'; bg.value = '#ffffff';
      const go = CV.button('Convert', 'btn primary');
      panel.append(dz.el, CV.options(
        CV.field('Convert to', fmt), CV.field('Quality (JPG/WEBP)', q, '10–100, 90 = good'),
        CV.field('Max width px', maxW, '0 = keep size'), CV.field('Max height px', maxH, '0 = keep size'),
        CV.field('Background (JPG has no transparency)', bg)), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: IMG_EXTS });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[fmt.value];
        let ok = 0; const errors = [];
        for (let i = 0; i < files.length; i++) {
          st.progress('Converting', i + 1, files.length);
          try {
            const img = await CV.loadImage(files[i]);
            const out = await CV.imageTo(img, {
              type: fmt.value, quality: HUB.clamp(Number(q.value) || 90, 10, 100) / 100,
              maxW: Math.max(0, Number(maxW.value) || 0), maxH: Math.max(0, Number(maxH.value) || 0),
              bg: fmt.value === 'image/jpeg' ? bg.value : null
            });
            res.add(out.blob, CV.baseName(files[i].name) + '.' + ext, `${out.w}×${out.h}`);
            ok++;
          } catch (e) { errors.push(e.message); }
        }
        errors.length ? st.error(`${ok} converted, ${errors.length} failed: ${errors.join(' · ')}`) : st.ok(`Done – ${ok} picture${ok === 1 ? '' : 's'} converted.`);
        go.disabled = false;
      };
    }
  });

  CV.addTool({
    id: 'images-to-pdf', group: 'Images', icon: '📑', name: 'Images → PDF',
    desc: 'Put pictures into one PDF, one picture per page, in the order you choose.',
    keywords: 'jpg to pdf png to pdf scan photos',
    render(panel) {
      const dz = CV.dropZone({ accept: ACCEPT, multiple: true, label: 'pictures', reorder: true });
      const size = CV.select([['fit', 'Page = picture size'], ['A4', 'A4'], ['Letter', 'Letter']], 'A4');
      const orient = CV.select([['auto', 'Automatic'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], 'auto');
      const margin = CV.number(20, 0, 100);
      const go = CV.button('Make PDF', 'btn primary');
      panel.append(dz.el, CV.options(CV.field('Page size', size), CV.field('Orientation', orient), CV.field('Margin (pt)', margin)), go);
      const st = CV.status(panel), res = CV.results(panel);
      go.onclick = async () => {
        const files = dz.files();
        const err = CV.checkFiles(files, { exts: IMG_EXTS });
        if (err) return st.error(err);
        go.disabled = true; res.clear();
        try {
          const { PDFDocument, PageSizes } = PDFLib;
          const pdf = await PDFDocument.create();
          pdf.setProducer('Card Hub Converter (pdf-lib)');
          for (let i = 0; i < files.length; i++) {
            st.progress('Adding page', i + 1, files.length);
            const f = files[i], ext = CV.ext(f.name);
            let bytes, isJpg;
            if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') { bytes = new Uint8Array(await f.arrayBuffer()); isJpg = true; }
            else if (ext === 'png') { bytes = new Uint8Array(await f.arrayBuffer()); isJpg = false; }
            else { const { blob } = await CV.imageTo(await CV.loadImage(f), { type: 'image/png' }); bytes = new Uint8Array(await blob.arrayBuffer()); isJpg = false; }
            const im = isJpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
            const m = HUB.clamp(Number(margin.value) || 0, 0, 100);
            let pw, ph;
            if (size.value === 'fit') { pw = im.width * 0.75 + 2 * m; ph = im.height * 0.75 + 2 * m; }
            else {
              [pw, ph] = PageSizes[size.value];
              const land = orient.value === 'landscape' || (orient.value === 'auto' && im.width > im.height);
              if (land) [pw, ph] = [ph, pw];
            }
            const page = pdf.addPage([pw, ph]);
            const k = Math.min((pw - 2 * m) / im.width, (ph - 2 * m) / im.height);
            const w = im.width * k, h = im.height * k;
            page.drawImage(im, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
          }
          res.add(new Blob([await pdf.save()], { type: 'application/pdf' }), (files.length === 1 ? CV.baseName(files[0].name) : 'images') + '.pdf', `${files.length} page${files.length === 1 ? '' : 's'}`);
          st.ok('Done.');
        } catch (e) { st.error(e.message); }
        go.disabled = false;
      };
    }
  });
})(window.CV);
