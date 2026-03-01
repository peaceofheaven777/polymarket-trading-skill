
/**
 * Technical Analysis Module
 * Implements 9 indicators for trading decision support.
 */

import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Calculate RSI (Relative Strength Index)
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number} RSI value
 */
export function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50; // Neutral

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100; // Overbought
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return rsi;
}

/**
 * Calculate EMA (Exponential Moving Average)
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - EMA period
 * @returns {number} EMA value
 */
export function calculateEMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];

    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

/**
 * Calculate SMA (Simple Moving Average)
 * @param {number[]} prices
 * @param {number} period
 * @returns {number}
 */
export function calculateSMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 * @param {Array} trades - Array of {price, volume}
 * @returns {number}
 */
export function calculateVWAP(trades) {
    if (!trades || trades.length === 0) return 0;
    let sumPV = 0;
    let sumV = 0;
    for (const t of trades) {
        sumPV += t.price * t.volume;
        sumV += t.volume;
    }
    return sumV === 0 ? 0 : sumPV / sumV;
}

/**
 * Calculate ATR (Average True Range)
 * @param {Array} highs
 * @param {Array} lows
 * @param {Array} closes
 * @param {number} period
 * @returns {number}
 */
export function calculateATR(highs, lows, closes, period = 14) {
    if (closes.length < period + 1) return 0;

    let atr = 0;
    for (let i = 1; i < closes.length; i++) {
        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        atr += tr;
    }
    return atr / period;
}

/**
 * Analyze orderbook
 * @param {Object} orderbook - {bids: [], asks: []}
 * @returns {Object} { ratio, imbalance, spread }
 */
export function analyzeOrderbook(orderbook) {
    if (!orderbook || !orderbook.bids || !orderbook.asks) {
        return { ratio: 1, imbalance: 0, spread: 0 };
    }

    const bidVol = orderbook.bids.reduce((sum, b) => sum + (parseFloat(b.size) || 0), 0);
    const askVol = orderbook.asks.reduce((sum, a) => sum + (parseFloat(a.size) || 0), 0);
    const total = bidVol + askVol;

    const ratio = total === 0 ? 1 : bidVol / total;
    const imbalance = bidVol - askVol;
    const bestBid = orderbook.bids[0]?.price || 0;
    const bestAsk = orderbook.asks[0]?.price || 1;
    const spread = bestAsk - bestBid;

    return { ratio, imbalance, spread };
}

/**
 * Detect candlestick patterns
 * @param {Object} candle - {open, high, low, close}
 * @returns {string} Pattern name or 'none'
 */
export function detectCandlePattern(candle) {
    const body = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    if (totalRange === 0) return 'doji';

    // Doji
    if (body < totalRange * 0.1) return 'doji';

    // Hammer / Inverted Hammer (bullish)
    if (lowerShadow > body * 2 && upperShadow < body) return 'hammer';

    // Shooting Star (bearish)
    if (upperShadow > body * 2 && lowerShadow < body) return 'shooting_star';

    // Engulfing
    // Simplified:来判断 bullish/bearish engulfing
    if (body > totalRange * 0.5) {
        if (candle.close > candle.open) return 'bullish_candle';
        return 'bearish_candle';
    }

    return 'none';
}

/**
 * Main Technical Analysis Function
 * @param {Object} marketData - { priceHistory, orderbook, funding, etc }
 * @returns {Object} Analysis result
 */
export async function analyzeMarket(marketData) {
    logger.info('Running Technical Analysis (9 Indicators)...');

    const indicators = {};
    let confidence = 0.3; // 30% baseline
    let signals = [];

    // 1. RSI
    if (marketData.prices && marketData.prices.length > 0) {
        const rsi = calculateRSI(marketData.prices);
        indicators.rsi = rsi;
        if (rsi > 75) {
            signals.push('RSI_OVERBOUGHT');
            confidence -= 0.1;
        } else if (rsi < 25) {
            signals.push('RSI_OVERSOLD');
            confidence += 0.1;
        } else {
            signals.push('RSI_NEUTRAL');
        }
    }

    // 2. EMA 5/15 Crossover
    if (marketData.prices && marketData.prices.length > 15) {
        const ema5 = calculateEMA(marketData.prices, 5);
        const ema15 = calculateEMA(marketData.prices, 15);
        indicators.ema5 = ema5;
        indicators.ema15 = ema15;

        if (ema5 > ema15) {
            signals.push('EMA_BULLISH_CROSSOVER');
            confidence += 0.1;
        } else {
            signals.push('EMA_BEARISH_CROSSOVER');
            confidence -= 0.1;
        }
    }

    // 3. VWAP
    if (marketData.trades && marketData.trades.length > 0) {
        const vwap = calculateVWAP(marketData.trades);
        indicators.vwap = vwap;
        const currentPrice = marketData.prices[marketData.prices.length - 1];

        if (currentPrice > vwap) {
            signals.push('PRICE_ABOVE_VWAP');
            confidence += 0.05;
        } else {
            signals.push('PRICE_BELOW_VWAP');
            confidence -= 0.05;
        }
    }

    // 4. Orderbook Analysis
    if (marketData.orderbook) {
        const ob = analyzeOrderbook(marketData.orderbook);
        indicators.orderbook = ob;

        if (ob.ratio > 0.6) {
            signals.push('ORDERBOOK_BUY_WALL');
            confidence += 0.1;
        } else if (ob.ratio < 0.4) {
            signals.push('ORDERBOOK_SELL_WALL');
            confidence -= 0.1;
        }
    }

    // 5. Funding Rate
    if (marketData.funding !== undefined) {
        indicators.funding = marketData.funding;
        if (marketData.funding > 0.01) { // > 1% positive
            signals.push('FUNDING_LONG');
            confidence += 0.05;
        } else if (marketData.funding < -0.01) {
            signals.push('FUNDING_SHORT');
            confidence -= 0.05;
        }
    }

    confidence -= 0 // 6. Mark / Oracle Price
    if (marketData.oraclePrice && marketData.markPrice) {
        const premium = (marketData.markPrice - marketData.oraclePrice) / marketData.oraclePrice;
        indicators.premium = premium;

        if (premium > 0.05) {
            signals.push('PREMIUM_HIGH');
            confidence -= 0.05; // expensive
        } else if (premium < -0.05) {
            signals.push('PREMIUM_LOW');
            confidence += 0.05; // cheap
        }
    }

    // 7. Candle Pattern
    if (marketData.currentCandle) {
        const pattern = detectCandlePattern(marketData.currentCandle);
        indicators.pattern = pattern;

        if (pattern === 'hammer' || pattern === 'bullish_candle') {
            signals.push('PATTERN_BULLISH');
            confidence += 0.1;
        } else if (pattern === 'shooting_star' || pattern === 'bearish_candle') {
            signals.push('PATTERN_BEARISH');
            confidence -= 0.1;
        }
    }

    // 8. Volume Analysis
    if (marketData.volume && marketData.previousVolume) {
        indicators.volumeRatio = marketData.volume / marketData.previousVolume;

        if (indicators.volumeRatio > 1.5) {
            signals.push('VOLUME_SPIKE');
            // High volume confirms the trend
            if (confidence > 0) confidence += 0.1;
            else confidence -= 0.1;
        }
    }

    // 9. ATR (Volatility)
    if (marketData.highs && marketData.lows && marketData.closes) {
        const atr = calculateATR(marketData.highs, marketData.lows, marketData.closes);
        indicators.atr = atr;
        // ATR is used for stop loss sizing, not direction
    }

    // Normalize confidence
    confidence = Math.max(0, Math.min(1, confidence));

    const result = {
        indicators,
        signals,
        confidence,
        decision: confidence >= config.minConfidence ? 'TRADE' : 'WAIT',
        timestamp: new Date().toISOString(),
    };

    logger.info(`TA Result: Confidence=${(confidence * 100).toFixed(1)}%, Decision=${result.decision}, Signals=${signals.length}`);

    return result;
}

/**
 * Calculate edge based on probability vs odds
 * @param {number} probability - Our estimated probability (0-1)
 * @param {number} odds - Current market odds (0-1)
 * @returns {number} Edge percentage
 */
export function calculateEdge(probability, odds) {
    return probability - odds;
}

/**
 * Check if trade passes risk management rules
 * @param {Object} position - Current position
 * @param {number} currentPrice - Current price
 * @returns {Object} { action: 'HOLD' | 'TAKE_PROFIT' | 'CUT_LOSS', reason: string }
 */
export function checkRiskManagement(position, currentPrice) {
    const entryPrice = position.avgBuyPrice;
    const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Take Profit
    if (pnlPercent >= config.takeProfitPercent) {
        return { action: 'TAKE_PROFIT', reason: `+${pnlPercent.toFixed(2)}% reached ${config.takeProfitPercent}% target` };
    }

    // Cut Loss
    if (pnlPercent <= -config.cutLossPercent) {
        // Exception: if TA confidence is high, we might hold
        if (position.taConfidence && position.taConfidence >= config.taConfidenceOverride) {
            return { action: 'HOLD', reason: 'TA confidence high, waiting for recovery' };
        }
        return { action: 'CUT_LOSS', reason: `${pnlPercent.toFixed(2)}% hit -${config.cutLossPercent}% stop loss` };
    }

    return { action: 'HOLD', reason: 'Within risk parameters' };
}
