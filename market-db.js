// Market Database with Vector Storage
// Polls ALL markets from Kalshi and Polymarket, stores with embeddings

const { LocalIndex } = require('vectra');
const path = require('path');
const fs = require('fs');

// Database paths - must match quick-match-test.js
const DB_DIR = path.join(__dirname, '.market-db');
const KALSHI_INDEX_PATH = path.join(DB_DIR, 'kalshi-vectors');
const POLYMARKET_INDEX_PATH = path.join(DB_DIR, 'poly-vectors');  // Changed to match quick-match-test
const METADATA_PATH = path.join(DB_DIR, 'metadata.json');

// Lazy load transformers
let embedder = null;
let initPromise = null;

/**
 * Initialize embedding model
 */
async function initEmbedder() {
    if (embedder) return embedder;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        console.log('🔄 Loading embedding model...');
        const { pipeline } = await import('@xenova/transformers');
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Embedding model loaded!');
        return embedder;
    })();

    return initPromise;
}

/**
 * Generate embeddings for text (single or batch)
 */
async function getEmbeddings(texts) {
    const model = await initEmbedder();
    // Ensure input is array
    const inputs = Array.isArray(texts) ? texts : [texts];

    // Run model in batch
    const output = await model(inputs, { pooling: 'mean', normalize: true });

    // Convert output to array of arrays
    return output.tolist();
}

/**
 * Legacy single embedding wrapper
 */
async function getEmbedding(text) {
    const embeddings = await getEmbeddings([text]);
    return embeddings[0];
}

/**
 * Ensure database directory exists
 */
function ensureDbDir() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
}

/**
 * Create or get vector index
 */
async function getOrCreateIndex(indexPath) {
    ensureDbDir();
    const index = new LocalIndex(indexPath);

    if (!await index.isIndexCreated()) {
        await index.createIndex();
    }

    return index;
}

/**
 * Fetch ALL markets from Kalshi with pagination
 */
async function fetchAllKalshiMarkets() {
    const fetch = (await import('node-fetch')).default;
    const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2/markets';

    const allMarkets = [];
    let cursor = null;
    let page = 0;

    console.log('📊 Fetching ALL Kalshi markets...');

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

        // Transform and add markets
        for (const m of markets) {
            // Skip markets without real prices
            if (m.yes_bid === undefined || m.yes_ask === undefined) continue;

            const yesBid = parseFloat(m.yes_bid || 0) / 100;
            const yesAsk = parseFloat(m.yes_ask || 100) / 100;
            const yesPrice = m.last_price
                ? parseFloat(m.last_price) / 100
                : (yesBid + yesAsk) / 2;

            allMarkets.push({
                id: m.ticker,
                platform: 'kalshi',
                title: m.title || m.ticker,
                description: m.subtitle || m.rules_primary || '',
                yesPrice,
                noPrice: 1 - yesPrice,
                yesBid,
                yesAsk,
                volume24h: parseFloat(m.volume_24h || 0),
                liquidity: parseFloat(m.open_interest || 0),
                eventTicker: m.event_ticker,
                closeTime: m.close_time
            });
        }

        console.log(`   Page ${page}: ${markets.length} markets (total: ${allMarkets.length})`);

        // Check for next page
        cursor = data.cursor;
        if (!cursor) break;

        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`✅ Kalshi: Total ${allMarkets.length} markets`);
    return allMarkets;
}

/**
 * Fetch ALL markets from Polymarket with pagination
 */
async function fetchAllPolymarketMarkets() {
    const fetch = (await import('node-fetch')).default;
    const POLY_API = 'https://gamma-api.polymarket.com/markets';

    const allMarkets = [];
    let offset = 0;
    const limit = 100;
    let page = 0;

    console.log('📊 Fetching ALL Polymarket markets...');

    while (true) {
        page++;
        const url = `${POLY_API}?limit=${limit}&offset=${offset}&active=true&closed=false`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Polymarket API error: ${response.status}`);
            break;
        }

        const markets = await response.json();

        if (!markets || markets.length === 0) break;

        // Transform and add markets
        for (const m of markets) {
            // Parse outcomePrices
            let yesPrice = 0.5, noPrice = 0.5;
            try {
                const prices = typeof m.outcomePrices === 'string'
                    ? JSON.parse(m.outcomePrices)
                    : m.outcomePrices;
                if (prices && prices.length >= 2) {
                    yesPrice = parseFloat(prices[0]);
                    noPrice = parseFloat(prices[1]);
                }
            } catch (e) { }

            // Skip 50/50 markets (no real data)
            if (Math.abs(yesPrice - 0.5) < 0.01) continue;

            allMarkets.push({
                id: m.id || m.conditionId,
                platform: 'polymarket',
                title: m.question || m.slug || '',
                description: m.description || '',
                slug: m.slug,
                yesPrice,
                noPrice,
                volume24h: parseFloat(m.volume24hr || 0),
                liquidity: parseFloat(m.liquidityNum || 0),
                endDate: m.endDate
            });
        }

        console.log(`   Page ${page}: ${markets.length} markets (total: ${allMarkets.length})`);

        offset += limit;

        // Polymarket has fewer markets, stop if we got less than limit
        if (markets.length < limit) break;

        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`✅ Polymarket: Total ${allMarkets.length} markets`);
    return allMarkets;
}

/**
 * Index markets into vector database
 */
async function indexMarkets(markets, indexPath, platformName) {
    const index = await getOrCreateIndex(indexPath);

    // Clear existing items
    try {
        const existing = await index.listItems();
        for (const item of existing) {
            await index.deleteItem(item.id);
        }
    } catch (e) { }

    // 1. Sort by volume and take top 2000
    const topMarkets = markets
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, 5000);

    console.log(`\n🧠 Vectorizing top ${topMarkets.length} ${platformName} markets (out of ${markets.length})...`);

    let indexed = 0;
    const BATCH_SIZE = 32;

    // 2. Process in batches
    for (let i = 0; i < topMarkets.length; i += BATCH_SIZE) {
        const batch = topMarkets.slice(i, i + BATCH_SIZE);
        const titles = batch.map(m => m.title);

        try {
            // Generate embeddings for the whole batch
            const embeddings = await getEmbeddings(titles);

            // Insert each item
            for (let j = 0; j < batch.length; j++) {
                const market = batch[j];
                const vector = embeddings[j];

                await index.insertItem({
                    id: market.id,
                    vector: vector,
                    metadata: market
                });
                indexed++;
            }

            // Log progress
            if (indexed % 100 === 0 || indexed === topMarkets.length) {
                process.stdout.write(`\r   Indexed ${indexed}/${topMarkets.length}`);
            }

        } catch (e) {
            console.error(`\nError indexing batch starting at ${i}:`, e.message);
        }
    }

    console.log(`\n✅ Indexed ${indexed} ${platformName} markets into vector DB`);
    return indexed;
}

/**
 * Search for similar markets in the database
 */
async function searchSimilarMarkets(queryText, indexPath, topK = 10) {
    const index = await getOrCreateIndex(indexPath);
    const queryEmbedding = await getEmbedding(queryText);

    const results = await index.queryItems(queryEmbedding, topK);

    return results.map(r => ({
        ...r.item.metadata,
        similarity: r.score
    }));
}

/**
 * Find matching markets between platforms
 */
async function findMatchesFromDb(minSimilarity = 0.6, maxResults = 100) {
    console.log('\n🔍 Finding matches using vector database...');

    const polyIndex = await getOrCreateIndex(POLYMARKET_INDEX_PATH);
    const kalshiIndex = await getOrCreateIndex(KALSHI_INDEX_PATH);

    // Get all Polymarket items
    const polyItems = await polyIndex.listItems();
    console.log(`   Polymarket DB: ${polyItems.length} markets`);

    const matches = [];
    const usedKalshi = new Set();

    for (const polyItem of polyItems) {
        // Search Kalshi for similar markets
        const kalshiResults = await kalshiIndex.queryItems(polyItem.vector, 5);

        for (const result of kalshiResults) {
            if (result.score < minSimilarity) continue;
            if (usedKalshi.has(result.item.id)) continue;

            usedKalshi.add(result.item.id);
            matches.push({
                polymarket: polyItem.metadata,
                kalshi: result.item.metadata,
                similarity: result.score,
                matchConfidence: result.score >= 0.8 ? 'high' :
                    result.score >= 0.65 ? 'medium' : 'low'
            });
            break; // Only take best match
        }

        if (matches.length >= maxResults) break;
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    console.log(`✅ Found ${matches.length} matches`);

    return matches;
}

/**
 * Get database stats
 */
async function getDbStats() {
    let metadata = { lastUpdate: null, kalshiCount: 0, polymarketCount: 0 };

    try {
        if (fs.existsSync(METADATA_PATH)) {
            metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
        }
    } catch (e) { }

    return metadata;
}

/**
 * Save database metadata
 */
function saveDbMetadata(kalshiCount, polymarketCount) {
    ensureDbDir();
    const metadata = {
        lastUpdate: new Date().toISOString(),
        kalshiCount,
        polymarketCount
    };
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
}

/**
 * Full refresh: fetch all markets and reindex
 */
async function refreshDatabase() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔄 REFRESHING MARKET DATABASE');
    console.log('═'.repeat(60));

    const startTime = Date.now();

    // Fetch all markets
    const [kalshiMarkets, polyMarkets] = await Promise.all([
        fetchAllKalshiMarkets(),
        fetchAllPolymarketMarkets()
    ]);

    // Index into vector databases
    await indexMarkets(kalshiMarkets, KALSHI_INDEX_PATH, 'Kalshi');
    await indexMarkets(polyMarkets, POLYMARKET_INDEX_PATH, 'Polymarket');

    // Save metadata
    saveDbMetadata(kalshiMarkets.length, polyMarkets.length);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Database refresh complete in ${elapsed}s`);
    console.log(`   Kalshi: ${kalshiMarkets.length} markets`);
    console.log(`   Polymarket: ${polyMarkets.length} markets`);
    console.log('═'.repeat(60) + '\n');

    return { kalshiCount: kalshiMarkets.length, polymarketCount: polyMarkets.length };
}

module.exports = {
    refreshDatabase,
    findMatchesFromDb,
    searchSimilarMarkets,
    getDbStats,
    getEmbedding,
    KALSHI_INDEX_PATH,
    POLYMARKET_INDEX_PATH
};

// Run if called directly
if (require.main === module) {
    refreshDatabase().catch(console.error);
}
