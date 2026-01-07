const { LocalIndex } = require('vectra');
const { getEmbeddings } = require('../embeddings');
const { POLYMARKET_INDEX_PATH, ensureDbDir } = require('../db');

/**
 * Create or get vector index
 */
async function getOrCreateIndex() {
    ensureDbDir();
    const index = new LocalIndex(POLYMARKET_INDEX_PATH);
    if (!await index.isIndexCreated()) {
        await index.createIndex();
    }
    return index;
}

/**
 * Index markets into vector database
 */
async function indexMarkets(markets) {
    const index = await getOrCreateIndex();

    // Clear existing items
    try {
        const existing = await index.listItems();
        for (const item of existing) {
            await index.deleteItem(item.id);
        }
    } catch (e) { }

    const limit = require('../../config').vector.limit || 5000;
    const topMarkets = markets
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
        .slice(0, limit);

    console.log(`\n🧠 Vectorizing top ${topMarkets.length} Polymarket markets (out of ${markets.length})...`);

    let indexed = 0;
    const BATCH_SIZE = 32;

    for (let i = 0; i < topMarkets.length; i += BATCH_SIZE) {
        const batch = topMarkets.slice(i, i + BATCH_SIZE);
        const titles = batch.map(m => m.title);

        try {
            const embeddings = await getEmbeddings(titles);

            for (let j = 0; j < batch.length; j++) {
                await index.insertItem({
                    id: batch[j].id,
                    vector: embeddings[j],
                    metadata: batch[j]
                });
                indexed++;
            }

            if (indexed % 100 === 0 || indexed === topMarkets.length) {
                process.stdout.write(`\r   Indexed ${indexed}/${topMarkets.length}`);
            }
        } catch (e) {
            console.error(`\nError indexing batch starting at ${i}:`, e.message);
        }
    }

    console.log(`\n✅ Indexed ${indexed} Polymarket markets into vector DB`);
    return indexed;
}

module.exports = {
    indexMarkets,
    getOrCreateIndex
};
