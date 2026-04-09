# TASE Static Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-infrastructure static dashboard (GitHub Pages) that fetches the entire TASE market history directly from Yahoo Finance and shows stocks that were price-positive with increasing volume over a configurable window.

**Architecture:** On page load, the browser makes two calls to Yahoo Finance — one to get stock metadata, one to the `spark` endpoint for multi-symbol OHLCV history. All filtering and rendering happens client-side in vanilla JS. GitHub Actions auto-deploys on push to main. No backend, no API key, no AWS.

**Tech Stack:** Vanilla HTML/CSS/JS · Yahoo Finance spark API (unofficial, free, no key) · Jest (Node) for unit tests · GitHub Pages + GitHub Actions

---

## Known Risk

Yahoo Finance's spark endpoint sends `Access-Control-Allow-Origin: *` headers and works from browsers in practice. It is an unofficial API — if Yahoo removes CORS headers, the fix is wrapping the URL with a free CORS proxy (e.g. `https://corsproxy.io/?url=...`). This is a one-line change in `fetcher.js` and is documented in Task 2.

---

## File Structure

```
Bursa/
├── index.html                  # Page shell: controls + table container
├── app.js                      # Entry point: wires fetcher → filter → renderer
├── fetcher.js                  # Yahoo Finance spark API call + response parsing
├── filter.js                   # Pure filter logic: positive days + rising volume
├── renderer.js                 # DOM rendering: table rows, sort, empty state
├── styles.css                  # Dark theme table UI
├── stocks.json                 # Curated list of TASE symbols (~120 stocks)
├── package.json                # Jest dev dependency only
├── jest.config.js              # Jest config (ESM or CJS)
└── .github/
    └── workflows/
        └── pages.yml           # Auto-deploy to GitHub Pages on push to main
```

**Interfaces between files:**
- `fetcher.js` exports `fetchMarket(symbols, days) → Promise<StockData[]>`
- `filter.js` exports `filterStocks(stocks, windowDays) → StockData[]`
- `renderer.js` exports `render(stocks, container)` — writes DOM, no return value
- `app.js` calls all three in sequence; owns the window-size control and loading state

**StockData shape** (used across all modules):
```js
{
  symbol: "TEVA.TA",
  days: [
    { date: "2026-04-01", close: 44.10, volume: 1_000_000 },
    { date: "2026-04-02", close: 44.80, volume: 1_200_000 },
    { date: "2026-04-03", close: 45.20, volume: 1_350_000 },
  ]
}
```

---

## Task 1: Repo scaffold

**Files:**
- Create: `stocks.json`
- Create: `package.json`
- Create: `jest.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "bursa",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 3: Create `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
};
```

- [ ] **Step 4: Create `stocks.json`**

These are TA-125 constituents and additional liquid names. Add/remove symbols here to change what the dashboard tracks.

```json
{
  "symbols": [
    "TEVA.TA", "NICE.TA", "CHKP.TA", "FVRR.TA", "MNDY.TA",
    "ICL.TA", "ESLT.TA", "ELBIT.TA", "HAPOALIM.TA", "LUMI.TA",
    "DISCOUNT.TA", "MIZRAHI.TA", "FIBI.TA", "IDB.TA",
    "AZRIELI.TA", "MELISRON.TA", "AMOT.TA", "GEV.TA",
    "ORL.TA", "SANO.TA", "DLEKG.TA", "POLI.TA",
    "BCOM.TA", "ALHE.TA", "ENLT.TA", "DRAL.TA",
    "MGDL.TA", "SMTS.TA", "FORTY.TA", "ILCO.TA",
    "HOT.TA", "BEZQ.TA", "CLBV.TA", "SPNS.TA",
    "NWMD.TA", "KARE.TA", "MZTF.TA", "ARPT.TA"
  ]
}
```

- [ ] **Step 5: Install Jest**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add stocks.json package.json package-lock.json jest.config.js .gitignore
git commit -m "chore: project scaffold with Jest and TASE symbol list"
```

---

## Task 2: Yahoo Finance fetcher

**Files:**
- Create: `fetcher.js`
- Create: `fetcher.test.js`

The Yahoo Finance `spark` endpoint takes a comma-separated list of symbols and returns close prices + volume for the requested range in one response.

URL: `https://query1.finance.yahoo.com/v8/finance/spark?symbols=TEVA.TA,NICE.TA&range=7d&interval=1d`

- [ ] **Step 1: Write failing tests**

Create `fetcher.test.js`:
```js
const { parseSparkResponse, buildSparkUrl } = require('./fetcher');

// Minimal mock of the Yahoo Finance spark API response
const MOCK_RESPONSE = {
  spark: {
    result: [
      {
        symbol: 'TEVA.TA',
        response: [{
          meta: { symbol: 'TEVA.TA' },
          timestamp: [1743465600, 1743552000, 1743638400],
          indicators: {
            quote: [{
              close: [44.10, 44.80, 45.20],
              volume: [1000000, 1200000, 1350000]
            }]
          }
        }]
      },
      {
        symbol: 'NICE.TA',
        response: [{
          meta: { symbol: 'NICE.TA' },
          timestamp: [1743465600, 1743552000, 1743638400],
          indicators: {
            quote: [{
              close: [200.0, 198.5, 197.0],
              volume: [500000, 480000, 460000]
            }]
          }
        }]
      }
    ],
    error: null
  }
};

test('buildSparkUrl includes all symbols and correct range', () => {
  const url = buildSparkUrl(['TEVA.TA', 'NICE.TA'], 5);
  expect(url).toContain('symbols=TEVA.TA%2CNICE.TA');
  expect(url).toContain('range=7d');
  expect(url).toContain('interval=1d');
});

test('parseSparkResponse returns one StockData per symbol', () => {
  const result = parseSparkResponse(MOCK_RESPONSE);
  expect(result).toHaveLength(2);
  expect(result[0].symbol).toBe('TEVA.TA');
  expect(result[1].symbol).toBe('NICE.TA');
});

test('parseSparkResponse maps timestamps to ISO date strings', () => {
  const result = parseSparkResponse(MOCK_RESPONSE);
  const teva = result.find(s => s.symbol === 'TEVA.TA');
  expect(teva.days[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('parseSparkResponse maps close and volume correctly', () => {
  const result = parseSparkResponse(MOCK_RESPONSE);
  const teva = result.find(s => s.symbol === 'TEVA.TA');
  expect(teva.days).toHaveLength(3);
  expect(teva.days[0].close).toBe(44.10);
  expect(teva.days[0].volume).toBe(1000000);
  expect(teva.days[2].close).toBe(45.20);
});

test('parseSparkResponse skips symbols with null/missing response', () => {
  const brokenResponse = {
    spark: {
      result: [
        { symbol: 'BROKEN.TA', response: null },
        ...MOCK_RESPONSE.spark.result
      ],
      error: null
    }
  };
  const result = parseSparkResponse(brokenResponse);
  expect(result.find(s => s.symbol === 'BROKEN.TA')).toBeUndefined();
  expect(result).toHaveLength(2);
});

test('parseSparkResponse skips null values inside close array', () => {
  const responseWithNulls = {
    spark: {
      result: [{
        symbol: 'TEVA.TA',
        response: [{
          meta: { symbol: 'TEVA.TA' },
          timestamp: [1743465600, 1743552000, 1743638400],
          indicators: {
            quote: [{
              close: [44.10, null, 45.20],
              volume: [1000000, null, 1350000]
            }]
          }
        }]
      }],
      error: null
    }
  };
  const result = parseSparkResponse(responseWithNulls);
  // null entries are dropped
  expect(result[0].days).toHaveLength(2);
  expect(result[0].days.every(d => d.close !== null)).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest fetcher.test.js
```

Expected: `Cannot find module './fetcher'`

- [ ] **Step 3: Implement `fetcher.js`**

```js
const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/spark';

/**
 * Build the Yahoo Finance spark URL for the given symbols and window.
 * We always fetch 7d so we have enough days even if some are weekends/holidays.
 * @param {string[]} symbols
 * @param {number} _windowDays - unused in URL (always fetch 7d buffer), kept for clarity
 * @returns {string}
 */
function buildSparkUrl(symbols, _windowDays) {
  const encoded = encodeURIComponent(symbols.join(','));
  return `${BASE_URL}?symbols=${encoded}&range=7d&interval=1d`;
}

/**
 * Parse raw Yahoo Finance spark API response into StockData[].
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
 * Fetch OHLCV data for all symbols from Yahoo Finance.
 * Returns StockData[] or throws on network/CORS failure.
 *
 * CORS FALLBACK: If Yahoo blocks browser requests, replace BASE_URL with:
 *   const BASE_URL = 'https://corsproxy.io/?url=https://query1.finance.yahoo.com/v8/finance/spark';
 *
 * @param {string[]} symbols
 * @param {number} windowDays
 * @returns {Promise<Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>>}
 */
async function fetchMarket(symbols, windowDays) {
  const url = buildSparkUrl(symbols, windowDays);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }
  const json = await response.json();
  return parseSparkResponse(json);
}

module.exports = { fetchMarket, parseSparkResponse, buildSparkUrl };
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest fetcher.test.js
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add fetcher.js fetcher.test.js
git commit -m "feat: Yahoo Finance spark fetcher with response parser"
```

---

## Task 3: Filter logic

**Files:**
- Create: `filter.js`
- Create: `filter.test.js`

A stock passes the filter when, for the last `windowDays` trading days in its data:
1. Every day's close is **higher than the previous day's close** (price positive)
2. Every day's volume is **≥ the previous day's volume** (volume non-decreasing)

- [ ] **Step 1: Write failing tests**

Create `filter.test.js`:
```js
const { filterStocks } = require('./filter');

function makeStock(symbol, closes, volumes) {
  const days = closes.map((close, i) => ({
    date: `2026-04-0${i + 1}`,
    close,
    volume: volumes[i],
  }));
  return { symbol, days };
}

test('passes stock where close rises every day in window', () => {
  const stocks = [makeStock('TEVA.TA', [40, 41, 42, 43], [1000, 1100, 1200, 1300])];
  expect(filterStocks(stocks, 3)).toHaveLength(1);
});

test('rejects stock where close drops on one day', () => {
  const stocks = [makeStock('TEVA.TA', [40, 41, 40, 43], [1000, 1100, 1200, 1300])];
  expect(filterStocks(stocks, 3)).toHaveLength(0);
});

test('rejects stock where volume drops on one day', () => {
  const stocks = [makeStock('TEVA.TA', [40, 41, 42, 43], [1000, 1100, 900, 1300])];
  expect(filterStocks(stocks, 3)).toHaveLength(0);
});

test('accepts stock where volume stays flat (non-decreasing)', () => {
  const stocks = [makeStock('TEVA.TA', [40, 41, 42, 43], [1000, 1000, 1000, 1000])];
  expect(filterStocks(stocks, 3)).toHaveLength(1);
});

test('uses only the last windowDays days, ignores older data', () => {
  // First day is bad, but window=3 only looks at last 3 days
  const stocks = [makeStock('TEVA.TA', [50, 40, 41, 42, 43], [2000, 1000, 1100, 1200, 1300])];
  expect(filterStocks(stocks, 3)).toHaveLength(1);
});

test('rejects stock with fewer days than windowDays', () => {
  const stocks = [makeStock('TEVA.TA', [40, 41], [1000, 1100])];
  expect(filterStocks(stocks, 3)).toHaveLength(0);
});

test('filters multiple stocks correctly', () => {
  const good = makeStock('GOOD.TA', [40, 41, 42, 43], [1000, 1100, 1200, 1300]);
  const bad  = makeStock('BAD.TA',  [40, 41, 40, 43], [1000, 1100, 1200, 1300]);
  const result = filterStocks([good, bad], 3);
  expect(result).toHaveLength(1);
  expect(result[0].symbol).toBe('GOOD.TA');
});

test('returns stocks sorted by avg close change descending', () => {
  const strong = makeStock('STRONG.TA', [100, 103, 106, 110], [1000, 1100, 1200, 1300]);
  const weak   = makeStock('WEAK.TA',   [100, 101, 102, 103], [1000, 1100, 1200, 1300]);
  const result = filterStocks([weak, strong], 3);
  expect(result[0].symbol).toBe('STRONG.TA');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest filter.test.js
```

Expected: `Cannot find module './filter'`

- [ ] **Step 3: Implement `filter.js`**

```js
/**
 * Filter and sort stocks by the following criteria over the last `windowDays` days:
 * - Every day's close > previous day's close (price rising)
 * - Every day's volume >= previous day's volume (volume non-decreasing)
 *
 * Returns a new array sorted by average daily close change (%) descending.
 *
 * @param {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>}>} stocks
 * @param {number} windowDays
 * @returns {Array<{symbol: string, days: Array<{date: string, close: number, volume: number}>, avgChangePct: number}>}
 */
function filterStocks(stocks, windowDays) {
  const results = [];

  for (const stock of stocks) {
    // Need windowDays + 1 entries: the baseline day plus windowDays comparison days
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

module.exports = { filterStocks };
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest filter.test.js
```

Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add filter.js filter.test.js
git commit -m "feat: filter logic for positive price and rising volume"
```

---

## Task 4: Renderer

**Files:**
- Create: `renderer.js`
- Create: `renderer.test.js`

The renderer writes HTML into a container element. Tests use jsdom (built into Jest with `testEnvironment: 'jsdom'`).

- [ ] **Step 1: Update `jest.config.js` to use jsdom for renderer tests only**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['**/fetcher.test.js', '**/filter.test.js'],
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['**/renderer.test.js'],
    },
  ],
};
```

- [ ] **Step 2: Write failing tests**

Create `renderer.test.js`:
```js
const { render } = require('./renderer');

function makeFilteredStock(symbol, close, avgChangePct, volumeLatest, volumeFirst) {
  return {
    symbol,
    avgChangePct,
    days: [
      { date: '2026-04-01', close: close - 2, volume: volumeFirst },
      { date: '2026-04-02', close: close - 1, volume: Math.round(volumeLatest * 0.9) },
      { date: '2026-04-03', close: close,      volume: volumeLatest },
    ],
  };
}

test('renders one row per stock', () => {
  const container = document.createElement('div');
  const stocks = [
    makeFilteredStock('TEVA.TA', 45.2, 0.89, 1_350_000, 1_000_000),
    makeFilteredStock('NICE.TA', 200.0, 1.2, 600_000, 500_000),
  ];
  render(stocks, container);
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
});

test('renders symbol without .TA suffix', () => {
  const container = document.createElement('div');
  render([makeFilteredStock('TEVA.TA', 45.2, 0.89, 1_350_000, 1_000_000)], container);
  expect(container.textContent).toContain('TEVA');
  expect(container.textContent).not.toContain('TEVA.TA');
});

test('renders avgChangePct with + sign', () => {
  const container = document.createElement('div');
  render([makeFilteredStock('TEVA.TA', 45.2, 0.89, 1_350_000, 1_000_000)], container);
  expect(container.textContent).toContain('+0.89%');
});

test('renders empty state message when no stocks', () => {
  const container = document.createElement('div');
  render([], container);
  expect(container.textContent).toContain('No stocks matched');
});

test('renders volume in compact format', () => {
  const container = document.createElement('div');
  render([makeFilteredStock('TEVA.TA', 45.2, 0.89, 1_350_000, 1_000_000)], container);
  expect(container.textContent).toContain('1.4M');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest renderer.test.js
```

Expected: `Cannot find module './renderer'`

- [ ] **Step 4: Implement `renderer.js`**

```js
/**
 * Format a volume number into compact human-readable form.
 * @param {number} v
 * @returns {string}
 */
function fmtVolume(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K';
  return String(v);
}

/**
 * Render filtered stocks into the given DOM container.
 * Replaces any previous content.
 *
 * @param {Array<{symbol: string, avgChangePct: number, days: Array<{close: number, volume: number}>}>} stocks
 * @param {HTMLElement} container
 */
function render(stocks, container) {
  if (stocks.length === 0) {
    container.innerHTML = '<p class="empty">No stocks matched the filter for this window.</p>';
    return;
  }

  const maxVolume = Math.max(...stocks.map(s => s.days[s.days.length - 1].volume), 1);

  const rows = stocks.map(stock => {
    const latest = stock.days[stock.days.length - 1];
    const first  = stock.days[0];
    const volGrowthPct = first.volume > 0
      ? Math.round(((latest.volume - first.volume) / first.volume) * 100)
      : 0;
    const barPct = Math.round((latest.volume / maxVolume) * 100);
    const displaySymbol = stock.symbol.replace(/\.TA$/i, '');

    return `
      <tr>
        <td><strong>${displaySymbol}</strong></td>
        <td>${latest.close.toFixed(2)}</td>
        <td class="positive">+${stock.avgChangePct.toFixed(2)}%</td>
        <td>
          <div class="vol-cell">
            <span>${fmtVolume(latest.volume)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${barPct}%"></div></div>
            <span class="vol-growth">+${volGrowthPct}%</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Last Close (ILS)</th>
          <th>Avg Δ% (window)</th>
          <th>Volume (latest · trend)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

module.exports = { render, fmtVolume };
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx jest renderer.test.js
```

Expected: `5 passed`

- [ ] **Step 6: Run all tests**

```bash
npx jest
```

Expected: `18 passed` (5 fetcher + 8 filter + 5 renderer)

- [ ] **Step 7: Commit**

```bash
git add renderer.js renderer.test.js jest.config.js
git commit -m "feat: DOM renderer with compact volume display and empty state"
```

---

## Task 5: Styles

**Files:**
- Create: `styles.css`

No tests — visual output. Verify by opening `index.html` in a browser in Task 6.

- [ ] **Step 1: Create `styles.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  padding: 28px 32px;
  max-width: 960px;
  margin: 0 auto;
}

h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 4px; }
.subtitle { color: #64748b; font-size: 0.85rem; margin-bottom: 24px; }

.controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.controls label { font-size: 0.85rem; color: #94a3b8; }

.controls select {
  background: #1e2533;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 0.85rem;
  cursor: pointer;
}

.badge {
  background: #14291f;
  color: #4ade80;
  border-radius: 99px;
  padding: 3px 12px;
  font-size: 0.78rem;
  font-weight: 600;
}

.status {
  font-size: 0.82rem;
  color: #64748b;
}

.status.error { color: #f87171; }

table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }

th {
  text-align: left;
  padding: 9px 14px;
  background: #161c27;
  color: #64748b;
  font-weight: 500;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

td { padding: 9px 14px; border-bottom: 1px solid #161c27; }
tr:hover td { background: #141920; }

.positive { color: #4ade80; }

.vol-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-track {
  flex: 1;
  background: #1e2533;
  border-radius: 3px;
  height: 5px;
  min-width: 50px;
}

.bar-fill {
  background: #3b82f6;
  border-radius: 3px;
  height: 5px;
}

.vol-growth { color: #3b82f6; font-size: 0.78rem; white-space: nowrap; }

.empty {
  color: #64748b;
  text-align: center;
  padding: 48px 0;
  font-size: 0.9rem;
}
```

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "feat: dark theme styles for dashboard table"
```

---

## Task 6: Wire it together — `app.js` and `index.html`

**Files:**
- Create: `app.js`
- Create: `index.html`

`app.js` is the browser entry point. It is not tested with Jest (it directly manipulates `document`) — it is verified by opening `index.html` locally.

- [ ] **Step 1: Create `app.js`**

```js
// app.js runs in the browser — no require(), uses ES module globals
// fetcher.js, filter.js, renderer.js are loaded as classic scripts before this one

(async () => {
  const statusEl   = document.getElementById('status');
  const countEl    = document.getElementById('count');
  const resultsEl  = document.getElementById('results');
  const selectEl   = document.getElementById('window-select');

  function getWindow() {
    return parseInt(selectEl.value, 10);
  }

  selectEl.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('days', selectEl.value);
    location.href = url.toString();
  });

  // Restore window from URL param
  const params = new URLSearchParams(location.search);
  const savedDays = params.get('days');
  if (savedDays && ['3','4','5'].includes(savedDays)) {
    selectEl.value = savedDays;
  }

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
    stocks = await fetchMarket(symbols, windowDays);
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
```

- [ ] **Step 2: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TASE Stock Tracker</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <h1>TASE Stock Tracker</h1>
  <p class="subtitle">Stocks with rising price and increasing volume on the Tel Aviv Stock Exchange</p>

  <div class="controls">
    <label for="window-select">Window:</label>
    <select id="window-select">
      <option value="3">3 days</option>
      <option value="4">4 days</option>
      <option value="5">5 days</option>
    </select>
    <span class="badge" id="count">—</span>
    <span class="status" id="status"></span>
  </div>

  <div id="results"></div>

  <!-- Load modules as classic scripts (no bundler needed) -->
  <script src="fetcher.js"></script>
  <script src="filter.js"></script>
  <script src="renderer.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Open in browser to verify**

```bash
# macOS
open index.html
```

Expected:
- Page loads, shows "Fetching N stocks from Yahoo Finance..."
- After ~2s table appears with matching stocks (or "No stocks matched" if market has been down)
- Changing the window dropdown reloads and re-filters
- Check browser DevTools → Network tab: one request to `query1.finance.yahoo.com`

- [ ] **Step 4: Commit**

```bash
git add app.js index.html
git commit -m "feat: wire fetcher, filter, renderer into browser entry point"
```

---

## Task 7: GitHub Pages deploy

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Enable GitHub Pages in your repo settings**

1. Go to your GitHub repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/pages.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:  # allow manual trigger

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload static files
        uses: actions/upload-pages-artifact@v3
        with:
          # Upload only the files needed for the dashboard
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/
git commit -m "chore: GitHub Actions deploy to GitHub Pages"
git push origin main
```

- [ ] **Step 4: Verify deployment**

1. Go to your repo → **Actions** tab
2. Watch the `Deploy to GitHub Pages` workflow run
3. When it's green, click the deployment URL (format: `https://<username>.github.io/<repo>/`)
4. Verify the page loads and fetches data

Expected: dashboard loads, table renders with TASE stocks.

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Fetch entire TASE market | Task 2 — `fetchMarket()` calls spark endpoint with all symbols from `stocks.json` |
| Daily data: volume + last price | Task 2 — spark returns close + volume per day |
| Filter: positive price + rising volume | Task 3 — `filterStocks()` with day-over-day close and volume check |
| Configurable window (3–5 days) | Tasks 3, 6 — `windowDays` param + `<select>` dropdown persisted in URL |
| Static page visualization | Tasks 4, 6 — dark table, volume bars, compact format |
| GitHub Pages hosting | Task 7 — GitHub Actions workflow |
| No API key | All tasks — Yahoo Finance spark needs no auth |

### No Lambda / No S3 Storage

This plan deliberately has no AWS resources. The tradeoff is load time (~2s) vs. the original sub-second S3 read. For a personal daily dashboard this is fine.

### CORS Fallback (one-liner if needed)

If Yahoo Finance blocks browser requests, edit line 3 of `fetcher.js`:
```js
// Change:
const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/spark';
// To:
const BASE_URL = 'https://corsproxy.io/?url=https://query1.finance.yahoo.com/v8/finance/spark';
```
