/*
 * cv-app.js – starts the Converter card. Loaded last, after every tool file has
 * registered its tools with CV.addTool(). To add a new tool group, add its name to
 * CV.GROUPS in cv-core.js and a new cv-*.js file to index.html (before this file).
 */
(function () {
  'use strict';
  const missing = ['JSZip', 'PDFLib', 'marked'].filter(n => !window[n]);
  if (missing.length) {
    document.getElementById('toolPanel').textContent = 'A library could not be loaded (' + missing.join(', ') + '). If you changed files in vendor/, put the original files back.';
    return;
  }
  CV.start();
})();
