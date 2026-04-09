# TASE Stock Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily Lambda polls Tel Aviv Stock Exchange data, stores JSON snapshots in S3, and serves a static dashboard highlighting stocks with positive price action and rising volume over the last 3–5 days.

**Architecture:** An EventBridge-scheduled Lambda (runs Mon–Fri at 16:30 UTC = 18:30 Israel time, 1h after TASE close) fetches stock data via `yfinance`, writes a dated JSON snapshot to S3. A static HTML/JS dashboard is hosted on the same S3 bucket and reads the last N day-files directly from S3 to render a filtered table.

**Tech Stack:** Python 3.12 Lambda · yfinance · boto3 · AWS SAM (template.yaml) · Vanilla HTML/CSS/JS dashboard · S3 static website hosting · EventBridge cron

---

## Scope Note

Three independent subsystems that build on each other:
1. **Collector** — Lambda + data fetching logic (Tasks 1–4)
2. **Infrastructure** — SAM template: S3, Lambda, EventBridge, IAM (Task 5)
3. **Dashboard** — S3-hosted static page (Tasks 6–7)

---

## File Structure

```
Bursa/
├── template.yaml                     # SAM infrastructure definition
├── samconfig.toml                    # SAM deploy defaults (stack name, region, etc.)
├── src/
│   └── collector/
│       ├── handler.py                # Lambda entrypoint — orchestrates fetch + store
│       ├── fetcher.py                # yfinance wrapper — returns typed dicts
│       ├── storage.py                # S3 read/write helpers
│       └── requirements.txt         # yfinance, boto3
├── config/
│   └── stocks.json                   # Configurable list of TASE symbols to track
├── dashboard/
│   ├── index.html                    # Static page shell + table markup
│   ├── app.js                        # Fetches JSON files, filters, renders table
│   └── styles.css                    # Minimal table + status styling
├── scripts/
│   ├── deploy.sh                     # sam build && sam deploy
│   └── upload_dashboard.sh          # aws s3 sync dashboard/ to S3 bucket
└── tests/
    ├── conftest.py                   # shared fixtures (mock S3, sample data)
    ├── test_fetcher.py
    └── test_storage.py
```

---

## Data Formats

**S3 key pattern:** `data/YYYY-MM-DD.json`

**Daily snapshot JSON:**
```json
{
  "date": "2026-04-03",
  "fetched_at": "2026-04-03T16:32:11Z",
  "stocks": [
    {
      "symbol": "TEVA.TA",
      "name": "Teva Pharmaceutical",
      "close": 45.20,
      "open": 44.80,
      "high": 45.55,
      "low": 44.60,
      "volume": 1234567,
      "change_pct": 0.89
    }
  ]
}
```

---

## Task 1: Project scaffold + stock symbols config

**Files:**
- Create: `config/stocks.json`
- Create: `src/collector/requirements.txt`
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

```
.aws-sam/
__pycache__/
*.pyc
.env
samconfig.toml
```

> Keep `samconfig.toml` out of git — it will contain your AWS account ID and region. Each developer or CI environment generates their own.

- [ ] **Step 2: Create stock symbols config**

Create `config/stocks.json` — TA-35 major constituents on Yahoo Finance (`.TA` suffix):

```json
{
  "symbols": [
    "TEVA.TA",
    "NICE.TA",
    "CHKP.TA",
    "FVRR.TA",
    "MNDY.TA",
    "ICL.TA",
    "ESLT.TA",
    "ELBIT.TA",
    "BCOM.TA",
    "HAPOALIM.TA",
    "DISCOUNT.TA",
    "LUMI.TA",
    "MIZRAHI.TA",
    "IDB.TA",
    "FIBI.TA",
    "AZRIELI.TA",
    "MELISRON.TA",
    "AMOT.TA",
    "GEV.TA",
    "POLI.TA",
    "SANO.TA",
    "DLEKG.TA",
    "ORL.TA",
    "ODED.TA",
    "TNUVA.TA"
  ]
}
```

> To add/remove stocks later, edit only this file — no Lambda code changes needed.

- [ ] **Step 3: Create requirements.txt**

```
yfinance==0.2.55
boto3==1.34.0
```

- [ ] **Step 4: Commit**

```bash
git add config/stocks.json src/collector/requirements.txt .gitignore
git commit -m "chore: project scaffold and stock symbols config"
```

---

## Task 2: Data fetcher module

**Files:**
- Create: `src/collector/fetcher.py`
- Create: `tests/conftest.py`
- Create: `tests/test_fetcher.py`

The fetcher calls `yfinance.download()` for all symbols in one batch call — more efficient than one call per symbol.

- [ ] **Step 1: Write failing tests**

Create `tests/conftest.py`:
```python
import json
from pathlib import Path

SAMPLE_SYMBOLS = ["TEVA.TA", "NICE.TA"]

SAMPLE_STOCK_ENTRY = {
    "symbol": "TEVA.TA",
    "name": "Teva Pharmaceutical Industries",
    "close": 45.20,
    "open": 44.80,
    "high": 45.55,
    "low": 44.60,
    "volume": 1234567,
    "change_pct": 0.89,
}
```

Create `tests/test_fetcher.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import numpy as np
from src.collector.fetcher import fetch_stocks


def _make_yf_dataframe(symbols: list[str]) -> pd.DataFrame:
    """Build a minimal multi-index DataFrame matching yfinance output shape."""
    dates = pd.to_datetime(["2026-04-03"])
    arrays = [
        ["Close", "Close", "High", "High", "Low", "Low", "Open", "Open", "Volume", "Volume"],
        symbols * 5,
    ]
    tuples = list(zip(arrays[0], arrays[1]))
    cols = pd.MultiIndex.from_tuples(tuples)
    data = np.array([[45.2, 50.1, 45.5, 50.5, 44.6, 49.8, 44.8, 49.9, 1_000_000, 500_000]])
    return pd.DataFrame(data, index=dates, columns=cols)


def test_fetch_stocks_returns_list_of_dicts():
    symbols = ["TEVA.TA", "NICE.TA"]
    mock_df = _make_yf_dataframe(symbols)

    with patch("src.collector.fetcher.yf.download", return_value=mock_df):
        result = fetch_stocks(symbols)

    assert isinstance(result, list)
    assert len(result) == 2


def test_fetch_stocks_entry_has_required_keys():
    symbols = ["TEVA.TA", "NICE.TA"]
    mock_df = _make_yf_dataframe(symbols)

    with patch("src.collector.fetcher.yf.download", return_value=mock_df):
        result = fetch_stocks(symbols)

    required_keys = {"symbol", "close", "open", "high", "low", "volume", "change_pct"}
    for entry in result:
        assert required_keys.issubset(entry.keys()), f"Missing keys in {entry}"


def test_fetch_stocks_change_pct_calculated_correctly():
    symbols = ["TEVA.TA", "NICE.TA"]
    mock_df = _make_yf_dataframe(symbols)

    with patch("src.collector.fetcher.yf.download", return_value=mock_df):
        result = fetch_stocks(symbols)

    # TEVA.TA: close=45.2, open=44.8 → change_pct = (45.2-44.8)/44.8 * 100 ≈ 0.89
    teva = next(r for r in result if r["symbol"] == "TEVA.TA")
    assert abs(teva["change_pct"] - 0.89) < 0.01


def test_fetch_stocks_empty_symbols_returns_empty_list():
    with patch("src.collector.fetcher.yf.download", return_value=pd.DataFrame()):
        result = fetch_stocks([])

    assert result == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/Bursa
pip install yfinance boto3 pytest
PYTHONPATH=. pytest tests/test_fetcher.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.collector.fetcher'`

- [ ] **Step 3: Implement fetcher**

Create `src/collector/fetcher.py`:
```python
import yfinance as yf
import pandas as pd
from datetime import date, timedelta


def fetch_stocks(symbols: list[str]) -> list[dict]:
    """
    Fetch today's OHLCV data for all symbols in one yfinance batch call.
    Returns a list of stock dicts. Skips symbols with missing data.
    """
    if not symbols:
        return []

    # Fetch last 2 days to guarantee we have today's close (yfinance sometimes needs range)
    end = date.today()
    start = end - timedelta(days=5)

    df: pd.DataFrame = yf.download(
        tickers=symbols,
        start=start.isoformat(),
        end=(end + timedelta(days=1)).isoformat(),
        auto_adjust=True,
        progress=False,
        group_by="column",
    )

    if df.empty:
        return []

    results = []
    for symbol in symbols:
        try:
            row = _extract_latest_row(df, symbol, len(symbols) > 1)
            if row is None:
                continue
            results.append(row)
        except Exception:
            # Skip symbol if data extraction fails — don't crash the whole run
            continue

    return results


def _extract_latest_row(df: pd.DataFrame, symbol: str, multi: bool) -> dict | None:
    """Extract the most recent non-NaN row for a symbol from the DataFrame."""
    if multi:
        # Multi-ticker download: columns are MultiIndex (field, symbol)
        close_col = ("Close", symbol)
        if close_col not in df.columns:
            return None
        sub = df[[("Close", symbol), ("Open", symbol), ("High", symbol),
                   ("Low", symbol), ("Volume", symbol)]].dropna()
        if sub.empty:
            return None
        latest = sub.iloc[-1]
        close = float(latest[("Close", symbol)])
        open_ = float(latest[("Open", symbol)])
        high = float(latest[("High", symbol)])
        low = float(latest[("Low", symbol)])
        volume = int(latest[("Volume", symbol)])
    else:
        # Single-ticker download: columns are flat (Close, Open, ...)
        sub = df[["Close", "Open", "High", "Low", "Volume"]].dropna()
        if sub.empty:
            return None
        latest = sub.iloc[-1]
        close = float(latest["Close"])
        open_ = float(latest["Open"])
        high = float(latest["High"])
        low = float(latest["Low"])
        volume = int(latest["Volume"])

    change_pct = round((close - open_) / open_ * 100, 2) if open_ else 0.0

    return {
        "symbol": symbol,
        "close": round(close, 4),
        "open": round(open_, 4),
        "high": round(high, 4),
        "low": round(low, 4),
        "volume": volume,
        "change_pct": change_pct,
    }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
PYTHONPATH=. pytest tests/test_fetcher.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/collector/fetcher.py tests/conftest.py tests/test_fetcher.py
git commit -m "feat: yfinance batch fetcher with OHLCV extraction"
```

---

## Task 3: S3 storage module

**Files:**
- Create: `src/collector/storage.py`
- Create: `tests/test_storage.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_storage.py`:
```python
import json
import pytest
from unittest.mock import MagicMock, patch
from datetime import date
from src.collector.storage import write_snapshot, read_snapshot, snapshot_key


def test_snapshot_key_format():
    key = snapshot_key(date(2026, 4, 3))
    assert key == "data/2026-04-03.json"


def test_write_snapshot_puts_correct_json():
    mock_s3 = MagicMock()
    stocks = [{"symbol": "TEVA.TA", "close": 45.2, "volume": 100}]
    target_date = date(2026, 4, 3)

    write_snapshot(mock_s3, "my-bucket", stocks, target_date)

    mock_s3.put_object.assert_called_once()
    call_kwargs = mock_s3.put_object.call_args.kwargs
    assert call_kwargs["Bucket"] == "my-bucket"
    assert call_kwargs["Key"] == "data/2026-04-03.json"
    assert call_kwargs["ContentType"] == "application/json"

    body = json.loads(call_kwargs["Body"])
    assert body["date"] == "2026-04-03"
    assert body["stocks"] == stocks
    assert "fetched_at" in body


def test_write_snapshot_sets_public_read():
    mock_s3 = MagicMock()
    write_snapshot(mock_s3, "bucket", [], date(2026, 4, 3))
    call_kwargs = mock_s3.put_object.call_args.kwargs
    assert call_kwargs.get("ACL") == "public-read"


def test_read_snapshot_parses_json():
    mock_s3 = MagicMock()
    payload = {"date": "2026-04-03", "stocks": []}
    mock_s3.get_object.return_value = {
        "Body": MagicMock(read=lambda: json.dumps(payload).encode())
    }

    result = read_snapshot(mock_s3, "bucket", date(2026, 4, 3))
    assert result == payload


def test_read_snapshot_returns_none_when_missing():
    from botocore.exceptions import ClientError
    mock_s3 = MagicMock()
    mock_s3.get_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "Not Found"}}, "GetObject"
    )

    result = read_snapshot(mock_s3, "bucket", date(2026, 4, 3))
    assert result is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
PYTHONPATH=. pytest tests/test_storage.py -v
```

Expected: `ModuleNotFoundError: No module named 'src.collector.storage'`

- [ ] **Step 3: Implement storage module**

Create `src/collector/storage.py`:
```python
import json
import boto3
from datetime import date, datetime, timezone
from botocore.exceptions import ClientError


def snapshot_key(target_date: date) -> str:
    return f"data/{target_date.isoformat()}.json"


def write_snapshot(s3_client, bucket: str, stocks: list[dict], target_date: date) -> None:
    """Write a daily snapshot JSON to S3 with public-read ACL (needed for dashboard)."""
    payload = {
        "date": target_date.isoformat(),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "stocks": stocks,
    }
    s3_client.put_object(
        Bucket=bucket,
        Key=snapshot_key(target_date),
        Body=json.dumps(payload, ensure_ascii=False),
        ContentType="application/json",
        ACL="public-read",
    )


def read_snapshot(s3_client, bucket: str, target_date: date) -> dict | None:
    """Read a snapshot for a given date. Returns None if the key doesn't exist."""
    try:
        response = s3_client.get_object(Bucket=bucket, Key=snapshot_key(target_date))
        return json.loads(response["Body"].read())
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            return None
        raise
```

- [ ] **Step 4: Run tests — expect pass**

```bash
PYTHONPATH=. pytest tests/test_storage.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add src/collector/storage.py tests/test_storage.py
git commit -m "feat: S3 snapshot read/write with public-read ACL"
```

---

## Task 4: Lambda handler

**Files:**
- Create: `src/collector/handler.py`
- Create: `src/collector/__init__.py`

- [ ] **Step 1: Create empty `__init__.py` files**

```bash
touch src/__init__.py src/collector/__init__.py tests/__init__.py
```

- [ ] **Step 2: Write the handler**

Create `src/collector/handler.py`:
```python
import json
import os
import boto3
from datetime import date

from .fetcher import fetch_stocks
from .storage import write_snapshot


def lambda_handler(event: dict, context) -> dict:
    bucket = os.environ["DATA_BUCKET"]
    config_key = os.environ.get("STOCKS_CONFIG_KEY", "config/stocks.json")

    s3 = boto3.client("s3")

    # Load stock symbols from S3 (uploaded alongside the dashboard)
    config_obj = s3.get_object(Bucket=bucket, Key=config_key)
    config = json.loads(config_obj["Body"].read())
    symbols: list[str] = config["symbols"]

    print(f"Fetching {len(symbols)} symbols...")
    stocks = fetch_stocks(symbols)
    print(f"Fetched {len(stocks)} stocks successfully.")

    today = date.today()
    write_snapshot(s3, bucket, stocks, today)
    print(f"Snapshot written to s3://{bucket}/data/{today.isoformat()}.json")

    return {
        "statusCode": 200,
        "body": json.dumps({"date": today.isoformat(), "count": len(stocks)}),
    }
```

- [ ] **Step 3: Commit**

```bash
git add src/__init__.py src/collector/__init__.py src/collector/handler.py
git commit -m "feat: Lambda handler orchestrating fetch and S3 write"
```

---

## Task 5: SAM infrastructure template

**Files:**
- Create: `template.yaml`
- Create: `samconfig.toml` (not committed — see .gitignore)

- [ ] **Step 1: Create SAM template**

Create `template.yaml`:
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: TASE Stock Tracker — daily collector + S3 dashboard

Parameters:
  BucketName:
    Type: String
    Description: S3 bucket name for data and dashboard (must be globally unique)

Globals:
  Function:
    Runtime: python3.12
    Timeout: 120
    MemorySize: 256

Resources:

  DataBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref BucketName
      WebsiteConfiguration:
        IndexDocument: index.html
      PublicAccessBlockConfiguration:
        BlockPublicAcls: false
        BlockPublicPolicy: false
        IgnorePublicAcls: false
        RestrictPublicBuckets: false

  BucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref DataBucket
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal: "*"
            Action: s3:GetObject
            Resource: !Sub "arn:aws:s3:::${BucketName}/*"

  CollectorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: tase-stock-collector
      CodeUri: src/collector/
      Handler: handler.lambda_handler
      Environment:
        Variables:
          DATA_BUCKET: !Ref BucketName
          STOCKS_CONFIG_KEY: config/stocks.json
      Policies:
        - S3CrudPolicy:
            BucketName: !Ref BucketName
      Events:
        DailySchedule:
          Type: Schedule
          Properties:
            # 16:30 UTC = 18:30 Israel winter time (UTC+2), 1h after TASE closes at 17:30
            Schedule: "cron(30 16 ? * MON-FRI *)"
            Description: Run 1 hour after TASE market close
            Enabled: true

Outputs:
  WebsiteURL:
    Description: S3 static website URL
    Value: !GetAtt DataBucket.WebsiteURL
  BucketName:
    Description: S3 bucket name
    Value: !Ref DataBucket
```

- [ ] **Step 2: Create samconfig.toml (local only, not committed)**

```toml
version = 0.1

[default.deploy.parameters]
stack_name = "tase-stock-tracker"
resolve_s3 = true
s3_prefix = "tase-stock-tracker"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
parameter_overrides = "BucketName=tase-bursa-data-<YOUR_INITIALS>"
```

> Replace `<YOUR_INITIALS>` with something unique (e.g., `tase-bursa-data-av`). Bucket names are global.

- [ ] **Step 3: Commit template only**

```bash
git add template.yaml
git commit -m "feat: SAM template with S3 bucket, Lambda, and EventBridge schedule"
```

---

## Task 6: Static dashboard

**Files:**
- Create: `dashboard/index.html`
- Create: `dashboard/app.js`
- Create: `dashboard/styles.css`

The dashboard reads JSON files directly from S3. It determines the last N dates by walking backwards from today (skipping weekends). It fetches each date's JSON in parallel, then filters for stocks where **all days** had positive change AND volume was non-decreasing.

- [ ] **Step 1: Create styles.css**

Create `dashboard/styles.css`:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  padding: 24px;
}

h1 { font-size: 1.5rem; margin-bottom: 4px; }
.subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 20px; }

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.controls label { font-size: 0.875rem; color: #94a3b8; }

.controls select {
  background: #1e2533;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.875rem;
  cursor: pointer;
}

.badge {
  background: #1e3a2f;
  color: #4ade80;
  border-radius: 20px;
  padding: 3px 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th {
  text-align: left;
  padding: 10px 14px;
  background: #1e2533;
  color: #94a3b8;
  font-weight: 500;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  user-select: none;
}

th:hover { color: #e2e8f0; }

td {
  padding: 10px 14px;
  border-bottom: 1px solid #1e2533;
}

tr:hover td { background: #1a2030; }

.positive { color: #4ade80; }
.negative { color: #f87171; }

.volume-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-track {
  flex: 1;
  background: #1e2533;
  border-radius: 4px;
  height: 6px;
  min-width: 60px;
}

.bar-fill {
  background: #3b82f6;
  border-radius: 4px;
  height: 6px;
}

.status { color: #94a3b8; margin: 40px 0; text-align: center; font-size: 0.9rem; }
.error { color: #f87171; }
```

- [ ] **Step 2: Create app.js**

Create `dashboard/app.js`:
```javascript
// Configuration — edit DAYS_WINDOW via ?days=N query param or change default here
const DEFAULT_DAYS = 3;
const MAX_DAYS = 5;

// S3 data path prefix relative to this page's origin
const DATA_PREFIX = 'data/';

/**
 * Return the last N trading days (Mon–Fri) as 'YYYY-MM-DD' strings,
 * starting from yesterday (market may not have data for today yet).
 */
function lastTradingDays(n) {
  const days = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 1); // start from yesterday
  while (days.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push(d.toISOString().slice(0, 10));
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days.reverse(); // oldest first
}

async function fetchSnapshot(dateStr) {
  const url = `${DATA_PREFIX}${dateStr}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

function filterStocks(snapshots) {
  // Build map: symbol → [{date, close, open, volume, change_pct}, ...]
  const bySymbol = {};

  for (const snap of snapshots) {
    for (const s of snap.stocks) {
      if (!bySymbol[s.symbol]) bySymbol[s.symbol] = [];
      bySymbol[s.symbol].push({ ...s, date: snap.date });
    }
  }

  const results = [];
  for (const [symbol, days] of Object.entries(bySymbol)) {
    // Must have data for all requested days
    if (days.length < snapshots.length) continue;

    const allPositive = days.every(d => d.change_pct > 0);
    const volumeIncreasing = days.every((d, i) => i === 0 || d.volume >= days[i - 1].volume);

    if (allPositive && volumeIncreasing) {
      const latest = days[days.length - 1];
      const avgChangePct = days.reduce((s, d) => s + d.change_pct, 0) / days.length;
      results.push({
        symbol,
        close: latest.close,
        change_pct: latest.change_pct,
        avg_change_pct: Math.round(avgChangePct * 100) / 100,
        volume: latest.volume,
        volume_first: days[0].volume,
        days_tracked: days.length,
      });
    }
  }

  return results.sort((a, b) => b.avg_change_pct - a.avg_change_pct);
}

function fmtVolume(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return String(v);
}

function renderTable(stocks, maxVolume) {
  if (stocks.length === 0) {
    return '<p class="status">No stocks matched the filter for this period.</p>';
  }

  const rows = stocks.map(s => {
    const barPct = Math.round((s.volume / maxVolume) * 100);
    const volumeGrowth = s.volume_first > 0
      ? '+' + Math.round(((s.volume - s.volume_first) / s.volume_first) * 100) + '%'
      : '—';
    return `
      <tr>
        <td><strong>${s.symbol.replace('.TA', '')}</strong></td>
        <td>${s.close.toFixed(2)}</td>
        <td class="positive">+${s.change_pct.toFixed(2)}%</td>
        <td class="positive">+${s.avg_change_pct.toFixed(2)}%</td>
        <td>
          <div class="volume-bar">
            <span>${fmtVolume(s.volume)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${barPct}%"></div></div>
            <span style="color:#3b82f6;font-size:0.8rem">${volumeGrowth}</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Last Price (ILS)</th>
          <th>Today %</th>
          <th>Avg % (period)</th>
          <th>Volume (latest → trend)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function main() {
  const params = new URLSearchParams(location.search);
  const days = Math.min(MAX_DAYS, Math.max(1, parseInt(params.get('days') || DEFAULT_DAYS)));

  document.getElementById('days-select').value = String(days);

  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('results');
  const countEl = document.getElementById('count');
  const datesEl = document.getElementById('date-range');

  const tradingDays = lastTradingDays(days);
  datesEl.textContent = `${tradingDays[0]} → ${tradingDays[tradingDays.length - 1]}`;
  statusEl.textContent = `Loading ${days} days of data...`;

  const snapshots = (await Promise.all(tradingDays.map(fetchSnapshot))).filter(Boolean);

  if (snapshots.length === 0) {
    statusEl.textContent = '';
    resultEl.innerHTML = '<p class="status error">Could not load any data. Check that snapshots exist in S3.</p>';
    return;
  }

  if (snapshots.length < days) {
    statusEl.textContent = `Note: only ${snapshots.length}/${days} days available — filtering with available data.`;
  } else {
    statusEl.textContent = '';
  }

  const filtered = filterStocks(snapshots);
  const maxVolume = filtered.reduce((m, s) => Math.max(m, s.volume), 1);

  countEl.textContent = `${filtered.length} match`;
  resultEl.innerHTML = renderTable(filtered, maxVolume);
}

document.getElementById('days-select').addEventListener('change', e => {
  const url = new URL(location.href);
  url.searchParams.set('days', e.target.value);
  location.href = url.toString();
});

main();
```

- [ ] **Step 3: Create index.html**

Create `dashboard/index.html`:
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
  <p class="subtitle">Stocks positive in price AND increasing in volume — <span id="date-range"></span></p>

  <div class="controls">
    <label for="days-select">Window:</label>
    <select id="days-select">
      <option value="3">3 days</option>
      <option value="4">4 days</option>
      <option value="5">5 days</option>
    </select>
    <span class="badge" id="count">—</span>
    <span style="color:#94a3b8;font-size:0.8rem" id="status"></span>
  </div>

  <div id="results"></div>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/
git commit -m "feat: S3 static dashboard with configurable window filter"
```

---

## Task 7: Deploy scripts + first run

**Files:**
- Create: `scripts/deploy.sh`
- Create: `scripts/upload_dashboard.sh`

- [ ] **Step 1: Create deploy script**

Create `scripts/deploy.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "==> Building Lambda with dependencies..."
sam build

echo "==> Deploying to AWS..."
sam deploy

echo "==> Done. Check Outputs above for WebsiteURL."
```

- [ ] **Step 2: Create dashboard upload script**

Create `scripts/upload_dashboard.sh`:
```bash
#!/usr/bin/env bash
# Usage: ./scripts/upload_dashboard.sh <bucket-name>
set -euo pipefail

BUCKET="${1:?Usage: upload_dashboard.sh <bucket-name>}"

echo "==> Uploading dashboard to s3://$BUCKET/..."
aws s3 cp dashboard/index.html "s3://$BUCKET/index.html" --acl public-read --content-type "text/html"
aws s3 cp dashboard/app.js     "s3://$BUCKET/app.js"     --acl public-read --content-type "application/javascript"
aws s3 cp dashboard/styles.css "s3://$BUCKET/styles.css"  --acl public-read --content-type "text/css"

echo "==> Uploading stock config..."
aws s3 cp config/stocks.json "s3://$BUCKET/config/stocks.json" --acl public-read --content-type "application/json"

echo "==> Dashboard live at: http://$BUCKET.s3-website-$(aws configure get region).amazonaws.com"
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x scripts/deploy.sh scripts/upload_dashboard.sh
git add scripts/
git commit -m "chore: deploy and dashboard upload scripts"
```

- [ ] **Step 4: Install AWS SAM CLI if needed**

```bash
# macOS
brew install aws-sam-cli

# Verify
sam --version
```

- [ ] **Step 5: Deploy infrastructure**

```bash
# Ensure AWS credentials are configured
aws configure

# Create your samconfig.toml (not committed)
cp /dev/stdin samconfig.toml <<'EOF'
version = 0.1

[default.deploy.parameters]
stack_name = "tase-stock-tracker"
resolve_s3 = true
s3_prefix = "tase-stock-tracker"
region = "us-east-1"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
parameter_overrides = "BucketName=tase-bursa-data-av"
EOF

./scripts/deploy.sh
```

Expected output ends with:
```
Key         WebsiteURL
Value       http://tase-bursa-data-av.s3-website-us-east-1.amazonaws.com
```

- [ ] **Step 6: Upload dashboard and config**

```bash
./scripts/upload_dashboard.sh tase-bursa-data-av
```

- [ ] **Step 7: Trigger a manual test run**

```bash
aws lambda invoke \
  --function-name tase-stock-collector \
  --log-type Tail \
  --query 'LogResult' \
  --output text \
  response.json | base64 -d

cat response.json
```

Expected: `{"statusCode": 200, "body": "{\"date\": \"2026-04-03\", \"count\": 25}"}`

- [ ] **Step 8: Verify S3 data and open dashboard**

```bash
# Check the JSON was written
aws s3 ls s3://tase-bursa-data-av/data/

# Open dashboard in browser
open http://tase-bursa-data-av.s3-website-us-east-1.amazonaws.com
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Scheduled Lambda, 1h after TASE close | Task 5 — `cron(30 16 ? * MON-FRI *)` |
| Poll stock data: volume, last price, daily data | Task 2 — fetcher.py fetches OHLCV via yfinance |
| Save as JSON in S3 | Task 3 — storage.py, dated key pattern |
| S3 static page for visualization | Task 6 — dashboard/ |
| Filter: positive price + volume increase | Task 6 — app.js `filterStocks()` |
| Configurable window (3–5 days) | Task 6 — `?days=N` URL param, select control |
| Deployment path | Tasks 5, 7 — SAM template + scripts |

### Data Source Notes

`yfinance` fetches from Yahoo Finance. TASE stocks use `.TA` suffix (e.g., `TEVA.TA`). This is free with no API key but is unofficial — rate limits apply for large batches. The batch `yf.download()` call in `fetcher.py` minimizes requests. If you hit limits, add a brief `time.sleep(1)` between batches of 10.

### TASE Close Time

TASE closes at 17:30 Israel time. Israel observes UTC+2 (winter) / UTC+3 (summer). `cron(30 16 ? * MON-FRI *)` = 16:30 UTC = 18:30 winter / 19:30 summer — always at least 1h after close.

### Limitations to Know

- `yfinance` `.TA` data sometimes has 1-day lag. If today's data is missing the dashboard shows "N-1 of N days available".
- S3 public-read ACL requires the bucket's Block Public Access settings to be off (handled in `template.yaml`).
- The dashboard reads S3 directly (same-origin via S3 website hosting) — no CORS issues.
