/**
 * Trading Journal - Self-Learning System
 * 
 * Based on: crypto-self-learning skill
 * Logs trades, analyzes patterns, generates rules
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const TRADES_FILE = join(DATA_DIR, 'trades.json');

/**
 * Load trades from file
 */
function loadTrades() {
  try {
    if (existsSync(TRADES_FILE)) {
      const data = readFileSync(TRADES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error loading trades:', e.message);
  }
  return { trades: [], metadata: { created: new Date().toISOString() } };
}

/**
 * Save trades to file
 */
function saveTradesSync(data) {
  try {
    // Ensure directory exists
    try {
      mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) { /* ignore */ }
    
    data.metadata.updated = new Date().toISOString();
    writeFileSync(TRADES_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Error saving trades:', e.message);
    return false;
  }
}

/**
 * Log a trade with full context
 */
export function logTrade(trade) {
  const data = loadTrades();
  
  const newTrade = {
    id: Date.now().toString(36),
    timestamp: new Date().toISOString(),
    symbol: trade.symbol?.toUpperCase() || 'BTCUSDT',
    direction: trade.direction?.toUpperCase() || 'LONG',
    entry: parseFloat(trade.entry),
    exit: parseFloat(trade.exit),
    pnl_percent: parseFloat(trade.pnl_percent),
    result: trade.pnl_percent > 0 ? 'WIN' : 'LOSS',
    leverage: trade.leverage || 1,
    reason: trade.reason || '',
    indicators: trade.indicators || {},
    market_context: trade.market_context || {},
    notes: trade.notes || '',
    day_of_week: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
    hour: new Date().getHours()
  };
  
  data.trades.push(newTrade);
  saveTradesSync(data);
  
  return { success: true, trade: newTrade };
}

/**
 * Analyze trade patterns
 */
export function analyzeTrades(filters = {}) {
  const data = loadTrades();
  let trades = data.trades || [];
  
  // Apply filters
  if (filters.symbol) {
    trades = trades.filter(t => t.symbol === filters.symbol);
  }
  if (filters.direction) {
    trades = trades.filter(t => t.direction === filters.direction);
  }
  if (filters.minTrades) {
    // Already filtered above
  }
  
  if (trades.length === 0) {
    return { success: false, message: 'No trades found' };
  }
  
  // Calculate overall win rate
  const wins = trades.filter(t => t.result === 'WIN').length;
  const winRate = (wins / trades.length * 100).toFixed(1);
  
  // Analyze by direction
  const byDirection = {};
  for (const dir of ['LONG', 'SHORT']) {
    const dirTrades = trades.filter(t => t.direction === dir);
    if (dirTrades.length > 0) {
      const dirWins = dirTrades.filter(t => t.result === 'WIN').length;
      byDirection[dir] = {
        trades: dirTrades.length,
        wins: dirWins,
        winRate: (dirWins / dirTrades.length * 100).toFixed(1)
      };
    }
  }
  
  // Analyze by day of week
  const byDay = {};
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  for (const day of days) {
    const dayTrades = trades.filter(t => t.day_of_week === day);
    if (dayTrades.length > 0) {
      const dayWins = dayTrades.filter(t => t.result === 'WIN').length;
      byDay[day] = {
        trades: dayTrades.length,
        wins: dayWins,
        winRate: (dayWins / dayTrades.length * 100).toFixed(1)
      };
    }
  }
  
  // Analyze by RSI range
  const byRSI = {
    oversold: { range: '<30', trades: 0, wins: 0 },
    neutral: { range: '30-70', trades: 0, wins: 0 },
    overbought: { range: '>70', trades: 0, wins: 0 }
  };
  
  for (const trade of trades) {
    const rsi = trade.indicators?.rsi;
    if (rsi !== undefined) {
      let bucket;
      if (rsi < 30) bucket = 'oversold';
      else if (rsi > 70) bucket = 'overbought';
      else bucket = 'neutral';
      
      byRSI[bucket].trades++;
      if (trade.result === 'WIN') byRSI[bucket].wins++;
    }
  }
  
  for (const bucket of Object.keys(byRSI)) {
    if (byRSI[bucket].trades > 0) {
      byRSI[bucket].winRate = (byRSI[bucket].wins / byRSI[bucket].trades * 100).toFixed(1);
    }
  }
  
  // Calculate average P&L
  const avgPnL = (trades.reduce((sum, t) => sum + t.pnl_percent, 0) / trades.length).toFixed(2);
  
  return {
    success: true,
    summary: {
      totalTrades: trades.length,
      wins: wins,
      losses: trades.length - wins,
      winRate: winRate + '%',
      avgPnL: avgPnL + '%'
    },
    byDirection,
    byDay,
    byRSI
  };
}

/**
 * Generate rules from trade history
 */
export function generateRules() {
  const analysis = analyzeTrades();
  const rules = [];
  
  if (!analysis.success) {
    return { success: false, rules: [], message: 'Not enough data' };
  }
  
  // Check direction performance
  for (const [dir, data] of Object.entries(analysis.byDirection)) {
    if (data.trades >= 3) {
      if (parseFloat(data.winRate) >= 60) {
        rules.push({ type: 'PREFER', condition: `${dir} trades`, winRate: data.winRate, n: data.trades });
      } else if (parseFloat(data.winRate) <= 40) {
        rules.push({ type: 'AVOID', condition: `${dir} trades`, winRate: data.winRate, n: data.trades });
      }
    }
  }
  
  // Check day performance
  for (const [day, data] of Object.entries(analysis.byDay)) {
    if (data.trades >= 3) {
      if (parseFloat(data.winRate) >= 60) {
        rules.push({ type: 'PREFER', condition: `Trades on ${day}`, winRate: data.winRate, n: data.trades });
      } else if (parseFloat(data.winRate) <= 40) {
        rules.push({ type: 'AVOID', condition: `Trades on ${day}`, winRate: data.winRate, n: data.trades });
      }
    }
  }
  
  // Check RSI performance
  for (const [bucket, data] of Object.entries(analysis.byRSI)) {
    if (data.trades >= 3) {
      if (parseFloat(data.winRate) >= 60) {
        rules.push({ type: 'PREFER', condition: `RSI ${data.range}`, winRate: data.winRate, n: data.trades });
      } else if (parseFloat(data.winRate) <= 40) {
        rules.push({ type: 'AVOID', condition: `RSI ${data.range}`, winRate: data.winRate, n: data.trades });
      }
    }
  }
  
  return { success: true, rules };
}

/**
 * Get statistics
 */
export function getStats() {
  const data = loadTrades();
  const trades = data.trades || [];
  
  if (trades.length === 0) {
    return { success: true, stats: { total: 0, wins: 0, losses: 0, winRate: '0%' } };
  }
  
  const wins = trades.filter(t => t.result === 'WIN').length;
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl_percent, 0);
  
  return {
    success: true,
    stats: {
      total: trades.length,
      wins: wins,
      losses: trades.length - wins,
      winRate: (wins / trades.length * 100).toFixed(1) + '%',
      totalPnL: totalPnL.toFixed(2) + '%',
      avgPnL: (totalPnL / trades.length).toFixed(2) + '%'
    }
  };
}

export default {
  logTrade,
  analyzeTrades,
  generateRules,
  getStats
};
