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

## Setup

```bash
# Install dependencies
cd polymarket-trading-skill
npm install

# Configure .env
cp .env.example .env
# Edit .env with your keys

# Run
node auto-both-15m-smart.js
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| PRIVATE_KEY | EOA private key |
| PROXY_WALLET_ADDRESS | Polymarket proxy wallet |
| POLYGON_RPC_URL | Polygon RPC |
| CLOB_API_KEY | Polymarket CLOB API key |
| CLOB_API_SECRET | API secret |
| CLOB_API_PASSPHRASE | API passphrase |
| PROXY_URL | HTTP proxy (optional) |

## Files

| File | Purpose |
|------|---------|
| `auto-both-15m-smart.js` | Main trading bot |
| `src/services/taAnalyzer.js` | Technical analysis |
| `src/services/drakec48Model.js` | Z-Score model |
| `src/services/client.js` | Polymarket CLOB client |

## Usage

```bash
# Start trading
node auto-both-15m-smart.js

# Check positions
node check-all-positions.js
```

## Risk Management

- Min confidence: 56%
- Min edge: 6%
- Max positions: 5
- Take profit: +20%
- Cut loss: -20%
- Survival floor: $30
