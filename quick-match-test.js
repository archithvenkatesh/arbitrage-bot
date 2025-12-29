#!/usr/bin/env node
// Quick test: Index 500 markets from each platform and find matches

const { LocalIndex } = require('vectra');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '.market-db');
const KALSHI_INDEX = path.join(DB_DIR, 'kalshi-vectors');
const POLY_INDEX = path.join(DB_DIR, 'poly-vectors');

let embedder = null;

async function initEmbedder() {
    if (embedder) return embedder;
    console.log('🔄 Loading embedding model...');
    const { pipeline } = await import('@xenova/transformers');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Model loaded!');
    return embedder;
}

async function getEmbedding(text) {
    const model = await initEmbedder();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

async function getIndex(indexPath) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    const index = new LocalIndex(indexPath);
    if (!await index.isIndexCreated()) await index.createIndex();
    return index;
}

async function fetchKalshi(limit = 500) {
    const fetch = (await import('node-fetch')).default;
    const allMarkets = [];
    let cursor = null;

    console.log(`\n📊 Fetching Kalshi markets (limit: ${limit})...`);

    while (allMarkets.length < limit) {
        const url = cursor
            ? `https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&cursor=${cursor}`
            : `https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open`;

        const response = await fetch(url);
        const data = await response.json();
        const markets = data.markets || [];

        if (markets.length === 0) break;

        for (const m of markets) {
            if (m.yes_bid === undefined) continue;
            allMarkets.push({
                id: m.ticker,
                title: m.title || m.ticker,
                yesPrice: m.last_price ? m.last_price / 100 : (m.yes_bid + m.yes_ask) / 200,
                volume24h: m.volume_24h || 0
            });
            if (allMarkets.length >= limit) break;
        }

        cursor = data.cursor;
        if (!cursor) break;
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`   ✅ Got ${allMarkets.length} Kalshi markets`);
    return allMarkets;
}

async function fetchPolymarket(limit = 500) {
    const fetch = (await import('node-fetch')).default;
    const allMarkets = [];
    let offset = 0;

    console.log(`\n📊 Fetching Polymarket markets (limit: ${limit})...`);

    while (allMarkets.length < limit) {
        const url = `https://gamma-api.polymarket.com/markets?limit=100&offset=${offset}&active=true&closed=false&order=volume24hr&ascending=false`;
        const response = await fetch(url);
        const markets = await response.json();

        if (!markets || markets.length === 0) break;

        for (const m of markets) {
            let yesPrice = 0.5;
            try {
                const prices = JSON.parse(m.outcomePrices || '[]');
                yesPrice = parseFloat(prices[0]) || 0.5;
            } catch (e) { }

            if (Math.abs(yesPrice - 0.5) < 0.01) continue;

            allMarkets.push({
                id: m.id || m.conditionId,
                title: m.question || m.slug || '',
                yesPrice,
                volume24h: m.volume24hr || 0
            });
            if (allMarkets.length >= limit) break;
        }

        offset += 100;
        if (markets.length < 100) break;
        await new Promise(r => setTimeout(r, 50));
    }

    console.log(`   ✅ Got ${allMarkets.length} Polymarket markets`);
    return allMarkets;
}

async function indexMarkets(markets, indexPath, name) {
    const index = await getIndex(indexPath);

    // Clear old data
    try {
        const items = await index.listItems();
        for (const item of items) await index.deleteItem(item.id);
    } catch (e) { }

    console.log(`\n🧠 Vectorizing ${markets.length} ${name} markets...`);

    let count = 0;
    for (const market of markets) {
        const embedding = await getEmbedding(market.title);
        // Use upsertItem to handle potential duplicates
        await index.upsertItem({ id: String(market.id), vector: embedding, metadata: market });
        count++;
        if (count % 100 === 0) console.log(`   ${count}/${markets.length}`);
    }

    console.log(`   ✅ Indexed ${count} ${name} markets`);
    return index;
}

async function findMatches(polyIndex, kalshiIndex, minSim = 0.65, maxResults = 50) {
    console.log(`\n🔍 Finding matches (min similarity: ${minSim})...`);

    const polyItems = await polyIndex.listItems();
    const matches = [];
    const usedKalshi = new Set();

    for (const polyItem of polyItems) {
        const results = await kalshiIndex.queryItems(polyItem.vector, 3);

        for (const result of results) {
            if (result.score < minSim) continue;
            if (usedKalshi.has(result.item.id)) continue;

            usedKalshi.add(result.item.id);
            matches.push({
                polymarket: polyItem.metadata,
                kalshi: result.item.metadata,
                similarity: result.score
            });
            break;
        }

        if (matches.length >= maxResults) break;
    }

    matches.sort((a, b) => b.similarity - a.similarity);
    return matches;
}

async function main() {
    console.log('\n' + '═'.repeat(70));
    console.log('🚀 VECTOR DATABASE TEST - 500 Markets Per Platform');
    console.log('═'.repeat(70));

    const startTime = Date.now();

    // Fetch markets
    const [kalshiMarkets, polyMarkets] = await Promise.all([
        fetchKalshi(500),
        fetchPolymarket(500)
    ]);

    // Index into vector DB
    const polyIndex = await indexMarkets(polyMarkets, POLY_INDEX, 'Polymarket');
    const kalshiIndex = await indexMarkets(kalshiMarkets, KALSHI_INDEX, 'Kalshi');

    // Find matches
    const matches = await findMatches(polyIndex, kalshiIndex, 0.65, 30);

    console.log('\n' + '═'.repeat(70));
    console.log(`✅ Found ${matches.length} matches!`);
    console.log('═'.repeat(70));

    // Display matches
    for (let i = 0; i < Math.min(matches.length, 15); i++) {
        const m = matches[i];
        console.log(`\n${i + 1}. [${(m.similarity * 100).toFixed(1)}% match]`);
        console.log(`   📈 Polymarket: ${m.polymarket.title.substring(0, 60)}...`);
        console.log(`      YES: ${Math.round(m.polymarket.yesPrice * 100)}¢`);
        console.log(`   📊 Kalshi: ${m.kalshi.title.substring(0, 60)}...`);
        console.log(`      YES: ${Math.round(m.kalshi.yesPrice * 100)}¢`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n⏱️  Total time: ${elapsed}s`);
    console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
