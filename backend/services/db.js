const path = require('path');
const fs = require('fs');

// Database paths - structured to be relative to project root
// We assume this file is in src/services/matching/ or similar, so we go up to find root
// Actually, let's use process.cwd() for reliability in this specific project structure
const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(PROJECT_ROOT, '.market-db');
const KALSHI_INDEX_PATH = path.join(DB_DIR, 'kalshi-vectors');
const POLYMARKET_INDEX_PATH = path.join(DB_DIR, 'poly-vectors');
const METADATA_PATH = path.join(DB_DIR, 'metadata.json');

/**
 * Ensure database directory exists
 */
function ensureDbDir() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
}

/**
 * Get database stats
 */
async function getDbStats() {
    let metadata = { lastUpdate: null, kalshiCount: 0, polymarketCount: 0 };

    try {
        if (fs.existsSync(METADATA_PATH)) {
            metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
        }
    } catch (e) { }

    return metadata;
}

/**
 * Save database metadata
 */
function saveDbMetadata(kalshiCount, polymarketCount) {
    ensureDbDir();
    const metadata = {
        lastUpdate: new Date().toISOString(),
        kalshiCount,
        polymarketCount
    };
    fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
}

module.exports = {
    DB_DIR,
    KALSHI_INDEX_PATH,
    POLYMARKET_INDEX_PATH,
    METADATA_PATH,
    ensureDbDir,
    getDbStats,
    saveDbMetadata
};
