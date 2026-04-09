// app.js — browser entry point
// Depends on globals: fetchMarket (fetcher.js), filterStocks (filter.js), render, getWeeklyChange (renderer.js)

let allStocks  = [];
let sortState  = { col: 'avgVolChangePct', dir: 'desc' };

function parseMinVolume() {
  const raw = document.getElementById('min-volume').value.replace(/,/g, '');
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

function formatWithCommas(input) {
  const digits = input.value.replace(/\D/g, '');
  input.value = digits ? parseInt(digits, 10).toLocaleString('en-US') : '';
}

function toThursdays(days) {
  return days.filter(d => new Date(d.date + 'T00:00:00Z').getUTCDay() === 4);
}

// Enrich each stock with pre-computed sort keys
function enrich(stock) {
  const first  = stock.days[0];
  const latest = stock.days[stock.days.length - 1];
  const weeklyChg = getWeeklyChange(stock.days);
  const totalChg  = first && first.close > 0
    ? ((latest.close - first.close) / first.close * 100)
    : null;
  return { ...stock, weeklyChg, totalChg, latestVolume: latest.volume };
}

function sortBy(stocks) {
  const { col, dir } = sortState;
  const mult = dir === 'desc' ? -1 : 1;
  return [...stocks].sort((a, b) => {
    if (col === 'symbol') return mult * a.symbol.localeCompare(b.symbol);
    const av = a[col] ?? (dir === 'desc' ? -Infinity : Infinity);
    const bv = b[col] ?? (dir === 'desc' ? -Infinity : Infinity);
    return mult * (av - bv);
  });
}

function applyAndRender() {
  const windowDays = parseInt(document.getElementById('window-select').value, 10);
  const minVol     = parseMinVolume();
  const weekly     = document.getElementById('view-select').value === 'weekly';

  // Sort by avg vol change, then enrich with all metrics
  let stocks = filterStocks(allStocks, windowDays).map(enrich);

  // Weekly mode: filter chart days to Thursdays only
  if (weekly) {
    stocks = stocks
      .map(s => ({ ...s, days: toThursdays(s.days) }))
      .filter(s => s.days.length >= 2);
  }

  // Min volume filter
  stocks = stocks.filter(s => s.latestVolume >= minVol);

  // Apply active sort
  stocks = sortBy(stocks);

  const volHeader = weekly ? 'Volume (weekly · Thu)' : 'Volume (60d)';

  document.getElementById('count').textContent = `${stocks.length} shown`;
  render(stocks, document.getElementById('results'), volHeader, sortState);
}

// Called by renderer header clicks
window.onSortClick = (col) => {
  if (sortState.col === col) {
    sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
  } else {
    sortState.col = col;
    sortState.dir = 'desc';
  }
  applyAndRender();
};

(async () => {
  const statusEl = document.getElementById('status');
  const selectEl = document.getElementById('window-select');
  const viewEl   = document.getElementById('view-select');
  const volInput = document.getElementById('min-volume');

  const params = new URLSearchParams(location.search);
  const savedDays = params.get('days');
  if (savedDays && ['3', '4', '5'].includes(savedDays)) selectEl.value = savedDays;

  selectEl.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('days', selectEl.value);
    location.href = url.toString();
  });

  viewEl.addEventListener('change', applyAndRender);

  volInput.addEventListener('input', () => {
    formatWithCommas(volInput);
    applyAndRender();
  });

  statusEl.textContent = 'Loading market data...';

  try {
    allStocks = await fetchMarket();
  } catch (e) {
    statusEl.className = 'status error';
    statusEl.textContent = e.message;
    return;
  }

  statusEl.textContent = `${allStocks.length} stocks loaded`;
  applyAndRender();
})();
