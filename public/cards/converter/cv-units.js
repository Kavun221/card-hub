/*
 * ============================================================================
 *  cv-units.js – unit converter (length, weight, temperature, area, volume,
 *  speed, data size, time, energy, pressure) and a colour converter.
 * ============================================================================
 *  UNITS: every unit has a factor to the group's base unit
 *         (length → metre, weight → kilogram …). value_in_B = value_in_A * fA / fB.
 *  Temperature is special (offsets), handled by toC() / fromC().
 *  To add a unit: add [name, factor] to its group, e.g. ['nautical league', 5556].
 * ============================================================================
 */
window.CV = window.CV || {};
(function (CV) {
  'use strict';
  const { el } = HUB;

  const UNITS = {
    Length: [['millimetre (mm)', 0.001], ['centimetre (cm)', 0.01], ['metre (m)', 1], ['kilometre (km)', 1000], ['Norwegian mil (10 km)', 10000], ['inch (in)', 0.0254], ['foot (ft)', 0.3048], ['yard (yd)', 0.9144], ['mile (mi)', 1609.344], ['nautical mile', 1852]],
    Weight: [['milligram (mg)', 1e-6], ['gram (g)', 0.001], ['kilogram (kg)', 1], ['tonne (t)', 1000], ['ounce (oz)', 0.028349523125], ['pound (lb)', 0.45359237], ['stone (st)', 6.35029318]],
    Temperature: [['Celsius (°C)', 'C'], ['Fahrenheit (°F)', 'F'], ['Kelvin (K)', 'K']],
    Area: [['square metre (m²)', 1], ['square kilometre (km²)', 1e6], ['mål (1000 m²)', 1000], ['hectare (ha)', 10000], ['square foot (ft²)', 0.09290304], ['acre', 4046.8564224]],
    Volume: [['millilitre (ml)', 0.001], ['decilitre (dl)', 0.1], ['litre (l)', 1], ['cubic metre (m³)', 1000], ['teaspoon (tsp)', 0.00492892], ['tablespoon (tbsp)', 0.0147868], ['cup (US)', 0.236588], ['gallon (US)', 3.785411784], ['gallon (UK)', 4.54609]],
    Speed: [['m/s', 1], ['km/h', 1 / 3.6], ['mph', 0.44704], ['knot', 0.514444]],
    'Data size': [['byte (B)', 1], ['kilobyte (KB, 1000)', 1e3], ['megabyte (MB, 1000²)', 1e6], ['gigabyte (GB, 1000³)', 1e9], ['terabyte (TB)', 1e12], ['kibibyte (KiB, 1024)', 1024], ['mebibyte (MiB)', 1048576], ['gibibyte (GiB)', 1073741824], ['bit', 0.125], ['megabit (Mb)', 125000]],
    Time: [['second', 1], ['minute', 60], ['hour', 3600], ['day', 86400], ['week', 604800], ['year (365 d)', 31536000]],
    Energy: [['joule (J)', 1], ['kilojoule (kJ)', 1000], ['calorie (kcal)', 4184], ['watt-hour (Wh)', 3600], ['kilowatt-hour (kWh)', 3.6e6]],
    Pressure: [['pascal (Pa)', 1], ['kilopascal (kPa)', 1000], ['bar', 1e5], ['psi', 6894.757], ['atmosphere (atm)', 101325]]
  };
  const toC = (v, u) => (u === 'C' ? v : u === 'F' ? (v - 32) * 5 / 9 : v - 273.15);
  const fromC = (c, u) => (u === 'C' ? c : u === 'F' ? c * 9 / 5 + 32 : c + 273.15);
  const fmt = n => (!isFinite(n) ? '–' : Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(6) : Number(n.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 }).replace(/,/g, ' '));

  CV.addTool({
    id: 'units', group: 'Units', icon: '📏', name: 'Unit converter',
    desc: 'Length, weight, temperature, area, volume, speed, data size, time, energy and pressure.',
    keywords: 'cm inch kg lb celsius fahrenheit km mile mb gb',
    render(panel) {
      const cat = CV.select(Object.keys(UNITS).map(k => [k, k]), 'Length');
      const val = el('input'); val.type = 'text'; val.inputMode = 'decimal'; val.value = '1';
      const from = el('select'), to = el('select');
      const swap = CV.button('⇄', 'btn small'); swap.title = 'Swap';
      const out = el('div', 'unit-out');
      const table = el('div', 'unit-table');
      const fill = () => {
        [from, to].forEach(s => { s.textContent = ''; UNITS[cat.value].forEach(([n], i) => s.append(new Option(n, String(i)))); });
        to.value = String(Math.min(1, UNITS[cat.value].length - 1)); calc();
      };
      const calc = () => {
        const v = Number(String(val.value).replace(/\s/g, '').replace(',', '.'));
        const list = UNITS[cat.value];
        const conv = (i, j) => {
          if (cat.value === 'Temperature') return fromC(toC(v, list[i][1]), list[j][1]);
          return v * list[i][1] / list[j][1];
        };
        if (val.value.trim() === '' || isNaN(v)) { out.textContent = 'Type a number'; table.textContent = ''; return; }
        const i = Number(from.value), j = Number(to.value);
        out.textContent = `${fmt(v)} ${list[i][0]} = ${fmt(conv(i, j))} ${list[j][0]}`;
        table.textContent = '';
        list.forEach((u, k) => { const r = el('div', 'unit-row'); r.append(el('span', '', u[0]), el('b', '', fmt(conv(i, k)))); table.append(r); });
      };
      cat.onchange = fill; [val, from, to].forEach(x => x.addEventListener('input', calc));
      from.onchange = calc; to.onchange = calc;
      swap.onclick = () => { const t = from.value; from.value = to.value; to.value = t; calc(); };
      panel.append(CV.options(CV.field('Type', cat), CV.field('Value', val), CV.field('From', from), swap, CV.field('To', to)), out, el('div', 'note', 'All units:'), table);
      fill();
    }
  });

  CV.addTool({
    id: 'colors', group: 'Units', icon: '🎨', name: 'Colour converter',
    desc: 'HEX ⇄ RGB ⇄ HSL, with a colour picker.',
    keywords: 'hex rgb hsl color colour',
    render(panel) {
      const pick = el('input'); pick.type = 'color'; pick.value = '#0e9aa7';
      const txt = el('input'); txt.value = '#0e9aa7'; txt.placeholder = '#rrggbb, rgb(…) or hsl(…)';
      const out = el('div', 'unit-table');
      const swatch = el('div', 'swatch');
      const show = (r, g, b) => {
        const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
        let h = 0, s = 0;
        if (d) {
          s = d / (1 - Math.abs(2 * l - 1));
          const R = r / 255, G = g / 255, B = b / 255;
          h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
          h = (h * 60 + 360) % 360;
        }
        pick.value = hex; swatch.style.background = hex;
        out.textContent = '';
        [['HEX', hex.toUpperCase()], ['RGB', `rgb(${r}, ${g}, ${b})`], ['HSL', `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`]].forEach(([k, v]) => {
          const row = el('div', 'unit-row'); const c = CV.button('Copy', 'mini');
          c.onclick = () => navigator.clipboard && navigator.clipboard.writeText(v).then(() => HUB.toast('Copied ' + v));
          row.append(el('span', '', k), el('b', '', v), c); out.append(row);
        });
      };
      const parse = s => {
        s = s.trim();
        let m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (m) { let h = m[1]; if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
        m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
        if (m) return m.slice(1, 4).map(v => HUB.clamp(Number(v), 0, 255));
        m = s.match(/^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/i);
        if (m) {
          const h = Number(m[1]) / 360, S = Number(m[2]) / 100, L = Number(m[3]) / 100;
          const f = n => { const k = (n + h * 12) % 12, a = S * Math.min(L, 1 - L); return Math.round(255 * (L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
          return [f(0), f(8), f(4)];
        }
        return null;
      };
      txt.addEventListener('input', () => { const c = parse(txt.value); if (c) show(...c); });
      pick.addEventListener('input', () => { txt.value = pick.value; show(...parse(pick.value)); });
      panel.append(CV.options(CV.field('Colour', pick), CV.field('Or type a colour', txt)), swatch, out);
      show(...parse(txt.value));
    }
  });
})(window.CV);
