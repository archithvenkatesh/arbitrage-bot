const fetch = require('node-fetch');

const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com/markets';
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com/markets';

/**
 * Fetch markets from Polymarket CLOB API
 */
async function fetchPolymarketCLOB(limit = 200) {
    try {
        const response = await fetch(`${POLYMARKET_CLOB_API}?limit=${limit}`);
        if (!response.ok) return [];

        const data = await response.json();
        const markets = data.data || data || [];

        return markets
            .filter(m => m.active && !m.closed && m.accepting_orders && m.tokens?.length >= 2)
            .map(m => {
                const tokens = m.tokens || [];
                const yesToken = tokens.find(t => t.outcome?.toLowerCase() === 'yes') || tokens[0];
                const noToken = tokens.find(t => t.outcome?.toLowerCase() === 'no') || tokens[1];
                const yesPrice = yesToken?.price ?? 0.5;

                return {
                    id: m.condition_id || m.market_slug,
                    platform: 'polymarket',
                    platform_id: m.condition_id,
                    title: m.question || m.market_slug || '',
                    description: m.description || '',
                    status: m.closed ? 'closed' : 'open',
                    current_prices: {
                        yes: { price: yesPrice, bid: yesPrice * 0.98, ask: yesPrice * 1.02 },
                        no: { price: 1 - yesPrice, bid: (1 - yesPrice) * 0.98, ask: (1 - yesPrice) * 1.02 }
                    },
                    volume_24h: 0,
                    source: 'clob'
                };
            });
    } catch (error) {
        console.error('Error fetching from CLOB API:', error.message);
        return [];
    }
}

/**
 * Fetch markets from Polymarket Gamma API
 */
async function fetchPolymarketGamma(limit = 200) {
    try {
        const response = await fetch(
            `${POLYMARKET_GAMMA_API}?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`
        );
        if (!response.ok) throw new Error(`Gamma API error: ${response.status}`);
        const markets = await response.json();

        return markets.map(m => {
            let yesPrice = 0.5;
            try {
                if (m.outcomePrices) {
                    const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
                    if (Array.isArray(prices) && prices.length >= 2) {
                        yesPrice = parseFloat(prices[0]) || 0.5;
                    }
                }
            } catch (e) { }

            return {
                id: m.id || m.conditionId,
                platform: 'polymarket',
                platform_id: m.id || m.conditionId,
                title: m.question || m.slug || '',
                description: m.description || '',
                status: m.closed ? 'closed' : 'open',
                current_prices: {
                    yes: { price: yesPrice, bid: parseFloat(m.bestBid || 0), ask: parseFloat(m.bestAsk || 1) },
                    no: { price: 1 - yesPrice, bid: 0, ask: 1 }
                },
                volume_24h: parseFloat(m.volume24hr || 0),
                volume_total: parseFloat(m.volumeNum || m.volume || 0),
                source: 'gamma'
            };
        });
    } catch (error) {
        console.error('Error fetching from Gamma API:', error.message);
        return [];
    }
}

/**
 * Fetch markets directly (Live/Recent) - Merges CLOB and Gamma
 */
async function fetchLiveMarkets(limit = 100) {
    console.log('📊 Fetching Polymarket markets (Limit: ' + limit + ')...');
    const [clobMarkets, gammaMarkets] = await Promise.all([
        fetchPolymarketCLOB(limit * 2),
        fetchPolymarketGamma(limit * 2)
    ]);

    // De-duplication and merging logic
    const gammaByTitle = new Map();
    const normalize = t => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const gm of gammaMarkets) gammaByTitle.set(normalize(gm.title), gm);

    const result = [];
    const seenTitles = new Set();

    // Prefer Gamma
    for (const gm of gammaMarkets) {
        const key = normalize(gm.title);
        if (seenTitles.has(key)) continue;
        const yesPrice = gm.current_prices?.yes?.price || 0.5;
        if (Math.abs(yesPrice - 0.5) < 0.01 && gm.volume_24h < 100) continue;
        seenTitles.add(key);
        result.push(gm);
    }

    // Fallback to CLOB
    for (const cm of clobMarkets) {
        const key = normalize(cm.title);
        if (seenTitles.has(key)) continue;
        const yesPrice = cm.current_prices?.yes?.price || 0.5;
        if (Math.abs(yesPrice - 0.5) < 0.01) continue;
        seenTitles.add(key);
        result.push(cm);
    }

    return result.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0)).slice(0, limit);
}

/**
 * Fetch ALL markets from Polymarket with pagination options (For DB Sync)
 */
async function fetchAllMarkets() {
    const allMarkets = [];
    let offset = 0;
    const limit = 100;
    let page = 0;

    console.log('📊 Fetching ALL Polymarket markets...');

    while (true) {
        page++;
        const url = `${POLYMARKET_GAMMA_API}?limit=${limit}&offset=${offset}&active=true&closed=false`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Polymarket API error: ${response.status}`);
            break;
        }
        const markets = await response.json();
        if (!markets || markets.length === 0) break;

        for (const m of markets) {
            // Simplified transformation for DB sync
            let yesPrice = 0.5;
            try {
                const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices;
                if (prices && prices.length >= 2) yesPrice = parseFloat(prices[0]);
            } catch (e) { }

            if (Math.abs(yesPrice - 0.5) < 0.01) continue;

            allMarkets.push({
                id: m.id || m.conditionId,
                platform: 'polymarket',
                title: m.question || m.slug || '',
                description: m.description || '',
                yesPrice,
                noPrice: 1 - yesPrice,
                current_prices: { yes: { price: yesPrice }, no: { price: 1 - yesPrice } },
                volume24h: parseFloat(m.volume24hr || 0),
                endDate: m.endDate
            });
        }

        console.log(`   Page ${page}: ${markets.length} markets (total: ${allMarkets.length})`);
        offset += limit;
        if (markets.length < limit) break;
        await new Promise(r => setTimeout(r, 100)); // Rate limit
    }

    console.log(`✅ Polymarket: Total ${allMarkets.length} markets`);
    return allMarkets;
}

module.exports = {
    fetchLiveMarkets,
    fetchAllMarkets
};
