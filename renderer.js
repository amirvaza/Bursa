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
 * Build an inline SVG line chart from an array of numbers.
 * @param {number[]} values
 * @param {string} stroke  CSS color
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
 */
function render(stocks, container) {
  if (stocks.length === 0) {
    container.innerHTML = '<p class="empty">No stocks match the current filters.</p>';
    return;
  }

  const rows = stocks.map(stock => {
    const latest      = stock.days[stock.days.length - 1];
    const prevDay     = stock.days[stock.days.length - 2];
    const lastDayChg  = prevDay && prevDay.close > 0
      ? ((latest.close - prevDay.close) / prevDay.close * 100)
      : 0;
    const chgSign     = lastDayChg >= 0 ? '+' : '';
    const chgClass    = lastDayChg >= 0 ? 'positive' : 'negative';
    const volClass    = stock.avgVolChangePct >= 0 ? 'positive' : 'negative';
    const volSign     = stock.avgVolChangePct >= 0 ? '+' : '';
    const displaySymbol = stock.symbol.replace(/\.TA$/i, '');

    const priceChart  = lineChart(stock.days.map(d => d.close), lastDayChg >= 0 ? '#4ade80' : '#f87171');
    const volumeChart = lineChart(stock.days.map(d => d.volume), '#3b82f6');

    return `
      <tr>
        <td><strong>${displaySymbol}</strong></td>
        <td>
          <div class="chart-cell">
            ${priceChart}
            <span class="${chgClass}">${chgSign}${lastDayChg.toFixed(2)}%</span>
          </div>
        </td>
        <td>
          <div class="chart-cell">
            ${volumeChart}
            <span class="muted">${fmtVolume(latest.volume)}</span>
          </div>
        </td>
        <td class="${volClass}">${volSign}${stock.avgVolChangePct.toFixed(2)}%</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Price · Last Day Δ</th>
          <th>Volume (10d)</th>
          <th>Avg Vol Δ% ↓</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Expose as global for <script> tag usage in index.html
window.render = render;
