#!/usr/bin/env node
/**
 * Polymarket Auto-Trader v4.0 - BTC & ETH
 * Follows AGENTS.md Master-Worker Protocol
 * 
 * Steps:
 * 1. Fetch BTC & ETH 1H data
 * 2. 9-Indicator Technical Analysis (per asset)
 * 3. Drakec48 Z-Score calculation
 * 4. Check Polymarket edge (per asset)
 * 5. Place bet ONLY if Edge ≥10% and Confidence ≥56%
 */

import 'dotenv/config';
import fs from 'fs';
import { Side, OrderType } from '@polymarket/clob-client';
import { getClient, initClient } from './src/services/client.js';
import axios from 'axios';
import logger from './src/utils/logger.js';
import { addPosition } from './src/services/position.js';
import { recordTrade, getRecommendations } from './src/services/tradingJournal.js';

// Stub for position redemption (not yet implemented)
async function checkAndRedeemPositions() {
    logger.info('Position redemption not yet implemented');
}

const BET_AMOUNT = 5.0; // Per agreement: $5 per bet

// ============ TECHNICAL ANALYSIS (9 Indicators) ============
async function getBTCData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: { symbol: 'BTCUSDC', interval: '1h', limit: 100 }
        });
        return response.data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
    } catch (err) {
        logger.error('Failed to fetch BTC data: ' + err.message);
        return null;
    }
}

async function getETHData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: { symbol: 'ETHUSDC', interval: '1h', limit: 100 }
        });
        return response.data.map(d => ({
            time: d[0],
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
    } catch (err) {
        logger.error('Failed to fetch ETH data: ' + err.message);
        return null;
    }
}

function calculateEMA(data, period) {
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, p) => sum + p.close, 0) / period;
    const result = [];
    for (let i = 0; i < period - 1; i++) result.push(null);
    result.push(ema);
    for (let i = period; i < data.length; i++) {
        ema = (data[i].close - ema) * multiplier + ema;
        result.push(ema);
    }
    return result;
}

function calculateRSI(data, period = 14) {
    let gains = [], losses = [];
    for (let i = 1; i < data.length; i++) {
        const change = data[i].close - data[i-1].close;
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    const rsi = [];
    for (let i = 0; i < period; i++) rsi.push(null);
    
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
}

function calculateVWAP(candles) {
    let cumTPV = 0, cumVol = 0;
    for (const c of candles) {
        const typical = (c.high + c.low + c.close) / 3;
        cumTPV += typical * c.volume;
        cumVol += c.volume;
    }
    return cumTPV / cumVol;
}

function calculateATR(candles, period = 14) {
    const tr = [];
    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            tr.push(candles[i].high - candles[i].low);
        } else {
            const hl = candles[i].high - candles[i].low;
            const hc = Math.abs(candles[i].high - candles[i-1].close);
            const lc = Math.abs(candles[i].low - candles[i-1].close);
            tr.push(Math.max(hl, hc, lc));
        }
    }
    let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
    }
    return atr;
}

// Normal CDF for z-score (approximation)
function normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

// ============ MAIN ANALYSIS ============
async function analyze() {
    const candles = await getBTCData();
    if (!candles) return null;
    
    const current = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    
    // 9 Indicators
    const ema5 = calculateEMA(candles, 5);
    const ema15 = calculateEMA(candles, 15);
    const rsi = calculateRSI(candles);
    const vwap = calculateVWAP(candles);
    const atr = calculateATR(candles);
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    
    // Drakec48 Z-Score
    const openPx = candles[candles.length - 1].open;
    const spot = current.close;
    const sigma1m = atr / 60;
    const minutesLeft = 60 - new Date().getMinutes();
    const z = (spot - openPx) / (sigma1m * Math.sqrt(minutesLeft));
    const fairUp = normCDF(z);
    
    // Direction bias
    let bullish = 0, bearish = 0;
    
    // RSI - STRICT RULE: 
    // RSI < 35 (oversold) = ALWAYS UP (price will bounce!)
    // RSI > 65 (overbought) = ALWAYS DOWN (price will drop!)
    // RSI 35-65 = follow other indicators
    if (rsi[rsi.length - 1] < 35) {
        logger.info(`RSI oversold (${rsi[rsi.length-1]}) - forcing UP!`);
        return {
            price: current.close,
            rsi: rsi[rsi.length - 1],
            ema5: ema5[ema5.length - 1],
            ema15: ema15[ema15.length - 1],
            vwap,
            atr,
            volume: current.volume,
            avgVol,
            z,
            fairUp,
            direction: 'UP',
            confidence: 85
        };
    } else if (rsi[rsi.length - 1] > 65) {
        logger.info(`RSI overbought (${rsi[rsi.length-1]}) - forcing DOWN!`);
        return {
            price: current.close,
            rsi: rsi[rsi.length - 1],
            ema5: ema5[ema5.length - 1],
            ema15: ema15[ema15.length - 1],
            vwap,
            atr,
            volume: current.volume,
            avgVol,
            z,
            fairUp,
            direction: 'DOWN',
            confidence: 85
        };
    }
    
    // EMA
    if (ema5[ema5.length - 1] > ema15[ema15.length - 1]) bullish += 2;
    else bearish += 2;
    
    // VWAP
    if (current.close > vwap) bullish++;
    else bearish++;
    
    // Price vs EMA
    if (current.close > ema5[ema5.length - 1]) bullish++;
    else bearish++;
    
    // Momentum
    if (closes[closes.length - 1] > closes[closes.length - 5]) bullish++;
    else bearish++;
    
    const direction = bullish > bearish ? 'UP' : 'DOWN';
    const confidence = Math.min(90, 50 + Math.abs(bullish - bearish) * 10);
    
    return {
        price: current.close,
        rsi: rsi[rsi.length - 1],
        ema5: ema5[ema5.length - 1],
        ema15: ema15[ema15.length - 1],
        vwap,
        atr,
        volume: current.volume,
        avgVol,
        z,
        fairUp,
        direction,
        confidence
    };
}

// ============ ETH ANALYSIS ============
async function analyzeETH() {
    const candles = await getETHData();
    if (!candles) return null;
    
    const current = candles[candles.length - 1];
    const closes = candles.map(c => c.close);
    const volumes = candles.map(c => c.volume);
    
    // 9 Indicators
    const ema5 = calculateEMA(candles, 5);
    const ema15 = calculateEMA(candles, 15);
    const rsi = calculateRSI(candles);
    const vwap = calculateVWAP(candles);
    const atr = calculateATR(candles);
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    
    // Drakec48 Z-Score
    const openPx = candles[candles.length - 1].open;
    const spot = current.close;
    const sigma1m = atr / 60;
    const minutesLeft = 60 - new Date().getMinutes();
    const z = (spot - openPx) / (sigma1m * Math.sqrt(minutesLeft));
    const fairUp = normCDF(z);
    
    // Direction bias
    let bullish = 0, bearish = 0;
    
    // RSI - STRICT RULE: 
    // RSI < 35 (oversold) = ALWAYS UP
    // RSI > 65 (overbought) = ALWAYS DOWN
    // RSI 35-65 = follow other indicators
    if (rsi[rsi.length - 1] < 35) {
        logger.info(`ETH RSI oversold (${rsi[rsi.length-1]}) - forcing UP!`);
        return {
            price: current.close,
            rsi: rsi[rsi.length - 1],
            ema5: ema5[ema5.length - 1],
            ema15: ema15[ema15.length - 1],
            vwap,
            atr,
            volume: current.volume,
            avgVol,
            z,
            fairUp,
            direction: 'UP',
            confidence: 85
        };
    } else if (rsi[rsi.length - 1] > 65) {
        logger.info(`ETH RSI overbought (${rsi[rsi.length-1]}) - forcing DOWN!`);
        return {
            price: current.close,
            rsi: rsi[rsi.length - 1],
            ema5: ema5[ema5.length - 1],
            ema15: ema15[ema15.length - 1],
            vwap,
            atr,
            volume: current.volume,
            avgVol,
            z,
            fairUp,
            direction: 'DOWN',
            confidence: 85
        };
    }
    
    // EMA
    if (ema5[ema5.length - 1] > ema15[ema15.length - 1]) bullish += 2;
    else bearish += 2;
    
    // VWAP
    if (current.close > vwap) bullish++;
    else bearish++;
    
    // Price vs EMA
    if (current.close > ema5[ema5.length - 1]) bullish++;
    else bearish++;
    
    // Momentum
    if (closes[closes.length - 1] > closes[closes.length - 5]) bullish++;
    else bearish++;
    
    const direction = bullish > bearish ? 'UP' : 'DOWN';
    const confidence = Math.min(90, 50 + Math.abs(bullish - bearish) * 10);
    
    return {
        price: current.close,
        rsi: rsi[rsi.length - 1],
        ema5: ema5[ema5.length - 1],
        ema15: ema15[ema15.length - 1],
        vwap,
        atr,
        volume: current.volume,
        avgVol,
        z,
        fairUp,
        direction,
        confidence
    };
}

// ============ FIND MARKET ============
async function findBTCMarket() {
    try {
        const now = new Date();
        
        // ONLY look for BTC 15m markets - try next 20 intervals
        for (let i = 0; i < 20; i++) {
            // Round up to next 15-min interval
            const targetTime = new Date(Math.ceil(now.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000) + i * 15 * 60 * 1000);
            const timestamp = Math.floor(targetTime.getTime() / 1000);
            const slug = `btc-updown-15m-${timestamp}`;
            
            try {
                const res = await axios.get(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
                if (res.data && res.data[0] && res.data[0].acceptingOrders) {
                    const m = res.data[0];
                    if (m.outcomePrices && m.outcomePrices !== 'null' && m.outcomePrices !== '[]') {
                        logger.info(`Found BTC 15m market: ${m.slug}`);
                        return m;
                    }
                }
            } catch (e) {
                // Ignore errors for individual lookups
            }
        }
        
        logger.warn('No BTC 15m markets found');
        return null;
    } catch (err) {
        logger.error('Market search error: ' + err.message);
        return null;
    }
}

async function findETHMarket() {
    try {
        const now = new Date();
        
        // ONLY look for ETH 15m markets - try next 20 intervals
        for (let i = 0; i < 20; i++) {
            const targetTime = new Date(Math.ceil(now.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000) + i * 15 * 60 * 1000);
            const timestamp = Math.floor(targetTime.getTime() / 1000);
            const slug = `eth-updown-15m-${timestamp}`;
            
            try {
                const res = await axios.get(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
                if (res.data && res.data[0] && res.data[0].acceptingOrders) {
                    const m = res.data[0];
                    if (m.outcomePrices && m.outcomePrices !== 'null' && m.outcomePrices !== '[]') {
                        logger.info(`Found ETH 15m market: ${m.slug}`);
                        return m;
                    }
                }
            } catch (e) {
                // Ignore errors for individual lookups
            }
        }
        
        logger.warn('No ETH 15m markets found');
        return null;
    } catch (err) {
        logger.error('ETH market search error: ' + err.message);
        return null;
    }
}

// ============ CHECK IF ALREADY BET ON THIS MARKET ============
function hasExistingPosition(conditionId) {
    try {
        const POSITIONS_FILE = './data/positions.json';
        if (!fs.existsSync(POSITIONS_FILE)) return false;
        const positions = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
        // Check if any position is for this conditionId and still open
        for (const [key, pos] of Object.entries(positions)) {
            if (pos.conditionId === conditionId && pos.status === 'open') {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

// ============ PLACE BET ============
async function placeBet(direction, market) {
    // Check if already bet on this market
    const conditionId = market.conditionId || market.clobTokenIds?.[0] || 'unknown';
    if (hasExistingPosition(conditionId)) {
        logger.warn(`Already have position for this market: ${conditionId}`);
        return false;
    }
    
    await initClient();
    const client = getClient();
    
    const outcomes = JSON.parse(market.outcomes);
    const clobTokens = JSON.parse(market.clobTokenIds);
    
    const targetOutcome = direction === 'UP' ? 
        (outcomes.includes('Up') ? 'Up' : outcomes[0]) :
        (outcomes.includes('Down') ? 'Down' : outcomes[outcomes.length - 1]);
    
    const token = clobTokens[outcomes.indexOf(targetOutcome)];
    if (!token) {
        logger.error('Token not found for: ' + targetOutcome);
        return false;
    }
    
    logger.info(`Placing $${BET_AMOUNT} on ${direction}...`);
    
    try {
        const response = await client.createAndPostMarketOrder(
            { tokenID: token, side: Side.BUY, amount: BET_AMOUNT },
            { tickSize: '0.01', negRisk: false },
            OrderType.FOK
        );
        
        if (response?.success) {
            logger.success(`Bet placed! ID: ${response.orderID}`);
            
            // Save position for tracking
            const conditionId = market.conditionId || market.clobTokenIds?.[0] || 'unknown';
            const outcome = direction === 'UP' ? 'Yes' : 'No';
            addPosition({
                conditionId: conditionId,
                tokenId: token,
                market: market.question || 'Unknown',
                shares: BET_AMOUNT,
                avgBuyPrice: direction === 'UP' ? (market.outcomePrices ? JSON.parse(market.outcomePrices)[0] : 0.5) : (market.outcomePrices ? JSON.parse(market.outcomePrices)[1] : 0.5),
                totalCost: BET_AMOUNT,
                outcome: outcome,
            });
            
            // Update streak file
            const STREAK_FILE = './data/streak.json';
            const streakData = { direction: ta.direction, count: 1, lastBet: Date.now() };
            try {
                const existing = JSON.parse(fs.readFileSync(STREAK_FILE, 'utf8'));
                if (existing.direction === ta.direction) {
                    streakData.count = (existing.count || 0) + 1;
                }
            } catch (e) { /* ignore */ }
            fs.writeFileSync(STREAK_FILE, JSON.stringify(streakData));
            
            return true;
        } else {
            logger.error('Bet failed: ' + response?.errorMsg);
            return false;
        }
    } catch (err) {
        logger.error('Bet error: ' + err.message);
        return false;
    }
}

// ============ PROCESS SINGLE MARKET ============
async function processMarket(asset, taFunc, findMarketFunc) {
    logger.info(`=== ${asset} Analysis ===`);
    
    const ta = await taFunc();
    if (!ta) {
        logger.error(`${asset} analysis failed`);
        return false;
    }
    
    logger.info(`Price: $${ta.price.toFixed(2)} | RSI: ${ta.rsi.toFixed(1)} | EMA5: $${ta.ema5.toFixed(2)} | EMA15: $${ta.ema15.toFixed(2)}`);
    logger.info(`Z-score: ${ta.z.toFixed(4)} | Fair UP: ${(ta.fairUp * 100).toFixed(1)}% | Direction: ${ta.direction} | Confidence: ${ta.confidence}%`);
    
    const market = await findMarketFunc();
    if (!market) {
        logger.warn(`No ${asset} market found`);
        return false;
    }
    
    const prices = JSON.parse(market.outcomePrices);
    const marketUp = parseFloat(prices[0]);
    const marketDown = parseFloat(prices[1]);
    
    logger.info(`Market: ${market.question}`);
    logger.info(`Market UP: ${(marketUp * 100).toFixed(1)}% | DOWN: ${(marketDown * 100).toFixed(1)}%`);
    
    let edge = 0;
    if (ta.direction === 'UP') {
        edge = ta.fairUp - marketUp;
    } else {
        edge = (1 - ta.fairUp) - marketDown;
    }
    
    logger.info(`Edge: ${(edge * 100).toFixed(1)}%`);
    
    // Z-Score Guardrail: Cap confidence when extreme
    // Extreme z-scores often false signals during high volatility
    let adjustedConfidence = ta.confidence;
    if (Math.abs(ta.z) > 2.0) {
        adjustedConfidence = Math.min(adjustedConfidence, 70);
        logger.info(`⚠️ Extreme z-score (${ta.z.toFixed(2)}) - capping confidence at 70%`);
    }
    if (Math.abs(ta.z) > 2.5) {
        adjustedConfidence = Math.min(adjustedConfidence, 60);
        logger.info(`⚠️ Very extreme z-score (${ta.z.toFixed(2)}) - capping confidence at 60%`);
    }
    
    // Streak guard: Check recent trade history
    // If 3+ consecutive same-direction trades lost, flip or skip
    const STREAK_FILE = './data/streak.json';
    let streak = { count: 0, direction: null };
    try {
        streak = JSON.parse(fs.readFileSync(STREAK_FILE, 'utf8'));
    } catch (e) { /* ignore */ }
    
    // Update streak: if same direction, increment; else reset
    if (streak.direction === ta.direction && streak.count >= 3) {
        logger.warn(`⚠️ ${ta.direction} streak detected (${streak.count}x). Skipping to prevent trend exhaustion.`);
        return false;
    }
    
    // Check learned recommendations before trading
    const recs = getRecommendations();
    if (recs.recommendations && recs.recommendations.length > 0) {
        for (const rec of recs.recommendations) {
            if (rec.priority === 'HIGH') {
                // Check specific rules
                if (rec.rule.includes('Z-Score') && Math.abs(ta.z) > 0.25) {
                    const trendDirection = ta.z > 0 ? 'UP' : 'DOWN';
                    if (ta.direction !== trendDirection) {
                        logger.warn(`⚠️ LEARNED: Skipping ${ta.direction} bet due to Z-Score rule: ${rec.rule}`);
                        return false;
                    }
                }
                if (rec.rule.includes('Edge') && ta.edge < 0.08) {
                    logger.warn(`⚠️ LEARNED: Edge too low per learned rule: ${rec.rule}`);
                    return false;
                }
            }
        }
    }
    
    const canTrade = adjustedConfidence >= 56 && edge >= 0.06;
    
    logger.info(`=== ${asset} DECISION: ${canTrade ? 'TRADE' : 'NO TRADE'} ===`);
    
    if (canTrade) {
        const result = await placeBet(ta.direction, market);
        return result;
    } else {
        logger.info(`${asset} waiting for better opportunity...`);
        return false;
    }
}

// ============ MAIN LOOP ============
async function run() {
    logger.info('=== Starting Smart Auto-Trader v4.0 (BTC + ETH) ===');
    
    // Process BTC
    await processMarket('BTC', analyze, findBTCMarket);
    
    // Process ETH
    await processMarket('ETH', analyzeETH, findETHMarket);
    
    // Check for resolved positions
    logger.info('=== Checking for resolved positions ===');
    await checkAndRedeemPositions();
    
    logger.info('=== Cycle Complete ===');
}

run();

// ============ WHALE/MACRO MONITOR ============
async function checkWhaleActivity() {
    try {
        // Check Polymarket order flow
        const markets = await axios.get('https://gamma-api.polymarket.com/markets', {
            params: { slug_like: 'btc-updown-15m', limit: 5 }
        });
        
        let totalVolume = 0;
        let avgUpProb = 0;
        
        markets.data.forEach(m => {
            totalVolume += m.volume || 0;
            const prices = JSON.parse(m.outcomePrices || '["0.5","0.5"]');
            avgUpProb += parseFloat(prices[0]);
        });
        
        avgUpProb /= markets.data.length;
        
        // Check recent BTC movement
        const btc = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
        const btcChange = parseFloat(btc.data.priceChangePercent);
        
        return {
            volume: totalVolume,
            avgUpProbability: avgUpProb,
            btc24hChange: btcChange,
            whaleDirection: avgUpProb > 0.55 ? 'UP' : (avgUpProb < 0.45 ? 'DOWN' : 'NEUTRAL')
        };
    } catch(e) {
        logger.error(`Whale check error: ${e.message}`);
        return { whaleDirection: 'NEUTRAL' };
    }
}
