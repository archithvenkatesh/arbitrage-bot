// Direct API integration for Polymarket and Kalshi
// Uses CLOB API for Polymarket to get accurate real-time prices

const fetch = require('node-fetch');

// API endpoints
const POLYMARKET_GAMMA_API = 'https://gamma-api.polymarket.com/markets';
const POLYMARKET_CLOB_API = 'https://clob.polymarket.com/markets';
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2/markets';

/**
 * Fetch markets from Polymarket CLOB API (most accurate prices)
 * @param {number} limit - Number of markets to fetch
 * @returns {Promise<Array>} Array of markets with accurate prices
 */
async function fetchPolymarketCLOB(limit = 200) {
    try {
        // CLOB API returns markets with detailed token prices
        const response = await fetch(`${POLYMARKET_CLOB_API}?limit=${limit}`);

        if (!response.ok) {
            console.error(`CLOB API error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const markets = data.data || data || [];

        // Only return active, open markets with real prices
        return markets
            .filter(m => m.active && !m.closed && m.accepting_orders && m.tokens?.length >= 2)
            .map(m => {
                // Get prices from tokens array
                const tokens = m.tokens || [];
                const yesToken = tokens.find(t => t.outcome?.toLowerCase() === 'yes') || tokens[0];
                const noToken = tokens.find(t => t.outcome?.toLowerCase() === 'no') || tokens[1];

                // Token prices are already 0-1 decimals
                const yesPrice = yesToken?.price ?? 0.5;
                const noPrice = noToken?.price ?? (1 - yesPrice);

                return {
                    id: m.condition_id || m.market_slug,
                    platform: 'polymarket',
                    platform_id: m.condition_id,
                    title: m.question || m.market_slug || '',
                    description: m.description || '',
                    status: m.closed ? 'closed' : 'open',
                    current_prices: {
                        yes: {
                            price: yesPrice,
                            bid: yesPrice * 0.98, // Approximate
                            ask: yesPrice * 1.02
                        },
                        no: {
                            price: noPrice,
                            bid: noPrice * 0.98,
                            ask: noPrice * 1.02
                        }
                    },
                    volume_24h: 0,
                    volume_total: 0,
                    liquidity: 0,
                    source: 'clob'
                };
            });
    } catch (error) {
        console.error('Error fetching from CLOB API:', error.message);
        return [];
    }
}

/**
 * Fetch markets from Polymarket Gamma API (metadata + volume info)
 * @param {number} limit - Number of markets to fetch
 * @returns {Promise<Array>} Array of markets
 */
async function fetchPolymarketGamma(limit = 200) {
    try {
        const response = await fetch(
            `${POLYMARKET_GAMMA_API}?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`
        );

        if (!response.ok) {
            throw new Error(`Gamma API error: ${response.status}`);
        }

        const markets = await response.json();

        return markets.map(m => {
            // CRITICAL: outcomePrices is a JSON STRING like "[\"0.004\", \"0.996\"]"
            let yesPrice = 0.5;
            let noPrice = 0.5;

            try {
                if (m.outcomePrices) {
                    const prices = typeof m.outcomePrices === 'string'
                        ? JSON.parse(m.outcomePrices)
                        : m.outcomePrices;

                    if (Array.isArray(prices) && prices.length >= 2) {
                        yesPrice = parseFloat(prices[0]) || 0.5;
                        noPrice = parseFloat(prices[1]) || (1 - yesPrice);
                    }
                }
            } catch (e) {
                console.warn(`Failed to parse outcomePrices for ${m.question}:`, e.message);
            }

            return {
                id: m.id || m.conditionId,
                platform: 'polymarket',
                platform_id: m.id || m.conditionId,
                title: m.question || m.slug || '',
                description: m.description || '',
                slug: m.slug,
                status: m.closed ? 'closed' : 'open',
                current_prices: {
                    yes: {
                        price: yesPrice,
                        bid: parseFloat(m.bestBid || 0),
                        ask: parseFloat(m.bestAsk || 1)
                    },
                    no: {
                        price: noPrice,
                        bid: 0,
                        ask: 1
                    }
                },
                volume_24h: parseFloat(m.volume24hr || 0),
                volume_total: parseFloat(m.volumeNum || m.volume || 0),
                liquidity: parseFloat(m.liquidityNum || m.liquidity || 0),
                created_at: m.createdAt,
                end_date: m.endDate,
                source: 'gamma'
            };
        });
    } catch (error) {
        console.error('Error fetching from Gamma API:', error.message);
        return [];
    }
}

/**
 * Merge CLOB and Gamma data for best of both worlds
 * CLOB has accurate prices, Gamma has volume/metadata
 * @param {number} limit - Number of markets
 * @returns {Promise<Array>} Merged markets
 */
async function fetchPolymarketMarkets(limit = 100) {
    console.log('📊 Fetching Polymarket markets...');

    // Fetch from both APIs in parallel
    const [clobMarkets, gammaMarkets] = await Promise.all([
        fetchPolymarketCLOB(limit * 2),
        fetchPolymarketGamma(limit * 2)
    ]);

    console.log(`   CLOB API: ${clobMarkets.length} markets`);
    console.log(`   Gamma API: ${gammaMarkets.length} markets`);

    // Create lookup from Gamma by title (normalized)
    const gammaByTitle = new Map();
    for (const gm of gammaMarkets) {
        const key = normalizeTitle(gm.title);
        gammaByTitle.set(key, gm);
    }

    // Prefer Gamma prices (they're usually more accurate with outcomePrices)
    // but use CLOB as fallback if Gamma has 50/50
    const result = [];
    const seenTitles = new Set();

    // First add all Gamma markets with real prices
    for (const gm of gammaMarkets) {
        const key = normalizeTitle(gm.title);
        if (seenTitles.has(key)) continue;

        // Skip markets with fake 50/50 prices
        const yesPrice = gm.current_prices?.yes?.price || 0.5;
        if (Math.abs(yesPrice - 0.5) < 0.01 && gm.volume_24h < 100) {
            // Low volume + 50/50 price = probably not real data
            continue;
        }

        seenTitles.add(key);
        result.push(gm);
    }

    // Add CLOB markets not in Gamma
    for (const cm of clobMarkets) {
        const key = normalizeTitle(cm.title);
        if (seenTitles.has(key)) continue;

        // Skip 50/50 markets
        const yesPrice = cm.current_prices?.yes?.price || 0.5;
        if (Math.abs(yesPrice - 0.5) < 0.01) continue;

        seenTitles.add(key);
        result.push(cm);
    }

    // Sort by volume and limit
    result.sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0));

    console.log(`   ✅ Returning ${Math.min(result.length, limit)} markets with real prices`);
    return result.slice(0, limit);
}

/**
 * Normalize title for deduplication
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Fetch markets directly from Kalshi
 * @param {number} limit - Number of markets to fetch
 * @returns {Promise<Array>} Array of markets
 */
async function fetchKalshiMarkets(limit = 100) {
    console.log('📊 Fetching Kalshi markets...');

    try {
        // Note: Kalshi uses 'status=open' not 'status=active'
        const response = await fetch(`${KALSHI_API}?limit=${limit}&status=open`);

        if (!response.ok) {
            throw new Error(`Kalshi API error: ${response.status}`);
        }

        const data = await response.json();
        const markets = data.markets || [];

        const result = markets
            // Kalshi returns open markets, filter for ones with real prices
            .filter(m => m.yes_bid !== undefined && m.yes_ask !== undefined)
            .map(m => {
                // Kalshi prices are in CENTS (0-100), convert to decimal (0-1)
                const yesBid = parseFloat(m.yes_bid || 0) / 100;
                const yesAsk = parseFloat(m.yes_ask || 100) / 100;
                const noBid = parseFloat(m.no_bid || 0) / 100;
                const noAsk = parseFloat(m.no_ask || 100) / 100;

                // Use last_price if available, otherwise midpoint of bid/ask
                const yesPrice = m.last_price
                    ? parseFloat(m.last_price) / 100
                    : (yesBid + yesAsk) / 2;
                const noPrice = 1 - yesPrice;

                return {
                    id: m.ticker || m.id,
                    platform: 'kalshi',
                    platform_id: m.ticker || m.id,
                    title: m.title || m.ticker,
                    description: m.subtitle || m.rules_primary || '',
                    status: m.status,
                    current_prices: {
                        yes: {
                            price: yesPrice,
                            bid: yesBid,
                            ask: yesAsk
                        },
                        no: {
                            price: noPrice,
                            bid: noBid,
                            ask: noAsk
                        }
                    },
                    volume_24h: parseFloat(m.volume_24h || 0),
                    volume_total: parseFloat(m.volume || 0),
                    liquidity: parseFloat(m.open_interest || 0),
                    created_at: m.open_time,
                    end_date: m.close_time,
                    event_ticker: m.event_ticker
                };
            });

        console.log(`   ✅ Returning ${result.length} active markets`);
        return result;
    } catch (error) {
        console.error('Error fetching Kalshi markets:', error);
        throw error;
    }
}

/**
 * Create Express routes for direct API access
 */
function createDirectAPIRoutes(app) {
    // Endpoint to fetch from Polymarket
    app.get('/api/direct/polymarket', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const markets = await fetchPolymarketMarkets(limit);

            res.json({
                markets,
                count: markets.length,
                source: 'polymarket-direct',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Endpoint to fetch from Kalshi
    app.get('/api/direct/kalshi', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const markets = await fetchKalshiMarkets(limit);

            res.json({
                markets,
                count: markets.length,
                source: 'kalshi-direct',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Endpoint to fetch from both platforms
    app.get('/api/direct/both', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;

            const [polymarkets, kalshiMarkets] = await Promise.all([
                fetchPolymarketMarkets(limit),
                fetchKalshiMarkets(limit)
            ]);

            res.json({
                polymarket: {
                    markets: polymarkets,
                    count: polymarkets.length
                },
                kalshi: {
                    markets: kalshiMarkets,
                    count: kalshiMarkets.length
                },
                total: polymarkets.length + kalshiMarkets.length,
                source: 'direct-apis',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = {
    fetchPolymarketMarkets,
    fetchKalshiMarkets,
    createDirectAPIRoutes
};
