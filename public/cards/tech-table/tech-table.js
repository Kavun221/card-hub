/*
 * ============================================================================
 *  tech-table.js – the Tech Table card (spreadsheet of all cards)
 * ============================================================================
 *  Each card in assets/cards-registry.js becomes one record (row).
 *
 *  COLUMNS below decides which columns exist. To add a column, add one line:
 *    { key: 'version', label: 'Version' }                    -> shows card.version
 *    { key: 'x', label: 'X', value: c => ..., cell: c => ... } -> computed value / custom cell
 *
 *  Functions
 *    rows()            the records after search + sort
 *    render()          draws the table (column letters A, B, C…, row numbers 1, 2, 3…)
 *    sortBy(key)       click on a header: sort by that column, click again = reverse
 *    selectCell(td)    shows the cell's address and text in the formula bar (like Excel)
 *    showInfo(card)    the ⓘ box: what the card does, how to use it, its files
 *    exportCsv()       download the table as a .csv file (opens in Excel)
 * ============================================================================
 */
(function () {
  'use strict';
  const { $, el } = HUB;
  HUB.cardShell('tech-table');

  const STATUS = { ready: 'Ready', soon: 'Coming soon' };
  const COLUMNS = [
    { key: 'name', label: 'Card', cell: c => cardLink(c) },
    { key: 'category', label: 'Category' },
    { key: 'status', label: 'Status', value: c => STATUS[c.status] || c.status, cell: c => el('span', 'pill ' + c.status, STATUS[c.status] || c.status) },
    { key: 'version', label: 'Version' },
    { key: 'added', label: 'Added' },
    { key: 'tagline', label: 'What it is' },
    { key: 'info', label: 'Info', value: () => '', cell: c => infoButton(c), noSort: true }
  ];
  const valueOf = (col, c) => String(col.value ? col.value(c) : c[col.key] ?? '');
  const letter = i => String.fromCharCode(65 + i);          // 0 -> A, 1 -> B …

  let sortKey = null, sortDir = 1;

  function cardLink(c) {
    if (c.status !== 'ready' || !c.path) return el('span', 'muted', `${c.icon || ''} ${c.name}`);
    const a = el('a', 'card-link', `${c.icon || ''} ${c.name}`);
    a.href = HUB.cardUrl(c);
    return a;
  }
  function infoButton(c) {
    const b = el('button', 'info-btn', 'ⓘ');
    b.type = 'button';
    b.title = `What does ${c.name} do?`;
    b.setAttribute('aria-label', b.title);
    b.onclick = e => { e.stopPropagation(); showInfo(c); };
    return b;
  }

  function rows() {
    const q = $('#search').value.trim().toLowerCase();
    let list = (window.HUB_CARDS || []).filter(c => !q || COLUMNS.some(col => valueOf(col, c).toLowerCase().includes(q)) || (c.description || '').toLowerCase().includes(q));
    if (sortKey) {
      const col = COLUMNS.find(x => x.key === sortKey);
      list = list.slice().sort((a, b) => valueOf(col, a).localeCompare(valueOf(col, b), undefined, { numeric: true }) * sortDir);
    }
    return list;
  }

  function render() {
    const t = $('#sheet');
    t.textContent = '';
    // row 0: column letters
    const letters = el('tr', 'letters');
    letters.append(el('th', 'corner', ''));
    COLUMNS.forEach((col, i) => letters.append(el('th', '', letter(i))));
    // row 1: column names (click to sort)
    const head = el('tr', 'head');
    head.append(el('th', 'rownum', '1'));
    COLUMNS.forEach(col => {
      const th = el('th', '', col.label);
      if (!col.noSort) {
        th.classList.add('sortable');
        th.tabIndex = 0;
        if (sortKey === col.key) th.append(el('span', 'arrow', sortDir > 0 ? ' ▲' : ' ▼'));
        th.onclick = () => sortBy(col.key);
        th.onkeydown = e => { if (e.key === 'Enter') sortBy(col.key); };
      }
      head.append(th);
    });
    const thead = el('thead'); thead.append(letters, head);
    const tbody = el('tbody');
    const list = rows();
    list.forEach((c, r) => {
      const tr = el('tr');
      tr.append(el('th', 'rownum', String(r + 2)));
      COLUMNS.forEach((col, i) => {
        const td = el('td');
        if (col.cell) td.append(col.cell(c)); else td.textContent = valueOf(col, c);
        td.dataset.addr = letter(i) + (r + 2);
        td.dataset.value = col.key === 'info' ? (c.description || '') : valueOf(col, c);
        td.onclick = () => selectCell(td);
        tr.append(td);
      });
      tbody.append(tr);
    });
    t.append(thead, tbody);
    const all = (window.HUB_CARDS || []).length;
    $('#status').textContent = `${list.length} of ${all} records · ${(window.HUB_CARDS || []).filter(c => c.status === 'ready').length} ready` + (sortKey ? ` · sorted by ${COLUMNS.find(c => c.key === sortKey).label}` : '');
  }

  function sortBy(key) {
    if (sortKey === key) sortDir = -sortDir; else { sortKey = key; sortDir = 1; }
    render();
  }

  function selectCell(td) {
    document.querySelectorAll('.sheet td.sel').forEach(x => x.classList.remove('sel'));
    td.classList.add('sel');
    $('#fxCell').textContent = td.dataset.addr;
    $('#fxValue').textContent = td.dataset.value;
  }

  function showInfo(c) {
    $('#iIcon').textContent = c.icon || '★';
    $('#iName').textContent = c.name;
    $('#iMeta').textContent = [c.category, STATUS[c.status], c.version !== '–' ? 'v' + c.version : '', c.added ? 'added ' + c.added : ''].filter(Boolean).join(' · ');
    $('#iDesc').textContent = c.status === 'ready' ? c.description : 'This card will come soon.';
    const how = $('#iHow'); how.textContent = '';
    (c.howTo || []).forEach(h => how.append(el('li', '', h)));
    $('#iHowWrap').hidden = !(c.howTo || []).length;
    const files = $('#iFiles'); files.textContent = '';
    (c.files || []).forEach(f => files.append(el('li', '', f)));
    $('#iFilesWrap').hidden = !(c.files || []).length;
    const open = $('#iOpen');
    open.hidden = c.status !== 'ready';
    if (c.status === 'ready') open.href = HUB.cardUrl(c);
    $('#info').showModal();
  }

  function exportCsv() {
    const cols = COLUMNS.filter(c => c.key !== 'info').concat([{ key: 'description', label: 'Description' }, { key: 'path', label: 'Path' }]);
    // quote every cell; a leading = + - @ is neutralised so Excel can't treat text as a formula
    const cell = v => '"' + String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""') + '"';
    const lines = [cols.map(c => cell(c.label)).join(',')].concat(rows().map(r => cols.map(c => cell(valueOf(c, r))).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tech-table.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  $('#iClose').addEventListener('click', () => $('#info').close());
  $('#info').addEventListener('click', e => { if (e.target === $('#info')) $('#info').close(); });   // click outside = close
  $('#search').addEventListener('input', render);
  $('#csv').addEventListener('click', exportCsv);
  render();
})();
