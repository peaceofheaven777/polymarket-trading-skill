
import { initClient, getClient, getPolygonProvider } from './src/services/client.js';
import config from './src/config/index.js';
import { ethers } from 'ethers';

async function main() {
    await initClient();
    const clob = getClient();
    const provider = await getPolygonProvider();
    
    console.log("Checking for open positions/token balances...");
    
    // 1. Check open orders
    console.log("\n--- Open Orders ---");
    try {
        const orders = await clob.getOpenOrders();
        console.log(JSON.stringify(orders, null, 2));
    } catch (e) {
        console.error("Error fetching open orders:", e.message);
    }
    
    // 2. Check positions from CLOB API
    console.log("\n--- CLOB Positions ---");
    try {
        // clob.getPositions() returns an array of positions
        // Note: The library might have a different method name depending on version, 
        // but typically it's getPositions.
        const positions = await clob.getSamplingMarkets({ limit: 100 }); 
        // Actually, let's use the scan method if it exists or just check known tokens if we had them.
        // Since we don't know the tokenIds, let's try to get them from the user's history.
    } catch (e) {
        console.error("Error fetching sampling markets:", e.message);
    }

    // 3. Check specific token balances from history
    console.log("\n--- Token Balances (from history) ---");
    const fs = await import('fs');
    if (fs.existsSync('data/processed_trades.json')) {
        const data = JSON.parse(fs.readFileSync('data/processed_trades.json', 'utf8'));
        const tradeIds = data.tradeIds || [];
        // This only has trade hashes, not tokenIds.
    }
    
    // Let's try to get all positions directly
    try {
        // Some versions of clob-client use getPositions
        const pos = await clob.getPositions();
        console.log(JSON.stringify(pos, null, 2));
    } catch (e) {
        // console.log("getPositions() not available or failed:", e.message);
    }

    process.exit(0);
}

main();
