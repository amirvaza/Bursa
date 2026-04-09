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
 * Render filtered stocks into the given DOM container.
 * Replaces any previous content.
 *
 * @param {Array<{symbol: string, avgChangePct: number, days: Array<{close: number, volume: number}>}>} stocks
 * @param {HTMLElement} container
 */
function render(stocks, container) {
  if (stocks.length === 0) {
    container.innerHTML = '<p class="empty">No stocks matched the filter for this window.</p>';
    return;
  }

  const maxVolume = Math.max(...stocks.map(s => s.days[s.days.length - 1].volume), 1);

  const rows = stocks.map(stock => {
    const latest = stock.days[stock.days.length - 1];
    const first  = stock.days[0];
    const volGrowthPct = first.volume > 0
      ? Math.round(((latest.volume - first.volume) / first.volume) * 100)
      : 0;
    const barPct = Math.round((latest.volume / maxVolume) * 100);
    const displaySymbol = stock.symbol.replace(/\.TA$/i, '');

    return `
      <tr>
        <td><strong>${displaySymbol}</strong></td>
        <td>${latest.close.toFixed(2)}</td>
        <td class="positive">+${stock.avgChangePct.toFixed(2)}%</td>
        <td>
          <div class="vol-cell">
            <span>${fmtVolume(latest.volume)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${barPct}%"></div></div>
            <span class="vol-growth">+${volGrowthPct}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Last Close (ILS)</th>
          <th>Avg Δ% (window)</th>
          <th>Volume (latest · trend)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Expose as global for <script> tag usage in index.html
window.render = render;
