// Advanced Semantic Matcher using state-of-the-art NLP techniques
// Combines: Entity extraction, Sentence Embeddings, and Hybrid scoring

const { LocalIndex } = require('vectra');
const path = require('path');

// Lazy load transformers
let pipeline = null;
let embedder = null;
let initPromise = null;

// ============================================
// ENTITY EXTRACTION & PREPROCESSING
// ============================================

/**
 * Extract structured entities from market title
 * @param {string} text - Market title
 * @returns {object} Extracted entities
 */
function extractEntities(text) {
    if (!text) return { normalized: '', entities: {} };

    const normalized = text.toLowerCase();

    // Extract dates in various formats
    const dates = [];
    // Match: "2025", "January 2025", "Jan 1, 2025", "1/1/2025", "before 2026"
    const yearMatch = normalized.match(/\b(20\d{2})\b/g);
    if (yearMatch) dates.push(...yearMatch);

    const monthYearMatch = normalized.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}?,?\s*20\d{2}/gi);
    if (monthYearMatch) dates.push(...monthYearMatch.map(d => d.toLowerCase()));

    // Extract people names (capitalized words not at start)
    const names = [];
    const namePattern = /(?:^|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let nameMatch;
    while ((nameMatch = namePattern.exec(text)) !== null) {
        const name = nameMatch[1].trim();
        // Filter out common non-names
        if (!['Will Be', 'United States', 'New York', 'Los Angeles', 'White House'].includes(name)) {
            names.push(name.toLowerCase());
        }
    }

    // Extract numbers and thresholds
    const thresholds = [];
    const thresholdMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(%|percent|million|billion|trillion|cents?|dollars?|\$)/gi);
    if (thresholdMatch) thresholds.push(...thresholdMatch);

    // Plain numbers
    const numbers = normalized.match(/\b\d+(?:\.\d+)?\b/g) || [];

    // Extract key action words
    const actions = [];
    const actionPatterns = [
        /(will|won't|will not)\s+(win|lose|pass|fail|reach|exceed|drop|rise|fall|be elected|become|visit|resign|announce)/gi,
        /(before|after|by)\s+(january|february|march|april|may|june|july|august|september|october|november|december|\d{4})/gi
    ];

    for (const pattern of actionPatterns) {
        const matches = normalized.match(pattern);
        if (matches) actions.push(...matches);
    }

    // Check for negation
    const hasNegation = /\b(not|won't|will not|no|never)\b/i.test(normalized);

    // Extract key topics
    const topics = [];
    const topicPatterns = [
        /\b(president|election|recession|gdp|inflation|bitcoin|crypto|stock|market|fed|interest rate|tariff|war|peace|pope|congress|senate|house)\b/gi,
        /\b(super bowl|world series|nba|nfl|mlb|oscar|grammy|emmy|nobel)\b/gi
    ];

    for (const pattern of topicPatterns) {
        const matches = normalized.match(pattern);
        if (matches) topics.push(...matches.map(t => t.toLowerCase()));
    }

    // Create keyword set for faster lookup
    const words = normalized
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    return {
        normalized,
        original: text,
        entities: {
            dates: [...new Set(dates)],
            names: [...new Set(names)],
            thresholds: [...new Set(thresholds)],
            numbers: [...new Set(numbers)],
            topics: [...new Set(topics)],
            actions: [...new Set(actions)],
            hasNegation
        },
        words: new Set(words)
    };
}

/**
 * Compare entities between two markets
 * @param {object} e1 - Entities from market 1
 * @param {object} e2 - Entities from market 2
 * @returns {object} Match scores and flags
 */
function compareEntities(e1, e2) {
    const result = {
        score: 0,
        conflicts: [],
        matches: []
    };

    // Check for conflicting dates/years
    if (e1.entities.dates.length > 0 && e2.entities.dates.length > 0) {
        // Extract years for comparison
        const years1 = new Set(e1.entities.dates.map(d => d.match(/20\d{2}/)?.[0]).filter(Boolean));
        const years2 = new Set(e2.entities.dates.map(d => d.match(/20\d{2}/)?.[0]).filter(Boolean));

        const yearIntersection = [...years1].filter(y => years2.has(y));

        if (yearIntersection.length > 0) {
            result.matches.push(`year: ${yearIntersection.join(', ')}`);
            result.score += 0.2;
        } else if (years1.size > 0 && years2.size > 0) {
            result.conflicts.push(`different years: ${[...years1]} vs ${[...years2]}`);
            result.score -= 0.3; // Strong penalty for year mismatch
        }
    }

    // Check for matching names
    if (e1.entities.names.length > 0 || e2.entities.names.length > 0) {
        const names1 = new Set(e1.entities.names);
        const names2 = new Set(e2.entities.names);
        const nameMatches = [...names1].filter(n => names2.has(n));

        if (nameMatches.length > 0) {
            result.matches.push(`names: ${nameMatches.join(', ')}`);
            result.score += 0.25;
        } else if (names1.size > 0 && names2.size > 0) {
            // Both have names but different - could be conflict
            // Only penalize if topics are similar
            result.score -= 0.1;
        }
    }

    // Check for matching topics
    if (e1.entities.topics.length > 0 || e2.entities.topics.length > 0) {
        const topics1 = new Set(e1.entities.topics);
        const topics2 = new Set(e2.entities.topics);
        const topicMatches = [...topics1].filter(t => topics2.has(t));

        if (topicMatches.length > 0) {
            result.matches.push(`topics: ${topicMatches.join(', ')}`);
            result.score += 0.15;
        }
    }

    // Check for conflicting thresholds
    if (e1.entities.thresholds.length > 0 && e2.entities.thresholds.length > 0) {
        // Normalize thresholds for comparison
        const thresh1 = new Set(e1.entities.thresholds.map(t => t.replace(/\s/g, '')));
        const thresh2 = new Set(e2.entities.thresholds.map(t => t.replace(/\s/g, '')));
        const threshMatches = [...thresh1].filter(t => thresh2.has(t));

        if (threshMatches.length > 0) {
            result.matches.push(`thresholds: ${threshMatches.join(', ')}`);
            result.score += 0.15;
        } else {
            result.conflicts.push(`different thresholds`);
            result.score -= 0.2;
        }
    }

    // Check for negation conflict
    if (e1.entities.hasNegation !== e2.entities.hasNegation) {
        result.conflicts.push('negation mismatch');
        result.score -= 0.4; // Very strong penalty - opposite meaning!
    }

    // Word overlap (Jaccard similarity)
    const words1 = e1.words;
    const words2 = e2.words;
    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);
    const wordOverlap = union.size > 0 ? intersection.length / union.size : 0;
    result.score += wordOverlap * 0.3;
    result.wordOverlap = wordOverlap;

    return result;
}

// ============================================
// EMBEDDING MODEL
// ============================================

/**
 * Initialize the embedding model
 */
async function initEmbedder() {
    if (embedder) return embedder;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        console.log('🔄 Loading embedding model (all-MiniLM-L6-v2)...');
        console.log('   First run downloads ~30MB model, then cached.');

        const { pipeline: createPipeline } = await import('@xenova/transformers');
        pipeline = createPipeline;

        // Use all-MiniLM-L6-v2 - fast and effective for sentence similarity
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
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Cosine similarity between two vectors
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

// ============================================
// HYBRID MATCHING
// ============================================

/**
 * Find the best matches using hybrid scoring
 * @param {Array} polymarkets - Polymarket markets
 * @param {Array} kalshiMarkets - Kalshi markets
 * @param {object} options - Matching options
 * @returns {Promise<Array>} Matched pairs
 */
async function findMatches(polymarkets, kalshiMarkets, options = {}) {
    const { minSimilarity = 0.55, maxResults = 100 } = options;

    console.log('\n🔍 Advanced Semantic Matching');
    console.log(`   Polymarket: ${polymarkets.length} markets`);
    console.log(`   Kalshi: ${kalshiMarkets.length} markets`);
    console.log(`   Min similarity: ${minSimilarity}`);

    // Limit to reasonable numbers for performance
    const polySubset = polymarkets.slice(0, 150);
    const kalshiSubset = kalshiMarkets.slice(0, 150);

    // Step 1: Extract entities for all markets
    console.log('   📝 Extracting entities...');
    const polyEntities = polySubset.map(m => ({
        market: m,
        entities: extractEntities(m.title)
    }));

    const kalshiEntities = kalshiSubset.map(m => ({
        market: m,
        entities: extractEntities(m.title)
    }));

    // Step 2: Generate embeddings
    console.log('   🧠 Generating embeddings...');
    await initEmbedder();

    // Generate all embeddings sequentially to avoid memory issues
    for (const item of polyEntities) {
        item.embedding = await getEmbedding(item.market.title || '');
    }
    console.log(`      Polymarket embeddings: ${polyEntities.length}`);

    for (const item of kalshiEntities) {
        item.embedding = await getEmbedding(item.market.title || '');
    }
    console.log(`      Kalshi embeddings: ${kalshiEntities.length}`);

    // Step 3: Find matches using hybrid scoring
    console.log('   🔗 Computing hybrid similarity scores...');
    const matches = [];
    const usedKalshi = new Set();

    for (const poly of polyEntities) {
        let bestMatch = null;
        let bestScore = 0;
        let bestDetails = null;

        for (const kalshi of kalshiEntities) {
            if (usedKalshi.has(kalshi.market.id)) continue;

            // Skip if embeddings are missing
            if (!poly.embedding || !kalshi.embedding) continue;

            // Compute embedding similarity
            const embeddingSim = cosineSimilarity(poly.embedding, kalshi.embedding);

            // Early exit for clearly different markets
            if (embeddingSim < 0.4) continue;

            // Compare entities
            const entityComparison = compareEntities(poly.entities, kalshi.entities);

            // Check for hard conflicts
            if (entityComparison.conflicts.length > 1) continue;

            // Hybrid score: 
            // 60% embedding similarity + 40% entity matching
            const hybridScore = (embeddingSim * 0.6) +
                (Math.max(0, entityComparison.score) * 0.4) +
                (entityComparison.wordOverlap * 0.1);

            // Boost for strong entity matches
            let finalScore = hybridScore;
            if (entityComparison.matches.length >= 2) {
                finalScore += 0.1; // Bonus for multiple entity matches
            }

            // Penalty for conflicts
            if (entityComparison.conflicts.length > 0) {
                finalScore -= 0.1;
            }

            if (finalScore >= minSimilarity && finalScore > bestScore) {
                bestScore = finalScore;
                bestMatch = kalshi;
                bestDetails = {
                    embeddingSimilarity: embeddingSim,
                    entityScore: entityComparison.score,
                    wordOverlap: entityComparison.wordOverlap,
                    matches: entityComparison.matches,
                    conflicts: entityComparison.conflicts
                };
            }
        }

        if (bestMatch) {
            usedKalshi.add(bestMatch.market.id);

            matches.push({
                polymarket: poly.market,
                kalshi: bestMatch.market,
                similarity: bestScore,
                matchConfidence: bestScore >= 0.8 ? 'high' : bestScore >= 0.65 ? 'medium' : 'low',
                matchDetails: bestDetails
            });
        }
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);
    const finalMatches = matches.slice(0, maxResults);

    console.log(`✅ Found ${finalMatches.length} high-quality matches (from ${matches.length} candidates)`);

    // Log some example matches
    if (finalMatches.length > 0) {
        console.log('\n📊 Top matches:');
        for (const m of finalMatches.slice(0, 3)) {
            console.log(`   ${(m.similarity * 100).toFixed(1)}% | "${m.polymarket.title?.substring(0, 40)}..." ↔ "${m.kalshi.title?.substring(0, 40)}..."`);
        }
    }

    return finalMatches;
}

/**
 * Simple fallback matcher using keyword overlap
 */
function findSimpleMatches(polymarkets, kalshiMarkets, minSimilarity = 0.35) {
    console.log('🔄 Using simple keyword matching (fallback)...');

    const matches = [];
    const usedKalshi = new Set();

    for (const poly of polymarkets.slice(0, 100)) {
        const polyEntities = extractEntities(poly.title);
        let bestMatch = null;
        let bestScore = 0;

        for (const kalshi of kalshiMarkets.slice(0, 100)) {
            if (usedKalshi.has(kalshi.id)) continue;

            const kalshiEntities = extractEntities(kalshi.title);
            const comparison = compareEntities(polyEntities, kalshiEntities);

            const score = Math.max(0, comparison.score + comparison.wordOverlap);

            if (score >= minSimilarity && score > bestScore) {
                bestScore = score;
                bestMatch = kalshi;
            }
        }

        if (bestMatch) {
            usedKalshi.add(bestMatch.id);
            matches.push({
                polymarket: poly,
                kalshi: bestMatch,
                similarity: bestScore,
                matchConfidence: bestScore >= 0.6 ? 'high' : bestScore >= 0.4 ? 'medium' : 'low'
            });
        }
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    console.log(`✅ Found ${matches.length} keyword matches`);
    return matches;
}

module.exports = {
    findMatches,
    findSimpleMatches,
    extractEntities,
    compareEntities,
    getEmbedding,
    cosineSimilarity
};
