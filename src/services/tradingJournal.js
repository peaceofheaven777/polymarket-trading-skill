/**
 * Trading Journal & Loss Analyzer
 * Tracks trades and learns from mistakes
 */

import fs from 'fs';
import path from 'path';

const JOURNAL_FILE = './data/trading-journal.json';
const LOSS_ANALYSIS_FILE = './data/loss-analysis.json';

// Initialize files
function initJournal() {
    if (!fs.existsSync('./data')) fs.mkdirSync('./data');
    if (!fs.existsSync(JOURNAL_FILE)) {
        fs.writeFileSync(JOURNAL_FILE, JSON.stringify({ trades: [], stats: { wins: 0, losses: 0, total: 0 } }));
    }
    if (!fs.existsSync(LOSS_ANALYSIS_FILE)) {
        fs.writeFileSync(LOSS_ANALYSIS_FILE, JSON.stringify({ analyses: [], patterns: [] }));
    }
}

/**
 * Record a trade
 */
export function recordTrade(trade) {
    initJournal();
    const journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8'));
    
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        asset: trade.asset, // BTC, ETH
        direction: trade.direction, // UP, DOWN
        entryPrice: trade.entryPrice,
        outcome: trade.outcome, // 'win', 'loss'
        pnl: trade.pnl || 0,
        reason: trade.reason || {},
        indicators: trade.indicators || {},
        zScore: trade.zScore,
        rsi: trade.rsi,
        edge: trade.edge,
        confidence: trade.confidence,
        marketUp: trade.marketUp,
        marketDown: trade.marketDown
    };
    
    journal.trades.push(entry);
    journal.stats.total++;
    if (trade.outcome === 'win') journal.stats.wins++;
    else journal.stats.losses++;
    
    fs.writeFileSync(JOURNAL_FILE, JSON.stringify(journal, null, 2));
    
    // Analyze if loss
    if (trade.outcome === 'loss') {
        analyzeLoss(entry);
    }
    
    return entry;
}

/**
 * Analyze why a trade lost
 */
function analyzeLoss(trade) {
    const analysis = JSON.parse(fs.readFileSync(LOSS_ANALYSIS_FILE, 'utf8'));
    
    const reasons = [];
    
    // 1. Check if RSI was extreme (often reverses)
    if (trade.rsi) {
        if (trade.rsi < 25) reasons.push({ factor: 'RSI', issue: 'Oversold - likely bounce', severity: 'high' });
        if (trade.rsi > 75) reasons.push({ factor: 'RSI', issue: 'Overbought - likely reverse', severity: 'high' });
    }
    
    // 2. Check Z-Score - did we bet against trend?
    if (trade.zScore) {
        if (Math.abs(trade.zScore) > 0.25) {
            if (trade.direction === 'UP' && trade.zScore < -0.25) {
                reasons.push({ factor: 'Z-Score', issue: 'Bet UP but Z-Score negative (bearish)', severity: 'critical' });
            }
            if (trade.direction === 'DOWN' && trade.zScore > 0.25) {
                reasons.push({ factor: 'Z-Score', issue: 'Bet DOWN but Z-Score positive (bullish)', severity: 'critical' });
            }
        }
    }
    
    // 3. Check edge - was edge too low?
    if (trade.edge && trade.edge < 0.08) {
        reasons.push({ factor: 'Edge', issue: `Edge too low (${(trade.edge*100).toFixed(1)}%)`, severity: 'high' });
    }
    
    // 4. Check confidence
    if (trade.confidence && trade.confidence < 0.60) {
        reasons.push({ factor: 'Confidence', issue: `Confidence too low (${(trade.confidence*100).toFixed(0)}%)`, severity: 'medium' });
    }
    
    // 5. Check market sentiment vs bet
    if (trade.marketUp && trade.marketDown) {
        if (trade.direction === 'UP' && trade.marketDown > trade.marketUp) {
            reasons.push({ factor: 'Market', issue: 'Market favoring DOWN but bet UP', severity: 'high' });
        }
        if (trade.direction === 'DOWN' && trade.marketUp > trade.marketDown) {
            reasons.push({ factor: 'Market', issue: 'Market favoring UP but bet DOWN', severity: 'high' });
        }
    }
    
    // 6. EMA alignment
    if (trade.indicators?.ema5 && trade.indicators?.ema15) {
        const emaTrend = trade.indicators.ema5 > trade.indicators.ema15 ? 'bullish' : 'bearish';
        if (trade.direction === 'UP' && emaTrend === 'bearish') {
            reasons.push({ factor: 'EMA', issue: 'EMA bearish but bet UP', severity: 'medium' });
        }
        if (trade.direction === 'DOWN' && emaTrend === 'bullish') {
            reasons.push({ factor: 'EMA', issue: 'EMA bullish but bet DOWN', severity: 'medium' });
        }
    }
    
    const entry = {
        id: Date.now(),
        timestamp: trade.timestamp,
        tradeId: trade.id,
        asset: trade.asset,
        direction: trade.direction,
        reasons: reasons,
        summary: reasons.length > 0 ? reasons.map(r => r.factor).join(', ') : 'Unknown'
    };
    
    analysis.analyses.push(entry);
    
    // Find patterns
    const patterns = {};
    for (const a of analysis.analyses) {
        for (const r of a.reasons) {
            if (!patterns[r.factor]) patterns[r.factor] = { count: 0, severity: {} };
            patterns[r.factor].count++;
            patterns[r.factor].severity[r.severity] = (patterns[r.factor].severity[r.severity] || 0) + 1;
        }
    }
    analysis.patterns = Object.entries(patterns).map(([factor, data]) => ({ factor, ...data }));
    
    fs.writeFileSync(LOSS_ANALYSIS_FILE, JSON.stringify(analysis, null, 2));
    
    return entry;
}

/**
 * Get recommendations for next trades based on past losses
 */
export function getRecommendations() {
    initJournal();
    const analysis = JSON.parse(fs.readFileSync(LOSS_ANALYSIS_FILE, 'utf8'));
    const journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8'));
    
    const recommendations = [];
    
    // Analyze patterns
    if (analysis.patterns) {
        for (const pattern of analysis.patterns) {
            if (pattern.count >= 2) {
                switch (pattern.factor) {
                    case 'Z-Score':
                        recommendations.push({
                            priority: 'HIGH',
                            rule: 'NEVER bet against Z-Score direction when |z| > 0.25',
                            reason: `Lost ${pattern.count} times betting against Z-Score`
                        });
                        break;
                    case 'RSI':
                        recommendations.push({
                            priority: 'MEDIUM',
                            rule: 'Avoid betting when RSI < 25 or RSI > 75 (extreme)',
                            reason: `Lost ${pattern.count} times at RSI extremes`
                        });
                        break;
                    case 'Edge':
                        recommendations.push({
                            priority: 'HIGH',
                            rule: 'Require edge >= 8% (higher than 6%)',
                            reason: `Lost ${pattern.count} times with low edge`
                        });
                        break;
                    case 'EMA':
                        recommendations.push({
                            priority: 'MEDIUM',
                            rule: 'Bet with EMA trend, not against',
                            reason: `Lost ${pattern.count} times betting against EMA`
                        });
                        break;
                    case 'Market':
                        recommendations.push({
                            priority: 'HIGH',
                            rule: 'Follow market sentiment (the crowd)',
                            reason: `Lost ${pattern.count} times fighting market`
                        });
                        break;
                }
            }
        }
    }
    
    // Win rate by asset
    const assetStats = {};
    for (const trade of journal.trades) {
        if (!assetStats[trade.asset]) assetStats[trade.asset] = { wins: 0, losses: 0 };
        if (trade.outcome === 'win') assetStats[trade.asset].wins++;
        else assetStats[trade.asset].losses++;
    }
    
    const winRates = Object.entries(assetStats).map(([asset, stats]) => ({
        asset,
        winRate: stats.wins / (stats.wins + stats.losses) * 100,
        total: stats.wins + stats.losses
    }));
    
    // Direction stats
    const dirStats = { UP: { wins: 0, losses: 0 }, DOWN: { wins: 0, losses: 0 } };
    for (const trade of journal.trades) {
        if (trade.direction && dirStats[trade.direction]) {
            if (trade.outcome === 'win') dirStats[trade.direction].wins++;
            else dirStats[trade.direction].losses++;
        }
    }
    
    const dirWinRates = Object.entries(dirStats).map(([dir, stats]) => ({
        direction: dir,
        winRate: stats.wins / (stats.wins + stats.losses) * 100 || 0,
        total: stats.wins + stats.losses
    }));
    
    return {
        recommendations,
        winRates,
        dirWinRates,
        totalStats: journal.stats,
        patternCount: analysis.analyses.length
    };
}

/**
 * Get recent trades
 */
export function getRecentTrades(limit = 10) {
    initJournal();
    const journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8'));
    return journal.trades.slice(-limit).reverse();
}

export default {
    recordTrade,
    getRecommendations,
    getRecentTrades
};
