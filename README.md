# Polymarket Trading Skill

Auto-trading skill untuk Polymarket dengan technical analysis lengkap.

## Kemampuan

### Trading
- ✅ Polymarket 15-minute markets (BTC, ETH, etc)
- ✅ Drakec48 Z-Score volatility model
- ✅ **Minimum $5 per bet** (fixed)
- ✅ **Anti-spam: no bet on same market twice**
- ✅ Edge detection (≥6% threshold)
- ✅ Confidence-based sizing (≥56%)
- ✅ Auto-sell take profit (+20%) / cut loss (-20%)

### Technical Analysis (9 Indicators)
- ✅ RSI (Relative Strength Index)
- ✅ EMA 5/15 Crossover
- ✅ VWAP
- ✅ Orderbook analysis
- ✅ Funding rate check
- ✅ Mark/Oracle premium
- ✅ Candle pattern recognition
- ✅ Volume analysis
- ✅ ATR (volatility)

### Advanced Features (v2.0)
- ✅ Multi-timeframe analysis (1M, 15M, 1H)
- ✅ Trend Score (0-6 based on momentum)
- ✅ RSI filters (don't fade extremes)
- ✅ Higher edge threshold for 50/50 markets
- ✅ Z-Score guardrails (don't bet against trend if |z| ≥ 0.25)

### Learn from Losses 🎯
- ✅ Auto-record every trade (win/loss)
- ✅ Analyze why each loss happened
- ✅ Track patterns (Z-Score, RSI, EMA, Edge, Market)
- ✅ Generate recommendations for next trades
- ✅ Apply learned rules to prevent repeat mistakes
- ✅ Win rate by asset & direction tracking

### Macro
- ✅ Binance 1H candle data
- ✅ Z-Score calculation
- ✅ Fair price estimation
- ✅ Market sentiment

---

## Trading Rules

| Parameter | Value |
|-----------|-------|
| **Min Bet** | $5 per trade |
| **Max Positions** | 5 open positions |
| **Min Confidence** | 56% |
| **Min Edge** | 6% |
| **Take Profit** | +20% |
| **Cut Loss** | -20% |
| **Survival Floor** | $30 |
| **Anti-Spam** | No duplicate bets on same market |
| **Learning** | Auto-learn from losses |

---

## Cara Install

### Prerequisites
- Node.js 18+
- npm atau yarn
- Polymarket account dengan USDC di Polygon

### Step 1: Clone Repo
```bash
git clone https://github.com/peaceofheaven777/polymarket-trading-skill.git
cd polymarket-trading-skill
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Setup Environment
```bash
cp .env.example .env
```

Edit file `.env` dengan credentials kamu:

```env
# Private key EOA (untuk signing transactions)
PRIVATE_KEY=0xYourPrivateKeyWithout0x

# Proxy wallet address (dari Polymarket)
PROXY_WALLET_ADDRESS=0xYourProxyWalletAddress

# Polygon RPC (pake free RPC atau your own)
POLYGON_RPC_URL=https://polygon-rpc.com

# Polymarket CLOB API (optional - auto-derived jika kosong)
CLOB_API_KEY=
CLOB_API_SECRET=
CLOB_API_PASSPHRASE=

# HTTP Proxy (optional - kalau perlu)
PROXY_URL=
```

### Step 4: Cara Dapetin Credentials

#### Private Key
1. Buka MetaMask
2. Klik 3 titik → Account Details → Export Private Key
3. Copy (tanpa prefix `0x`)

#### Proxy Wallet
1. Buka https://polymarket.com/settings
2. Cari "Proxy Wallet" atau "Trading Account"
3. Copy address nya

#### Polygon RPC (Free)
```env
# Pilih salah satu:
POLYGON_RPC_URL=https://polygon-rpc.com
# atau
POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com
# atau
POLYGON_RPC_URL=https://rpc-mainnet.matic.network
```

#### USDC.e ke Proxy Wallet
1. Beli USDC di exchange (Binance, etc)
2. Swap ke USDC.e di Polygon (https://app.polymarket.com/bridge)
3. Transfer ke proxy wallet address kamu

Minimal: $30 (survival floor)

---

## Cara Menjalankan

### Mode Trading (Auto-Bet)
```bash
node auto-both-15m-smart.js
```

Bot akan:
1. Cek market 15-min BTC & ETH setiap cycle
2. Analisa teknikal (RSI, EMA, Z-Score, Trend Score)
3. Hitung edge dan confidence
4. **Cek learned recommendations** ( dari loss sebelumnya)
5. **Cek kalau sudah ada posisi di market ini** (prevent spam)
6. Tempatkan bet kalau:
   - Edge ≥6%
   - Confidence ≥56%
   - Tidak ada learned rule yang blok
   - Belum ada posisi di market ini

### Cek Recommendations
```bash
node -e "import('./src/services/tradingJournal.js').then(m => console.log(JSON.stringify(m.getRecommendations(), null, 2)))"
```

### Cek Recent Trades
```bash
node -e "import('./src/services/tradingJournal.js').then(m => console.log(JSON.stringify(m.getRecentTrades(10), null, 2)))"
```

### Cek Positions
```bash
node check-all-positions.js
```

---

## Risk Management

| Parameter | Value |
|-----------|-------|
| Min Confidence | 56% |
| Min Edge | 6% |
| Max Positions | 5 |
| Take Profit | +20% |
| Cut Loss | -20% |
| Survival Floor | $30 |
| **Anti-Spam** | ✅ Check existing positions |
| **Learning** | ✅ Auto-learn from losses |

---

## How Learning Works

### 1. Record Trade
Setiap bet yang dipasang akan direkam dengan:
- Asset (BTC/ETH)
- Direction (UP/DOWN)
- Entry price
- Indicators (RSI, EMA, Z-Score, etc)
- Edge & Confidence

### 2. Analyze Loss
Ketika posisi selesai (win/loss), system akan menganalisa:
- Kalau RSI < 25 atau > 75 → oversold/overbought trap
- Kalau |Z-Score| > 0.25 tapi bet melawan direction → fighting model
- Kalau Edge < 8% → edge terlalu tipis
- Kalau EMA trend berlawanan dengan bet → trend jumping
- Kalau market sentiment berlawanan → fighting the crowd

### 3. Generate Recommendations
Dari pattern yang muncul, system akan:
- Prioritas HIGH: Z-Score rule violations, Low edge
- Prioritas MEDIUM: RSI extremes, EMA misalignment

### 4. Apply to Next Trade
Sebelum placing bet, bot akan:
- Cek recommendations
- Kalau ada HIGH priority rule violated → skip bet

---

## Troubleshooting

### "Not enough balance/allowance"
- Cek USDC.e balance di proxy wallet
- Atau approve USDC.e ke proxy

### "Could not create api key"
- Coba isi CLOB_API_KEY, CLOB_API_SECRET, CLOB_API_PASSPHRASE manual
- Atau biarkan kosong — bot akan derive sendiri

### "Connection timeout"
- Coba ganti POLYGON_RPC_URL
- Atau tambah PROXY_URL

---

## Struktur Files

```
polymarket-trading-skill/
├── SKILL.md                    # Ini file
├── README.md                   # Tutorial
├── .env.example               # Template environment
├── package.json                # Dependencies
├── auto-both-15m-smart.js     # Main trading bot
├── check-all-positions.js     # Cek positions
└── src/
    ├── config/
    │   └── index.js           # Configuration
    ├── services/
    │   ├── client.js           # Polymarket CLOB client
    │   ├── taAnalyzer.js       # Technical analysis
    │   ├── drakec48Model.js   # Z-Score model
    │   ├── tradingJournal.js # Track & learn from trades
    │   ├── trendFollowing.js  # Trend detection
    │   └── position.js        # Position tracking
    └── utils/
        └── logger.js           # Logging
```

---

## Disclaimer

Trading involves risk. Use at your own risk. Start with small amounts.
