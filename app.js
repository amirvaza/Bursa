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

function applyAndRender() {
  const windowDays = parseInt(document.getElementById('window-select').value, 10);
  const minVol     = parseMinVolume();

  const sorted   = filterStocks(allStocks, windowDays);
  const filtered = sorted.filter(s => s.days[s.days.length - 1].volume >= minVol);

  document.getElementById('count').textContent = `${filtered.length} shown`;
  render(filtered, document.getElementById('results'));
}

(async () => {
  const statusEl = document.getElementById('status');
  const selectEl = document.getElementById('window-select');
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

  // Volume input: format with commas while typing, re-render on change
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
