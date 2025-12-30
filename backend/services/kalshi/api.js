const fetch = require('node-fetch');

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2/markets';

/**
 * Fetch markets directly from Kalshi (Live/Recent)
 * @param {number} limit - Number of markets to fetch
 * @returns {Promise<Array>} Array of markets
 */
async function fetchLiveMarkets(limit = 100) {
    console.log('📊 Fetching Kalshi markets...');

    try {
        const response = await fetch(`${KALSHI_API}?limit=${limit}&status=open`);

        if (!response.ok) {
            throw new Error(`Kalshi API error: ${response.status}`);
        }

        const data = await response.json();
        const markets = data.markets || [];

        const result = markets
            .filter(m => m.yes_bid !== undefined && m.yes_ask !== undefined)
            .map(transformMarket);

        console.log(`   ✅ Returning ${result.length} active markets`);
        return result;
    } catch (error) {
        console.error('Error fetching Kalshi markets:', error);
        throw error;
    }
}

/**
 * Fetch ALL markets from Kalshi with pagination (For DB Sync)
 */
async function fetchAllMarkets() {
    const allMarkets = [];
    let cursor = null;
    let page = 0;

    console.log('📊 Fetching ALL Kalshi markets (starting)...');

    while (true) {
        page++;
        const url = cursor
            ? `${KALSHI_API}?limit=200&status=open&cursor=${cursor}`
            : `${KALSHI_API}?limit=200&status=open`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Kalshi API error: ${response.status}`);
            break;
        }

        const data = await response.json();
        const markets = data.markets || [];

        if (markets.length === 0) break;

        for (const m of markets) {
            // Skip markets without real prices for DB too? 
            // Yes, consistent with original logic
            if (m.yes_bid === undefined || m.yes_ask === undefined) continue;
            allMarkets.push(transformMarket(m));
        }

        console.log(`   Page ${page}: ${markets.length} markets (total: ${allMarkets.length})`);

        cursor = data.cursor;
        if (!cursor) break;

        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`✅ Kalshi: Total ${allMarkets.length} markets`);
    return allMarkets;
}

/**
 * Transform raw Kalshi market to unified format
 */
function transformMarket(m) {
    const yesBid = parseFloat(m.yes_bid || 0) / 100;
    const yesAsk = parseFloat(m.yes_ask || 100) / 100;
    const noBid = parseFloat(m.no_bid || 0) / 100;
    const noAsk = parseFloat(m.no_ask || 100) / 100;

    const yesPrice = m.last_price
        ? parseFloat(m.last_price) / 100
        : (yesBid + yesAsk) / 2;
    const noPrice = 1 - yesPrice;

    return {
        id: m.ticker,
        platform: 'kalshi',
        platform_id: m.ticker,
        title: m.title || m.ticker,
        description: m.subtitle || m.rules_primary || '',
        status: m.status,
        yesPrice,
        noPrice,
        current_prices: {
            yes: { price: yesPrice, bid: yesBid, ask: yesAsk },
            no: { price: noPrice, bid: noBid, ask: noAsk }
        },
        volume24h: parseFloat(m.volume_24h || 0),
        volume_total: parseFloat(m.volume || 0),
        liquidity: parseFloat(m.open_interest || 0),
        eventTicker: m.event_ticker,
        closeTime: m.close_time
    };
}

module.exports = {
    fetchLiveMarkets,
    fetchAllMarkets
};
