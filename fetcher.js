const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/spark';

/**
 * Build the Yahoo Finance spark URL for the given symbols.
 * Always fetches 7d so we have enough days even accounting for weekends/holidays.
 * @param {string[]} symbols
 * @returns {string}
 */
function buildSparkUrl(symbols) {
  return `${BASE_URL}?symbols=${symbols.join(',')}&range=7d&interval=1d`;
}

/**
 * Parse raw Yahoo Finance spark API response into StockData[].
 *
 * StockData shape:
 * { symbol: string, days: Array<{ date: string, close: number, volume: number }> }
 *
 * @param {object} json - raw response from the spark endpoint
 * @returns {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>}
 */
function parseSparkResponse(json) {
  const results = json?.spark?.result ?? [];
  const stocks = [];

  for (const item of results) {
    if (!item?.response?.[0]) continue;

    const symbol = item.symbol;
    const resp = item.response[0];
    const timestamps = resp.timestamp ?? [];
    const quotes = resp.indicators?.quote?.[0] ?? {};
    const closes = quotes.close ?? [];
    const volumes = quotes.volume ?? [];

    const days = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null || volumes[i] == null) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      days.push({ date, close: closes[i], volume: volumes[i] });
    }

    if (days.length > 0) {
      stocks.push({ symbol, days });
    }
  }

  return stocks;
}

/**
 * Fetch OHLCV data for all symbols from Yahoo Finance spark endpoint.
 * Returns StockData[] or throws on network/CORS failure.
 *
 * CORS FALLBACK: If Yahoo blocks browser requests, replace BASE_URL with:
 *   const BASE_URL = 'https://corsproxy.io/?url=https://query1.finance.yahoo.com/v8/finance/spark';
 *
 * @param {string[]} symbols
 * @returns {Promise<Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>>}
 */
async function fetchMarket(symbols) {
  const url = buildSparkUrl(symbols);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }
  const json = await response.json();
  return parseSparkResponse(json);
}

// Expose as globals for <script> tag usage in index.html
window.buildSparkUrl = buildSparkUrl;
window.parseSparkResponse = parseSparkResponse;
window.fetchMarket = fetchMarket;
