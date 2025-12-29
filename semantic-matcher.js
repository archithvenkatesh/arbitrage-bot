// AI-based semantic matching using OpenAI embeddings
// This module uses OpenAI's embedding API to find semantically similar markets

class SemanticMatcher {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.embeddingCache = new Map();
    }

    /**
     * Get embedding for a text using OpenAI API
     * @param {string} text - Text to embed
     * @returns {Promise<number[]>} Embedding vector
     */
    async getEmbedding(text) {
        // Check cache first
        if (this.embeddingCache.has(text)) {
            return this.embeddingCache.get(text);
        }

        try {
            const response = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'text-embedding-3-small',
                    input: text
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            const embedding = data.data[0].embedding;

            // Cache the embedding
            this.embeddingCache.set(text, embedding);

            return embedding;
        } catch (error) {
            console.error('Error getting embedding:', error);
            return null;
        }
    }

    /**
     * Calculate cosine similarity between two vectors
     * @param {number[]} vec1 - First vector
     * @param {number[]} vec2 - Second vector
     * @returns {number} Similarity score (0-1)
     */
    cosineSimilarity(vec1, vec2) {
        if (!vec1 || !vec2 || vec1.length !== vec2.length) {
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        norm1 = Math.sqrt(norm1);
        norm2 = Math.sqrt(norm2);

        if (norm1 === 0 || norm2 === 0) {
            return 0;
        }

        return dotProduct / (norm1 * norm2);
    }

    /**
     * Find matching markets using semantic similarity
     * @param {Array} kalshiMarkets - Markets from Kalshi
     * @param {Array} polymarketMarkets - Markets from Polymarket
     * @param {number} minSimilarity - Minimum similarity threshold (0-1)
     * @returns {Promise<Array>} Array of matched market pairs
     */
    async findMatchingMarkets(kalshiMarkets, polymarketMarkets, minSimilarity = 0.75) {
        console.log('🤖 Using AI semantic matching...');

        // Get embeddings for all markets
        console.log('Generating embeddings for Kalshi markets...');
        const kalshiEmbeddings = await Promise.all(
            kalshiMarkets.map(async (market) => {
                const text = market.title || market.question || '';
                const embedding = await this.getEmbedding(text);
                return { market, embedding };
            })
        );

        console.log('Generating embeddings for Polymarket markets...');
        const polyEmbeddings = await Promise.all(
            polymarketMarkets.map(async (market) => {
                const text = market.title || market.question || '';
                const embedding = await this.getEmbedding(text);
                return { market, embedding };
            })
        );

        // Find best matches
        const matches = [];
        const usedPolyMarkets = new Set();

        for (const { market: kalshiMarket, embedding: kalshiEmb } of kalshiEmbeddings) {
            if (!kalshiEmb) continue;

            let bestMatch = null;
            let bestSimilarity = 0;

            for (const { market: polyMarket, embedding: polyEmb } of polyEmbeddings) {
                if (!polyEmb || usedPolyMarkets.has(polyMarket.id)) continue;

                const similarity = this.cosineSimilarity(kalshiEmb, polyEmb);

                if (similarity >= minSimilarity && similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestMatch = polyMarket;
                }
            }

            if (bestMatch) {
                usedPolyMarkets.add(bestMatch.id);
                matches.push({
                    kalshi: kalshiMarket,
                    polymarket: bestMatch,
                    similarity: bestSimilarity,
                    matchConfidence: bestSimilarity >= 0.9 ? 'high' : bestSimilarity >= 0.8 ? 'medium' : 'low'
                });
            }
        }

        console.log(`✅ Found ${matches.length} semantic matches`);
        return matches;
    }

    /**
     * Batch process embeddings with rate limiting
     * @param {Array} texts - Array of texts to embed
     * @param {number} batchSize - Number of texts per batch
     * @param {number} delayMs - Delay between batches in milliseconds
     * @returns {Promise<Array>} Array of embeddings
     */
    async batchGetEmbeddings(texts, batchSize = 10, delayMs = 100) {
        const embeddings = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchEmbeddings = await Promise.all(
                batch.map(text => this.getEmbedding(text))
            );
            embeddings.push(...batchEmbeddings);

            // Rate limiting delay
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return embeddings;
    }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SemanticMatcher;
}
