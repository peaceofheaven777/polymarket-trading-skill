# Polymarket Trading Skill

Auto-trading skill untuk Polymarket dengan technical analysis lengkap.

## Kemampuan

### Trading
- ✅ Polymarket 15-minute markets (BTC, ETH, etc)
- ✅ Drakec48 Z-Score volatility model
- ✅ Edge detection (≥6% threshold)
- ✅ Confidence-based sizing
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

### Macro
- ✅ Binance 1H candle data
- ✅ Z-Score calculation
- ✅ Fair price estimation
- ✅ Market sentiment

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
- Cek market 15-min BTC & ETH setiap cycle
- Analisa teknikal (RSI, EMA, Z-Score)
- Hitung edge dan confidence
- Tempatkan bet kalau edge ≥6% dan confidence ≥56%

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
├── README.md                   # Tutorial (same)
├── .env.example               # Template environment
├── package.json                # Dependencies
├── auto-both-15m-smart.js     # Main trading bot
├── check-all-positions.js     # Cek positions
└── src/
    ├── config/
    │   └── index.js           # Configuration
    └── services/
        ├── client.js           # Polymarket CLOB client
        ├── taAnalyzer.js       # Technical analysis
        └── drakec48Model.js   # Z-Score model
```

---

## Disclaimer

 trading involves risk. Use at your own risk. Start with small amounts.
