/**
 * Trend Following Strategy (Node.js version)
 * 
 * Based on: crypto-trader skill (trend_following.py)
 * Uses EMA crossover + RSI signals
 * 
 * Parameters:
 * - emaShort: Short EMA period (default: 9)
 * - emaLong: Long EMA period (default: 21)
 * - rsiPeriod: RSI lookback (default: 14)
 * - rsiOverbought: RSI overbought threshold (default: 70)
 * - rsiOversold: RSI oversold threshold (default: 30)
 */

import { fetchKlines } from '../drakec48Model.js';

// EMA calculation
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// RSI calculation
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Evaluate trend following signal
 * @param {string} symbol - Trading pair (e.g., 'BTCUSDT')
 * @param {string} timeframe - Timeframe (e.g., '1h', '4h')
 * @param {Object} params - Strategy parameters
 * @returns {Promise<Object>} Signal result
 */
export async function evaluateTrendFollowing(symbol = 'BTCUSDT', timeframe = '1h', params = {}) {
  const emaShortPeriod = params.emaShort || 9;
  const emaLongPeriod = params.emaLong || 21;
  const rsiPeriod = params.rsiPeriod || 14;
  const rsiOverbought = params.rsiOverbought || 70;
  const rsiOversold = params.rsiOversold || 30;
  
  const candlesNeeded = Math.max(emaLongPeriod, rsiPeriod) + 10;
  
  try {
    const klines = await fetchKlines(symbol, timeframe, candlesNeeded * 2);
    const closes = klines.map(k => k.close);
    
    if (closes.length < candlesNeeded) {
      return { success: false, reason: 'Insufficient data' };
    }
    
    // Calculate indicators
    const emaShort = calculateEMA(closes.slice(-emaShortPeriod), emaShortPeriod);
    const emaLong = calculateEMA(closes.slice(-emaLongPeriod), emaLongPeriod);
    const rsi = calculateRSI(closes, rsiPeriod);
    
    const currentPrice = closes[closes.length - 1];
    const prevEmaShort = calculateEMA(closes.slice(-emaShortPeriod - 1, -1), emaShortPeriod);
    const prevEmaLong = calculateEMA(closes.slice(-emaLongPeriod - 1, -1), emaLongPeriod);
    
    // Signal detection
    const bullishCross = prevEmaShort <= prevEmaLong && emaShort > emaLong;
    const bearishCross = prevEmaShort >= prevEmaLong && emaShort < emaLong;
    
    let signal = 'HOLD';
    let reason = '';
    
    if (bullishCross && rsi < rsiOverbought) {
      signal = 'BUY';
      reason = `Bullish EMA cross: EMA(${emaShortPeriod})=${emaShort.toFixed(2)} > EMA(${emaLongPeriod})=${emaLong.toFixed(2)}, RSI=${rsi.toFixed(1)}`;
    } else if (bearishCross || rsi > rsiOverbought) {
      signal = 'SELL';
      reason = `Bearish EMA cross or RSI overbought: EMA(${emaShortPeriod})=${emaShort.toFixed(2)} < EMA(${emaLongPeriod})=${emaLong.toFixed(2)}, RSI=${rsi.toFixed(1)}`;
    } else if (rsi < rsiOversold) {
      signal = 'BUY';
      reason = `RSI oversold: RSI=${rsi.toFixed(1)} < ${rsiOversold}`;
    } else if (rsi > rsiOverbought) {
      signal = 'SELL';
      reason = `RSI overbought: RSI=${rsi.toFixed(1)} > ${rsiOverbought}`;
    }
    
    return {
      success: true,
      signal,
      reason,
      indicators: {
        emaShort: emaShort.toFixed(2),
        emaLong: emaLong.toFixed(2),
        rsi: rsi.toFixed(1),
        emaCross: bullishCross ? 'BULLISH' : (bearishCross ? 'BEARISH' : 'NONE'),
        price: currentPrice
      },
      params: {
        emaShortPeriod,
        emaLongPeriod,
        rsiPeriod,
        rsiOverbought,
        rsiOversold
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { evaluateTrendFollowing };
