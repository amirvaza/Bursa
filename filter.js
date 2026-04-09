/**
 * Filter and sort stocks by the following criteria over the last `windowDays` days:
 * - Every day's close > previous day's close (price rising each day)
 * - Every day's volume >= previous day's volume (volume non-decreasing each day)
 *
 * Requires windowDays + 1 data points (the baseline + windowDays comparisons).
 * Returns a new array sorted by average daily close change (%) descending.
 *
 * @param {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>} stocks
 * @param {number} windowDays
 * @returns {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>, avgChangePct: number}>}
 */
function filterStocks(stocks, windowDays) {
  const results = [];

  for (const stock of stocks) {
    // Need windowDays + 1 entries: baseline day + windowDays comparison days
    if (stock.days.length < windowDays + 1) continue;

    const window = stock.days.slice(-(windowDays + 1));

    let allPositive = true;
    let volumeNonDecreasing = true;
    let totalChangePct = 0;

    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1];
      const curr = window[i];

      if (curr.close <= prev.close) { allPositive = false; break; }
      if (curr.volume < prev.volume) { volumeNonDecreasing = false; break; }

      totalChangePct += ((curr.close - prev.close) / prev.close) * 100;
    }

    if (allPositive && volumeNonDecreasing) {
      results.push({
        ...stock,
        avgChangePct: Math.round((totalChangePct / windowDays) * 100) / 100,
      });
    }
  }

  return results.sort((a, b) => b.avgChangePct - a.avgChangePct);
}

// Expose as global for <script> tag usage in index.html
window.filterStocks = filterStocks;
