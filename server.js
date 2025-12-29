const express = require('express');
const cors = require('cors');
const path = require('path');
const {
    refreshDatabase,
    findMatchesFromDb,
    searchSimilarMarkets,
    getDbStats,
    KALSHI_INDEX_PATH,
    POLYMARKET_INDEX_PATH
} = require('./market-db');
const { fetchPolymarketMarkets, fetchKalshiMarkets, createDirectAPIRoutes } = require('./direct-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());
app.use(express.static(__dirname));

// Add direct API routes (unchanged for debugging)
createDirectAPIRoutes(app);

// ============================================
// NEW: Database-backed endpoints
// ============================================

/**
 * Refresh the market database (should be called periodically)
 */
app.post('/api/db/refresh', async (req, res) => {
    try {
        console.log('📥 Database refresh requested...');
        const stats = await refreshDatabase();
        res.json({
            success: true,
            message: 'Database refreshed successfully',
            ...stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database refresh error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get database stats
 */
app.get('/api/db/stats', async (req, res) => {
    try {
        const stats = await getDbStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Search for similar markets (vector search)
 */
app.get('/api/db/search', async (req, res) => {
    try {
        const query = req.query.q;
        const platform = req.query.platform || 'kalshi';
        const topK = parseInt(req.query.limit) || 10;

        if (!query) {
            return res.status(400).json({ error: 'Missing query parameter "q"' });
        }

        const indexPath = platform === 'polymarket' ? POLYMARKET_INDEX_PATH : KALSHI_INDEX_PATH;
        const results = await searchSimilarMarkets(query, indexPath, topK);

        res.json({
            query,
            platform,
            results,
            count: results.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Find matched markets from database
 */
app.get('/api/db/matches', async (req, res) => {
    try {
        const minSimilarity = parseFloat(req.query.minSimilarity) || 0.75;
        const limit = parseInt(req.query.limit) || 100;

        console.log(`\n🔍 Finding matches from DB (min: ${minSimilarity}, limit: ${limit})`);

        const matches = await findMatchesFromDb(minSimilarity, limit);
        const stats = await getDbStats();

        res.json({
            matches,
            matchCount: matches.length,
            dbStats: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Match error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Original endpoint (live fetch, for comparison)
// ============================================

app.get('/api/matched-markets', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const minSimilarity = parseFloat(req.query.minSimilarity) || 0.75;

        // Try DB first
        const stats = await getDbStats();
        if (stats.lastUpdate) {
            console.log('Using database for matching...');
            const matches = await findMatchesFromDb(minSimilarity, limit);
            return res.json({
                matches,
                matchCount: matches.length,
                polymarketCount: stats.polymarketCount,
                kalshiCount: stats.kalshiCount,
                source: 'database',
                lastUpdate: stats.lastUpdate,
                timestamp: new Date().toISOString()
            });
        }

        // Fallback to live fetch (if DB not populated)
        console.log('Database empty, falling back to live fetch...');
        const { findMatches } = require('./advanced-matcher');

        const [polymarkets, kalshiMarkets] = await Promise.all([
            fetchPolymarketMarkets(limit),
            fetchKalshiMarkets(limit)
        ]);

        const matches = await findMatches(polymarkets, kalshiMarkets, {
            minSimilarity,
            maxResults: limit
        });

        res.json({
            matches,
            matchCount: matches.length,
            polymarketCount: polymarkets.length,
            kalshiCount: kalshiMarkets.length,
            source: 'live',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Matching error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint
app.get('/api/debug/prices', async (req, res) => {
    try {
        const [polymarkets, kalshiMarkets] = await Promise.all([
            fetchPolymarketMarkets(10),
            fetchKalshiMarkets(10)
        ]);

        const polySamples = polymarkets.slice(0, 5).map(m => ({
            title: m.title?.substring(0, 60),
            yesPrice: m.current_prices?.yes?.price,
            noPrice: m.current_prices?.no?.price
        }));

        const kalshiSamples = kalshiMarkets.slice(0, 5).map(m => ({
            title: m.title?.substring(0, 60),
            yesPrice: m.current_prices?.yes?.price,
            noPrice: m.current_prices?.no?.price
        }));

        res.json({ polymarket: polySamples, kalshi: kalshiSamples });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    const stats = await getDbStats();
    res.json({
        status: 'ok',
        database: stats.lastUpdate ? 'populated' : 'empty',
        dbStats: stats,
        features: ['vectorDatabase', 'semanticSearch', 'liveAPIs']
    });
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 Arbitrage Bot v3.0 - Vector Database Edition              ║
║                                                                ║
║   📊 Dashboard:       http://localhost:${PORT}                     ║
║   🔍 DB Matches:      http://localhost:${PORT}/api/db/matches      ║
║   🔄 Refresh DB:      POST http://localhost:${PORT}/api/db/refresh ║
║   📈 Vector Search:   http://localhost:${PORT}/api/db/search?q=... ║
║   ❤️  Health:         http://localhost:${PORT}/api/health          ║
║                                                                ║
║   ⚡ First run: POST /api/db/refresh to populate database!     ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
