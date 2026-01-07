const express = require('express');
const router = express.Router();
const polymarketApi = require('../services/polymarket/api');
const kalshiApi = require('../services/kalshi/api');

// Polymarket Routes
router.get('/polymarket', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const markets = await polymarketApi.fetchLiveMarkets(limit);
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

// Kalshi Routes
router.get('/kalshi', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const markets = await kalshiApi.fetchLiveMarkets(limit);
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

module.exports = router;
