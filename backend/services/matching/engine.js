const { getEmbedding } = require('../embeddings');
const { KALSHI_INDEX_PATH, POLYMARKET_INDEX_PATH, getOrCreateIndex: getDbIndex } = require('../db');
const { LocalIndex } = require('vectra');
const { getOrCreateIndex: getKalshiIndex } = require('../kalshi/vector');
const { getOrCreateIndex: getPolyIndex } = require('../polymarket/vector');

/**
 * Search for similar markets in the database
 */
async function searchSimilarMarkets(queryText, platform = 'kalshi', topK = 10) {
    const indexPath = platform === 'polymarket' ? POLYMARKET_INDEX_PATH : KALSHI_INDEX_PATH;
    // We can reuse the getOrCreateIndex from the specific services, or generic one
    const index = platform === 'polymarket' ? await getPolyIndex() : await getKalshiIndex();

    const queryEmbedding = await getEmbedding(queryText);
    const results = await index.queryItems(queryEmbedding, topK);

    return results.map(r => ({
        ...r.item.metadata,
        similarity: r.score
    }));
}

/**
 * Find matching markets between platforms
 */
async function findMatchesFromDb(minSimilarity = 0.6, maxResults = 100) {
    console.log('\n🔍 Finding matches using vector database...');

    const polyIndex = await getPolyIndex();
    const kalshiIndex = await getKalshiIndex();

    // Get all Polymarket items
    const polyItems = await polyIndex.listItems();
    console.log(`   Polymarket DB: ${polyItems.length} markets`);

    const matches = [];
    const usedKalshi = new Set();
    const kalshiItems = await kalshiIndex.listItems();
    console.log(`   Checking against Kalshi DB: ${kalshiItems.length} markets (approx)`);

    let matchCount = 0;

    for (const polyItem of polyItems) {
        // Search Kalshi for similar markets
        const kalshiResults = await kalshiIndex.queryItems(polyItem.vector, 5);

        for (const result of kalshiResults) {
            if (result.score < minSimilarity) continue;
            if (usedKalshi.has(result.item.id)) continue;

            usedKalshi.add(result.item.id);
            matches.push({
                polymarket: polyItem.metadata,
                kalshi: result.item.metadata,
                similarity: result.score,
                matchConfidence: result.score >= 0.8 ? 'high' :
                    result.score >= 0.65 ? 'medium' : 'low'
            });
            break; // Only take best match
        }

        if (matches.length >= maxResults) break;
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    console.log(`✅ Found ${matches.length} matches`);

    return matches;
}

module.exports = {
    searchSimilarMarkets,
    findMatchesFromDb
};
