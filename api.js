// API integration module for PolyRouter

class PolyRouterAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        // Use local proxy server to avoid CORS issues
        this.baseUrl = window.location.origin + '/api';
        this.cache = {
            kalshi: { data: null, timestamp: 0 },
            polymarket: { data: null, timestamp: 0 }
        };
        this.cacheTimeout = 30000; // 30 seconds
    }

    /**
     * Make an API request to PolyRouter
     * @param {string} endpoint - API endpoint
     * @param {object} params - Query parameters
     * @returns {Promise<object>} API response
     */
    async request(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `API request failed: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    /**
     * Fetch markets from a specific platform
     * @param {string} platform - Platform name ('kalshi' or 'polymarket')
     * @param {boolean} useCache - Whether to use cached data
     * @returns {Promise<Array>} Array of markets
     */
    async getMarkets(platform, useCache = true) {
        // Check cache
        const now = Date.now();
        if (useCache && this.cache[platform].data &&
            (now - this.cache[platform].timestamp) < this.cacheTimeout) {
            return this.cache[platform].data;
        }

        try {
            const response = await this.request('/markets', {
                platform: platform,
                status: 'open',
                limit: 100
            });

            // PolyRouter returns { markets: [...] }
            const markets = response.markets || [];

            // Transform to consistent format
            const transformedMarkets = markets.map(market => ({
                id: market.id,
                title: market.title || market.question,
                question: market.question || market.title,
                yes_price: market.current_prices?.yes?.price || 0.5,
                no_price: market.current_prices?.no?.price || 0.5,
                volume_24h: market.volume_24h || 0,
                status: market.status,
                platform: market.platform
            }));

            // Update cache
            this.cache[platform] = {
                data: transformedMarkets,
                timestamp: now
            };

            return transformedMarkets;
        } catch (error) {
            console.error(`Error fetching ${platform} markets:`, error);
            // Return cached data if available, even if stale
            return this.cache[platform].data || [];
        }
    }

    /**
     * Fetch markets from both platforms
     * @returns {Promise<object>} Markets from both platforms
     */
    async getAllMarkets() {
        try {
            const [kalshiMarkets, polymarketMarkets] = await Promise.all([
                this.getMarkets('kalshi'),
                this.getMarkets('polymarket')
            ]);

            return {
                kalshi: kalshiMarkets,
                polymarket: polymarketMarkets
            };
        } catch (error) {
            console.error('Error fetching all markets:', error);
            return {
                kalshi: [],
                polymarket: []
            };
        }
    }

    /**
     * Clear cache for a specific platform or all platforms
     * @param {string} platform - Platform name or 'all'
     */
    clearCache(platform = 'all') {
        if (platform === 'all') {
            this.cache.kalshi = { data: null, timestamp: 0 };
            this.cache.polymarket = { data: null, timestamp: 0 };
        } else if (this.cache[platform]) {
            this.cache[platform] = { data: null, timestamp: 0 };
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolyRouterAPI;
}
