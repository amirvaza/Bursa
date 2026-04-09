/**
 * Sort all stocks by average daily volume % change over the last `windowDays` days.
 * No filtering — all stocks with enough data are included.
 * Attaches avgVolChangePct and avgPriceChangePct to each stock.
 *
 * Requires windowDays + 1 data points (baseline + windowDays comparisons).
 *
 * @param {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>} stocks
 * @param {number} windowDays
 * @returns {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>, avgVolChangePct: number, avgPriceChangePct: number}>}
 */
function filterStocks(stocks, windowDays) {
  const results = [];

  for (const stock of stocks) {
    if (stock.days.length < windowDays + 1) continue;

    const window = stock.days.slice(-(windowDays + 1));

    let totalVolChangePct = 0;
    let totalPriceChangePct = 0;

    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1];
      const curr = window[i];
      if (prev.volume > 0) totalVolChangePct   += ((curr.volume - prev.volume) / prev.volume) * 100;
      if (prev.close  > 0) totalPriceChangePct += ((curr.close  - prev.close)  / prev.close)  * 100;
    }

    results.push({
      ...stock,
      avgVolChangePct:   Math.round((totalVolChangePct   / windowDays) * 100) / 100,
      avgPriceChangePct: Math.round((totalPriceChangePct / windowDays) * 100) / 100,
    });
  }

  return results.sort((a, b) => b.avgVolChangePct - a.avgVolChangePct);
}

// Expose as global for <script> tag usage in index.html
window.filterStocks = filterStocks;
