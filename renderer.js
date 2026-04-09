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
 * @param {Array<{symbol: string, avgVolChangePct: number, avgPriceChangePct: number, days: Array<{date: string, close: number, volume: number}>}>} stocks
 * @param {HTMLElement} container
 * @param {string} volHeader
 */
function render(stocks, container, volHeader = 'Volume (60d)') {
  if (stocks.length === 0) {
    container.innerHTML = '<p class="empty">No stocks match the current filters.</p>';
    return;
  }

  const rows = stocks.map(stock => {
    const latest  = stock.days[stock.days.length - 1];
    const first   = stock.days[0];

    // Weekly change: Mon → Thu of most recent week
    const weeklyChg = getWeeklyChange(stock.days);
    const weekly    = fmtPct(weeklyChg);

    // Total change: first available day → latest day
    const totalChgVal = first.close > 0
      ? ((latest.close - first.close) / first.close * 100)
      : null;
    const total = fmtPct(totalChgVal);

    // Avg vol change
    const volChg = fmtPct(stock.avgVolChangePct);

    // Chart color driven by weekly change
    const chartColor = weeklyChg === null ? '#64748b' : weeklyChg >= 0 ? '#4ade80' : '#f87171';

    const priceChart  = lineChart(stock.days.map(d => d.close),  chartColor);
    const volumeChart = lineChart(stock.days.map(d => d.volume), '#3b82f6');

    const displaySymbol = stock.symbol.replace(/\.TA$/i, '');

    return `
      <tr>
        <td><strong>${displaySymbol}</strong></td>
        <td>
          <div class="chart-cell">
            ${priceChart}
            <span class="${weekly.cls}">${weekly.text}</span>
          </div>
        </td>
        <td class="${total.cls}">${total.text}</td>
        <td>
          <div class="chart-cell">
            ${volumeChart}
            <span class="muted">${fmtVolume(latest.volume)}</span>
          </div>
        </td>
        <td class="${volChg.cls}">${volChg.text}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Price · Weekly (Mon→Thu)</th>
          <th>Total Δ%</th>
          <th>${volHeader}</th>
          <th>Avg Vol Δ% ↓</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Expose as global for <script> tag usage in index.html
window.render = render;
