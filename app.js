// app.js — browser entry point
// Depends on globals: fetchMarket (fetcher.js), filterStocks (filter.js), render (renderer.js)

let allStocks = [];

function parseMinVolume() {
  const raw = document.getElementById('min-volume').value.replace(/,/g, '');
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

function formatWithCommas(input) {
  const digits = input.value.replace(/\D/g, '');
  input.value = digits ? parseInt(digits, 10).toLocaleString('en-US') : '';
}

// Returns only Thursday data points (day 4 in UTC, Israel's last trading day of the week)
function toThursdays(days) {
  return days.filter(d => new Date(d.date + 'T00:00:00Z').getUTCDay() === 4);
}

function applyAndRender() {
  const windowDays = parseInt(document.getElementById('window-select').value, 10);
  const minVol     = parseMinVolume();
  const weekly     = document.getElementById('view-select').value === 'weekly';

  // Sort all stocks by avg volume change over the window
  const sorted = filterStocks(allStocks, windowDays);

  // For weekly mode: filter each stock's days to Thursdays only (for chart display)
  const display = weekly
    ? sorted.map(s => ({ ...s, days: toThursdays(s.days) })).filter(s => s.days.length >= 2)
    : sorted;

  // Apply minimum volume filter (against latest available day)
  const filtered = display.filter(s => s.days[s.days.length - 1]?.volume >= minVol);

  const volHeader = weekly ? 'Volume (weekly · Thu)' : 'Volume (60d)';

  document.getElementById('count').textContent = `${filtered.length} shown`;
  render(filtered, document.getElementById('results'), volHeader);
}

(async () => {
  const statusEl = document.getElementById('status');
  const selectEl = document.getElementById('window-select');
  const viewEl   = document.getElementById('view-select');
  const volInput = document.getElementById('min-volume');

  // Restore window from URL param
  const params = new URLSearchParams(location.search);
  const savedDays = params.get('days');
  if (savedDays && ['3', '4', '5'].includes(savedDays)) selectEl.value = savedDays;

  // Window change → reload page to persist in URL
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
