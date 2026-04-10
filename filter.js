/**
 * Return all stocks that have at least 2 days of data.
 * No filtering or sorting — app.js handles all of that.
 *
 * @param {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>} stocks
 * @returns {Array}
 */
function filterStocks(stocks) {
  return stocks.filter(s => s.days.length >= 2);
}

// Expose as global for <script> tag usage in index.html
window.filterStocks = filterStocks;
