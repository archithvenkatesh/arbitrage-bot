const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const matchesRoutes = require('./routes/opportunities');
const marketsRoutes = require('./routes/markets');
const systemRoutes = require('./routes/system');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/opportunities', matchesRoutes);
app.use('/api/markets', marketsRoutes);
app.use('/api/system', systemRoutes);

// Catch-all to serve index.html for any non-API routes (if using client-side routing, though here it's simple)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!', details: err.message });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🚀 Arbitrage Bot v3.0 - Modular Architecture                 ║
║                                                                ║
║   📊 Dashboard:       http://localhost:${PORT}                     ║
║   🔍 Opportunities:   http://localhost:${PORT}/api/opportunities   ║
║   ❤️  Health:         http://localhost:${PORT}/api/system/health   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
      `);

        // Trigger initial data refresh
        console.log('🚀 Triggering initial data refresh...');
        const fetch = require('node-fetch');
        fetch(`http://localhost:${PORT}/api/system/refresh`, { method: 'POST' })
            .catch(err => console.error('Failed to trigger initial refresh:', err.message));
    });
}

module.exports = app;
