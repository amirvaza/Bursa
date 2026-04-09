// app.js — browser entry point
// Depends on globals: fetchMarket (fetcher.js), filterStocks (filter.js), render (renderer.js)

(async () => {
  const statusEl  = document.getElementById('status');
  const countEl   = document.getElementById('count');
  const resultsEl = document.getElementById('results');
  const selectEl  = document.getElementById('window-select');

  function getWindow() {
    return parseInt(selectEl.value, 10);
  }

  // Restore window size from URL param on load
  const params = new URLSearchParams(location.search);
  const savedDays = params.get('days');
  if (savedDays && ['3', '4', '5'].includes(savedDays)) {
    selectEl.value = savedDays;
  }

  // Changing the dropdown reloads the page with the new ?days= param
  selectEl.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('days', selectEl.value);
    location.href = url.toString();
  });

  statusEl.textContent = 'Loading symbols...';

  let symbols;
  try {
    const res = await fetch('stocks.json');
    const config = await res.json();
    symbols = config.symbols;
  } catch (e) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Failed to load stocks.json';
    return;
  }

  const windowDays = getWindow();
  statusEl.textContent = `Fetching ${symbols.length} stocks from Yahoo Finance...`;

  let stocks;
  try {
    stocks = await fetchMarket(symbols);
  } catch (e) {
    statusEl.className = 'status error';
    statusEl.textContent = `Yahoo Finance error: ${e.message}. Try refreshing.`;
    return;
  }

  const filtered = filterStocks(stocks, windowDays);

  countEl.textContent = `${filtered.length} match`;
  statusEl.textContent = `${stocks.length} stocks loaded`;

  render(filtered, resultsEl);
})();
