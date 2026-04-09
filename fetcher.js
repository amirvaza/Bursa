/**
 * Load pre-fetched market data from data/latest.json.
 * The file is committed daily by the "Fetch Market Data" GitHub Actions workflow.
 *
 * StockData shape:
 * { symbol: string, days: Array<{ date: string, close: number, volume: number }> }
 *
 * @returns {Promise<Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>>}
 */
async function fetchMarket() {
  const response = await fetch('data/latest.json');
  if (!response.ok) {
    throw new Error('No data yet — go to Actions tab on GitHub and run "Fetch Market Data" manually');
  }
  const json = await response.json();
  return json.stocks || [];
}

window.fetchMarket = fetchMarket;
