const express = require('express');
const router = express.Router();
const { findMatchesFromDb, searchSimilarMarkets } = require('../services/matching/engine');
const { getDbStats } = require('../services/db');
const system = require('./system');

// Get matched markets
router.get('/', async (req, res) => {
    // Check for global lock
    if (system.isIndexing && system.isIndexing()) {
        return res.status(503).json({ error: 'System is currently indexing new data. Please try again in a moment.' });
    }

    try {
        const minSimilarity = parseFloat(req.query.minSimilarity) || 0.75;
        const limit = parseInt(req.query.limit) || 100;

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

// Vector search
router.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const platform = req.query.platform || 'kalshi';
        const topK = parseInt(req.query.limit) || 10;

        if (!query) {
            return res.status(400).json({ error: 'Missing query parameter "q"' });
        }

        const results = await searchSimilarMarkets(query, platform, topK);

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

module.exports = router;
