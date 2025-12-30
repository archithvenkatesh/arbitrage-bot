// Lazy load transformers
let embedder = null;
let initPromise = null;

/**
 * Initialize embedding model
 */
async function initEmbedder() {
    if (embedder) return embedder;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        console.log('🔄 Loading embedding model...');
        const { pipeline } = await import('@xenova/transformers');
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Embedding model loaded!');
        return embedder;
    })();

    return initPromise;
}

/**
 * Generate embeddings for text (single or batch)
 */
async function getEmbeddings(texts) {
    const model = await initEmbedder();
    // Ensure input is array
    const inputs = Array.isArray(texts) ? texts : [texts];

    // Run model in batch
    const output = await model(inputs, { pooling: 'mean', normalize: true });

    // Convert output to array of arrays
    return output.tolist();
}

/**
 * Legacy single embedding wrapper
 */
async function getEmbedding(text) {
    const embeddings = await getEmbeddings([text]);
    return embeddings[0];
}

module.exports = {
    getEmbeddings,
    getEmbedding
};
