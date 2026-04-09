const YAHOO_SPARK = 'https://query2.finance.yahoo.com/v8/finance/spark';
const BATCH_SIZE = 20; // spark endpoint max symbols per request

/**
 * Build the Yahoo Finance spark URL for a batch of symbols (max 20).
 * @param {string[]} symbols
 * @returns {string}
 */
function buildSparkUrl(symbols) {
  return `${YAHOO_SPARK}?symbols=${symbols.join(',')}&range=7d&interval=1d`;
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
 * Fetch OHLCV data for all symbols, batching into groups of 20 (spark endpoint limit).
 * Batches run in parallel. Returns merged StockData[].
 *
 * @param {string[]} symbols
 * @returns {Promise<Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>>}
 */
async function fetchMarket(symbols) {
  const batches = [];
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE));
  }

  const results = [];
  for (const batch of batches) {
    const response = await fetch(buildSparkUrl(batch));
    if (!response.ok) throw new Error(`Yahoo Finance returned ${response.status}`);
    const json = await response.json();
    results.push(...parseSparkResponse(json));
  }

  return results;
}

// Expose as globals for <script> tag usage in index.html
window.buildSparkUrl = buildSparkUrl;
window.parseSparkResponse = parseSparkResponse;
window.fetchMarket = fetchMarket;
