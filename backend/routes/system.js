const express = require('express');
const router = express.Router();
const { fetchAllMarkets: fetchAllKalshi } = require('../services/kalshi/api');
const { fetchAllMarkets: fetchAllPolymarket } = require('../services/polymarket/api');
const { indexMarkets: indexKalshi } = require('../services/kalshi/vector');
const { indexMarkets: indexPolymarket } = require('../services/polymarket/vector');
const { getDbStats, saveDbMetadata } = require('../services/db');

// Refresh Database
router.post('/refresh', async (req, res) => {
    try {
        console.log('📥 Database refresh requested...');
        const startTime = Date.now();

        // Fetch all markets
        console.log('   Starting parallel fetch...');
        const [kalshiMarkets, polyMarkets] = await Promise.all([
            fetchAllKalshi().then(m => { console.log(`   ✅ Kalshi fetch done: ${m.length} markets`); return m; }),
            fetchAllPolymarket().then(m => { console.log(`   ✅ Polymarket fetch done: ${m.length} markets`); return m; })
        ]);
        console.log('   All fetches complete.');

        // Save metadata immediately so UI updates
        saveDbMetadata(kalshiMarkets.length, polyMarkets.length);

        // Index into vector databases
        await indexKalshi(kalshiMarkets);
        await indexPolymarket(polyMarkets);

        // Save metadata again after indexing (just in case)
        saveDbMetadata(kalshiMarkets.length, polyMarkets.length);
        const stats = await getDbStats();

        res.json({
            success: true,
            message: 'Database refreshed successfully',
            ...stats,
            timestamp: new Date().toISOString(),
            duration: ((Date.now() - startTime) / 1000).toFixed(1) + 's'
        });
    } catch (error) {
        console.error('Database refresh error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await getDbStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health Check
router.get('/health', async (req, res) => {
    const stats = await getDbStats();
    res.json({
        status: 'ok',
        database: stats.lastUpdate ? 'populated' : 'empty',
        dbStats: stats,
        features: ['vectorDatabase', 'semanticSearch', 'liveAPIs']
    });
});

module.exports = router;
