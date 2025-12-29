// Vector-based semantic matching using Transformers.js embeddings + Vectra
// This replaces OpenAI embeddings with local ML model for faster, free matching

const { LocalIndex } = require('vectra');
const path = require('path');

// Lazy load transformers (heavy dependency)
let pipeline = null;
let embedder = null;
let initPromise = null; // Lock to prevent race condition

/**
 * Initialize the embedding model (downloads on first use, then cached)
 */
async function initEmbedder() {
    // If already initialized, return immediately
    if (embedder) return embedder;

    // If initialization is in progress, wait for it
    if (initPromise) return initPromise;

    // Start initialization and store the promise
    initPromise = (async () => {
        console.log('🔄 Loading embedding model (first run downloads ~30MB, cached after)...');

        // Dynamic import for ESM module
        const { pipeline: createPipeline } = await import('@xenova/transformers');
        pipeline = createPipeline;

        // Use a small, fast model for semantic similarity
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        console.log('✅ Embedding model loaded!');
        return embedder;
    })();

    return initPromise;
}

/**
 * Generate embedding for text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function getEmbedding(text) {
    const model = await initEmbedder();

    // Generate embedding
    const output = await model(text, { pooling: 'mean', normalize: true });

    // Convert to regular array
    return Array.from(output.data);
}

/**
 * Generate embeddings for all texts sequentially (avoids memory issues)
 * @param {Array} markets - Array of market objects
 * @returns {Promise<Array>} Array of {market, embedding} objects
 */
async function generateEmbeddings(markets) {
    // Initialize model first
    await initEmbedder();

    const results = [];
    for (const market of markets) {
        const embedding = await getEmbedding(market.title || '');
        results.push({ market, embedding });
    }
    return results;
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vec1 
 * @param {number[]} vec2 
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Create or load vector index for markets
 * @param {string} name - Index name
 * @returns {Promise<LocalIndex>} Vectra index
 */
async function getOrCreateIndex(name) {
    const indexPath = path.join(__dirname, '.vectra', name);
    const index = new LocalIndex(indexPath);

    if (!await index.isIndexCreated()) {
        await index.createIndex();
    }

    return index;
}

/**
 * Find matching markets between Polymarket and Kalshi using semantic similarity
 * @param {Array} polymarketMarkets - Markets from Polymarket
 * @param {Array} kalshiMarkets - Markets from Kalshi
 * @param {number} minSimilarity - Minimum similarity threshold (0-1)
 * @returns {Promise<Array>} Matched market pairs with similarity scores
 */
async function findSemanticMatches(polymarketMarkets, kalshiMarkets, minSimilarity = 0.7) {
    console.log(`\n🔍 Finding semantic matches...`);
    console.log(`   Polymarket: ${polymarketMarkets.length} markets`);
    console.log(`   Kalshi: ${kalshiMarkets.length} markets`);

    // Process up to 200 markets to find 50 high-quality matches
    const maxMarkets = 200;
    const polySubset = polymarketMarkets.slice(0, maxMarkets);
    const kalshiSubset = kalshiMarkets.slice(0, maxMarkets);

    // Pre-compute embeddings for all markets SEQUENTIALLY (not parallel)
    console.log('   Generating embeddings for Polymarket...');
    const polyEmbeddings = await generateEmbeddings(polySubset);

    console.log('   Generating embeddings for Kalshi...');
    const kalshiEmbeddings = await generateEmbeddings(kalshiSubset);

    // Find best matches using cosine similarity
    const matches = [];
    const usedKalshi = new Set();

    for (const { market: polyMarket, embedding: polyEmb } of polyEmbeddings) {
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const { market: kalshiMarket, embedding: kalshiEmb } of kalshiEmbeddings) {
            if (usedKalshi.has(kalshiMarket.id)) continue;

            const similarity = cosineSimilarity(polyEmb, kalshiEmb);

            if (similarity >= minSimilarity && similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = kalshiMarket;
            }
        }

        if (bestMatch) {
            usedKalshi.add(bestMatch.id);
            matches.push({
                polymarket: polyMarket,
                kalshi: bestMatch,
                similarity: bestSimilarity,
                matchConfidence: bestSimilarity >= 0.85 ? 'high' : bestSimilarity >= 0.7 ? 'medium' : 'low'
            });
        }
    }

    // Sort by similarity (highest first) and limit to 50
    matches.sort((a, b) => b.similarity - a.similarity);
    const limitedMatches = matches.slice(0, 50);

    console.log(`✅ Found ${limitedMatches.length} high-quality semantic matches (from ${matches.length} total)`);
    return limitedMatches;
}

/**
 * Simple TF-IDF based matching (fallback if ML model fails)
 * @param {Array} polymarketMarkets 
 * @param {Array} kalshiMarkets 
 * @param {number} minSimilarity 
 * @returns {Array} Matched pairs
 */
function findSimpleMatches(polymarketMarkets, kalshiMarkets, minSimilarity = 0.4) {
    console.log('🔄 Using simple text matching (TF-IDF fallback)...');

    const tokenize = (text) => {
        if (!text) return new Set();
        return new Set(
            text.toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2)
        );
    };

    const jaccardSimilarity = (set1, set2) => {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    };

    const matches = [];
    const usedKalshi = new Set();

    for (const polyMarket of polymarketMarkets.slice(0, 100)) {
        const polyTokens = tokenize(polyMarket.title);
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const kalshiMarket of kalshiMarkets.slice(0, 100)) {
            if (usedKalshi.has(kalshiMarket.id)) continue;

            const kalshiTokens = tokenize(kalshiMarket.title);
            const similarity = jaccardSimilarity(polyTokens, kalshiTokens);

            if (similarity >= minSimilarity && similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = kalshiMarket;
            }
        }

        if (bestMatch) {
            usedKalshi.add(bestMatch.id);
            matches.push({
                polymarket: polyMarket,
                kalshi: bestMatch,
                similarity: bestSimilarity,
                matchConfidence: bestSimilarity >= 0.7 ? 'high' : bestSimilarity >= 0.5 ? 'medium' : 'low'
            });
        }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    console.log(`✅ Found ${matches.length} text matches`);
    return matches;
}

/**
 * Main matching function - tries semantic, falls back to simple
 * @param {Array} polymarketMarkets 
 * @param {Array} kalshiMarkets 
 * @param {Object} options 
 * @returns {Promise<Array>} Matched market pairs
 */
async function findMatches(polymarketMarkets, kalshiMarkets, options = {}) {
    const { minSimilarity = 0.7, useSemanticMatching = true } = options;

    if (!useSemanticMatching) {
        return findSimpleMatches(polymarketMarkets, kalshiMarkets, minSimilarity);
    }

    try {
        return await findSemanticMatches(polymarketMarkets, kalshiMarkets, minSimilarity);
    } catch (error) {
        console.error('⚠️ Semantic matching failed, using fallback:', error.message);
        return findSimpleMatches(polymarketMarkets, kalshiMarkets, minSimilarity);
    }
}

module.exports = {
    initEmbedder,
    getEmbedding,
    findMatches,
    findSemanticMatches,
    findSimpleMatches,
    cosineSimilarity
};
