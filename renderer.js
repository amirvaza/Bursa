/**
 * Format a volume number into compact human-readable form.
 * @param {number} v
 * @returns {string}
 */
function fmtVolume(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
  return String(v);
}

/**
 * Format a % change value with sign, color class, and 2 decimal places.
 * @param {number|null} pct
 * @returns {{ text: string, cls: string }}
 */
function fmtPct(pct) {
  if (pct === null) return { text: '—', cls: 'muted' };
  const sign = pct >= 0 ? '+' : '';
  const cls  = pct >= 0 ? 'positive' : 'negative';
  return { text: `${sign}${pct.toFixed(2)}%`, cls };
}

/**
 * Find the most recent Mon→Thu weekly change in days[].
 * Returns % change or null if the pair isn't found.
 * @param {Array<{date: string, close: number}>} days
 * @returns {number|null}
 */
function getWeeklyChange(days) {
  // Find most recent Thursday
  const thu = [...days].reverse().find(d => new Date(d.date + 'T00:00:00Z').getUTCDay() === 4);
  if (!thu) return null;

  // Monday of that same week = Thursday - 3 days
  const thuDate = new Date(thu.date + 'T00:00:00Z');
  const monDate = new Date(thuDate);
  monDate.setUTCDate(thuDate.getUTCDate() - 3);
  const monStr = monDate.toISOString().slice(0, 10);

  const mon = days.find(d => d.date === monStr);
  if (!mon || mon.close <= 0) return null;

  return ((thu.close - mon.close) / mon.close) * 100;
}

/**
 * Build an inline SVG line chart from an array of numbers.
 * @param {number[]} values
 * @param {string}   stroke  CSS color
 * @returns {string} SVG HTML string
 */
function lineChart(values, stroke) {
  if (values.length < 2) return '';
  const W = 90, H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - 2 - ((v - min) / range) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${W}" height="${H}" class="linechart" viewBox="0 0 ${W} ${H}">
    <polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Render sorted stocks into the given DOM container.
 *
 * @param {Array} stocks  Enriched stock objects with volChanges[], weeklyChg, totalChg, etc.
 * @param {HTMLElement} container
 * @param {string} volHeader
 * @param {{ col: string, dir: string }} sortState
 * @param {boolean} weekly  Whether weekly (Thu) view is active
 */
function render(stocks, container, volHeader = 'Volume (60d)', sortState = { col: 'volChg0', dir: 'desc' }, weekly = false) {
  if (stocks.length === 0) {
    container.innerHTML = '<p class="empty">No stocks match the current filters.</p>';
    return;
  }

  // Collect vol change date headers from first stock that has them
  const volChangeDates = (stocks.find(s => s.volChanges && s.volChanges.length) || { volChanges: [] })
    .volChanges.map(v => v.date);

  const rows = stocks.map(stock => {
    const latest = stock.days[stock.days.length - 1];

    const weeklyFmt = fmtPct(stock.weeklyChg);
    const totalFmt  = fmtPct(stock.totalChg);

    const chartColor  = stock.weeklyChg === null ? '#64748b' : stock.weeklyChg >= 0 ? '#4ade80' : '#f87171';
    const priceChart  = lineChart(stock.days.map(d => d.close),  chartColor);
    const volumeChart = lineChart(stock.days.map(d => d.volume), '#3b82f6');

    // Vol 5d chart — last 5 days only
    const last5 = stock.days.slice(-5);
    const vol5Chart = lineChart(last5.map(d => d.volume), '#818cf8');

    const displaySymbol = stock.name || stock.id;
    const bizportalUrl = stock.isin
      ? `https://www.bizportal.co.il/capitalmarket/quote/generalview/${stock.isin}`
      : null;

    // 5 individual daily vol Δ% cells
    const volCells = (stock.volChanges || []).map(v => {
      const f = fmtPct(v.pct);
      return `<td class="${f.cls}">${f.text}</td>`;
    }).join('');

    return `
      <tr>
        <td><strong>${bizportalUrl
          ? `<a href="${bizportalUrl}" target="_blank" rel="noopener" class="symbol-link">${displaySymbol}</a>`
          : displaySymbol}</strong></td>
        <td class="muted">${latest.close.toFixed(2)}</td>
        <td>
          <div class="chart-cell">
            ${priceChart}
            <span class="${weeklyFmt.cls}">${weeklyFmt.text}</span>
          </div>
        </td>
        <td class="${totalFmt.cls}">${totalFmt.text}</td>
        <td>
          <div class="chart-cell">
            ${volumeChart}
            <span class="muted">${fmtVolume(latest.volume)}</span>
          </div>
        </td>
        <td>${vol5Chart}</td>
        ${volCells}
      </tr>`;
  }).join('');

  const fixedCols = [
    { key: 'name',         label: 'Name' },
    { key: 'latestClose',  label: 'Price' },
    { key: 'weeklyChg',    label: 'Price · Weekly (Mon→Thu)' },
    { key: 'totalChg',     label: 'Total Δ%' },
    { key: 'latestVolume', label: volHeader },
    { key: null,           label: 'Vol (5d)' },
  ];

  const volDateCols = volChangeDates.map((date, i) => ({
    key:   `volChg${i}`,
    label: `Vol Δ% ${date.slice(5)}`,  // show MM-DD
  }));

  const cols = [...fixedCols, ...volDateCols];

  const headers = cols.map(({ key, label }) => {
    if (!key) return `<th>${label}</th>`;
    const active = sortState.col === key;
    const arrow  = active ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : '';
    const cls    = active ? ' class="th-active"' : '';
    return `<th${cls} onclick="onSortClick('${key}')" style="cursor:pointer">${label}${arrow}</th>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead><tr>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Expose as globals for <script> tag usage in index.html
window.render = render;
window.getWeeklyChange = getWeeklyChange;
