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
 * Build a mini vertical bar sparkline for the volume days in the window.
 * @param {Array<{volume: number}>} windowDays
 * @returns {string} HTML string
 */
function volumeSparkline(windowDays) {
  const max = Math.max(...windowDays.map(d => d.volume), 1);
  const bars = windowDays.map(d => {
    const pct = Math.round((d.volume / max) * 100);
    return `<div class="spark-bar" style="height:${pct}%"></div>`;
  }).join('');
  return `<div class="sparkline">${bars}</div>`;
}

/**
 * Render sorted stocks into the given DOM container.
 * Replaces any previous content.
 *
 * @param {Array<{symbol: string, avgVolChangePct: number, avgPriceChangePct: number, days: Array<{close: number, volume: number}>}>} stocks
 * @param {HTMLElement} container
 */
function render(stocks, container) {
  if (stocks.length === 0) {
    container.innerHTML = '<p class="empty">No data available for this window.</p>';
    return;
  }

  const rows = stocks.map(stock => {
    const latest = stock.days[stock.days.length - 1];
    const windowDays = stock.days.slice(-(stock.days.length)); // all available days
    const displaySymbol = stock.symbol.replace(/\.TA$/i, '');
    const priceClass = stock.avgPriceChangePct >= 0 ? 'positive' : 'negative';
    const volClass   = stock.avgVolChangePct   >= 0 ? 'positive' : 'negative';
    const priceSign  = stock.avgPriceChangePct >= 0 ? '+' : '';
    const volSign    = stock.avgVolChangePct   >= 0 ? '+' : '';

    return `
      <tr>
        <td><strong>${displaySymbol}</strong></td>
        <td>${latest.close.toFixed(2)}</td>
        <td class="${priceClass}">${priceSign}${stock.avgPriceChangePct.toFixed(2)}%</td>
        <td>
          <div class="vol-cell">
            ${volumeSparkline(windowDays)}
            <span class="vol-latest">${fmtVolume(latest.volume)}</span>
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
          <th>Last Close (ILS)</th>
          <th>Avg Price Δ%</th>
          <th>Volume</th>
          <th>Avg Vol Δ% ↓</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Expose as global for <script> tag usage in index.html
window.render = render;
