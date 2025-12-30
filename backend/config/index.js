// Configuration for the Arbitrage Bot
const CONFIG = {
    // API Configuration
    api: {
        refreshInterval: 60000, // 1 minute refresh
        requestTimeout: 30000   // 30 seconds timeout (for ML model)
    },

    // Matching Configuration  
    matching: {
        minSimilarity: 0.75,    // 75% threshold for broader matches
        maxMarkets: 100         // Show 100 markets
    },

    // UI Configuration
    ui: {
        maxDisplayedOpportunities: 100,
        autoRefresh: true,
        sortBy: 'similarity'
    },

    // Vector Database Configuration
    vector: {
        limit: 100 // Limit number of markets vectorized for testing/performance
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
