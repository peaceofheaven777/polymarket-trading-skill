/**
 * Drakec48 Z-Score Model
 * 
 * Polymarket BTC 1H Up/Down trading strategy using Binance as resolution anchor.
 * Based on: polymarket-skill-drakec48
 * 
 * Formula:
 *   z = (spot - open_px) / (sigma_1m * sqrt(minutes_left))
 *   fair_up = Phi(z) (normal CDF)
 *   edge = fair_up - market_price
 */

const BINANCE_API = 'https://api.binance.com';

// Normal CDF approximation (error function)
function normalCDF(x) {
  return 0.5 * (1.0 + erf(x / Math.sqrt(2)));
}

// Error function approximation
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

// Fetch Binance klines
async function fetchKlines(symbol = 'BTCUSDT', interval = '1m', limit = 60) {
  const url = `${BINANCE_API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
  const data = await response.json();
  return data.map(row => ({
    openTime: row[0],
    open: parseFloat(row[1]),
    high: parseFloat(row[2]),
    low: parseFloat(row[3]),
    close: parseFloat(row[4]),
    volume: parseFloat(row[5]),
    closeTime: row[6]
  }));
}

// Fetch current spot price
async function fetchSpot(symbol = 'BTCUSDT') {
  const url = `${BINANCE_API}/api/v3/ticker/price?symbol=${symbol}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
  const data = await response.json();
  return parseFloat(data.price);
}

// Calculate realized sigma from 1m closes
function realizedSigma(closes) {
  if (closes.length < 3) return null;
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i-1] <= 0) continue;
    rets.push((closes[i] - closes[i-1]) / closes[i-1]);
  }
  if (rets.length < 3) return null;
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((sum, x) => sum + Math.pow(x - mu, 2), 0) / (rets.length - 1);
  return Math.sqrt(variance);
}

// Calculate regime metrics
function calculateRegime(closes) {
  if (closes.length < 32) return null;
  const ret5 = closes[-1] / closes[-6] - 1.0;
  const ret15 = closes[-1] / closes[-16] - 1.0;
  const slope10 = closes[-1] - closes[-11];
  const last15Low = Math.min(...closes.slice(-16));
  const prev15Low = Math.min(...closes.slice(-31, -15));
  
  const stabilized = (
    ret5 > 0.0005 &&
    slope10 > 0 &&
    last15Low >= prev15Low &&
    ret15 > -0.0025
  );
  
  return { ret5, ret15, slope10, stabilized };
}

/**
 * Calculate fair probability and z-score
 * @param {number} openPx - Binance 1H candle open price
 * @param {number} spot - Current BTC spot price
 * @param {number} sigma1m - Realized volatility from 1m closes
 * @param {number} minutesLeft - Minutes remaining in the hour
 * @returns {{fairUp: number, fairDown: number, z: number, edge: number}}
 */
function calculateFairProbability(openPx, spot, sigma1m, minutesLeft) {
  if (openPx <= 0) return { fairUp: 0.5, fairDown: 0.5, z: 0, edge: 0 };
  
  const curRet = (spot - openPx) / openPx;
  
  if (!sigma1m || sigma1m <= 0 || minutesLeft <= 0) {
    return {
      fairUp: curRet > 0 ? 1.0 : (curRet < 0 ? 0.0 : 0.5),
      fairDown: curRet > 0 ? 0.0 : (curRet < 0 ? 1.0 : 0.5),
      z: 0,
      edge: 0
    };
  }
  
  const stdev = sigma1m * Math.sqrt(Math.max(0.1, minutesLeft));
  const z = curRet / Math.max(1e-9, stdev);
  const fairUp = Math.max(0.0, Math.min(1.0, normalCDF(z)));
  const fairDown = 1 - fairUp;
  
  return { fairUp, fairDown, z, edge: 0 }; // Edge calculated separately with market price
}

/**
 * Main analysis function
 * @param {number} marketPriceUp - Current Polymarket price for Up outcome
 * @param {number} minutesLeft - Minutes remaining in the hour (default: 30)
 * @returns {Promise<Object>} Complete analysis result
 */
async function analyzeDrakec48(marketPriceUp, minutesLeft = 30) {
  try {
    // Fetch data
    const [klines, spot] = await Promise.all([
      fetchKlines('BTCUSDT', '1m', 60),
      fetchSpot('BTCUSDT')
    ]);
    
    const closes = klines.map(k => k.close);
    const sigma1m = realizedSigma(closes);
    const openPx = klines[0].open; // 1h open from first 1m kline
    
    // Calculate fair probability
    const { fairUp, fairDown, z } = calculateFairProbability(openPx, spot, sigma1m, minutesLeft);
    
    // Calculate edge
    const edgeUp = fairUp - marketPriceUp;
    const edgeDown = fairDown - (1 - marketPriceUp);
    
    // Determine directional guardrail
    const zGuard = 0.25;
    let directionalSignal = 'NEUTRAL';
    if (z >= zGuard) directionalSignal = 'UP_ONLY'; // Don't bet Down
    if (z <= -zGuard) directionalSignal = 'DOWN_ONLY'; // Don't bet Up
    
    // Determine confidence for hold-to-preclose
    const zHold = 2.5;
    let holdToPreclose = false;
    if (z >= zHold && marketPriceUp > 0.5) holdToPreclose = true;
    if (z <= -zHold && marketPriceUp < 0.5) holdToPreclose = true;
    
    // Regime analysis
    const regime = calculateRegime(closes);
    
    return {
      success: true,
      data: {
        spot,
        openPx,
        sigma1m,
        minutesLeft,
        fairUp,
        fairDown,
        z,
        edgeUp,
        edgeDown,
        directionalSignal,
        holdToPreclose,
        regime,
        timestamp: new Date().toISOString()
      },
      recommendation: {
        bestEdge: Math.max(edgeUp, edgeDown),
        edgeThreshold: 0.06,
        shouldTrade: Math.max(edgeUp, edgeDown) > 0.06,
        direction: edgeUp > edgeDown ? 'UP' : 'DOWN',
        guardrailActive: Math.abs(z) >= zGuard,
        notes: []
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export { analyzeDrakec48, calculateFairProbability, fetchKlines, fetchSpot, realizedSigma, normalCDF };
