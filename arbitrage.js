// Arbitrage detection and calculation module

/**
 * Extract key entities and terms from a market title
 * @param {string} text - Market title or question
 * @returns {object} Extracted entities
 */
function extractKeyEntities(text) {
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

    // Extract years
    const years = normalized.match(/\b(20\d{2}|2100)\b/g) || [];

    // Extract common stop words to remove
    const stopWords = new Set(['will', 'be', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'before', 'after', 'than', 'more', 'less', 'have', 'has', 'is', 'are', 'was', 'were', 'been', 'being']);

    // Get all words and filter out stop words
    const words = normalized.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    // Extract potential names (capitalized words in original text)
    const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const names = text.match(namePattern) || [];

    // Extract numbers
    const numbers = normalized.match(/\b\d+(?:\.\d+)?\b/g) || [];

    return {
        years: new Set(years),
        words: new Set(words),
        names: new Set(names.map(n => n.toLowerCase())),
        numbers: new Set(numbers),
        normalized
    };
}

/**
 * Calculate similarity between two strings using multiple strategies
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    const e1 = extractKeyEntities(str1);
    const e2 = extractKeyEntities(str2);

    // Strategy 1: Exact normalized match
    if (e1.normalized === e2.normalized) return 1.0;

    // Strategy 2: Check if one is substring of the other (high confidence)
    if (e1.normalized.includes(e2.normalized) || e2.normalized.includes(e1.normalized)) {
        return 0.85;
    }

    // Strategy 3: Year matching (must match if both have years)
    if (e1.years.size > 0 && e2.years.size > 0) {
        const yearIntersection = new Set([...e1.years].filter(y => e2.years.has(y)));
        if (yearIntersection.size === 0) {
            return 0; // Different years = different markets
        }
    }

    // Strategy 4: Name matching (important for person-based markets)
    let nameScore = 0;
    if (e1.names.size > 0 || e2.names.size > 0) {
        const nameIntersection = new Set([...e1.names].filter(n => e2.names.has(n)));
        const nameUnion = new Set([...e1.names, ...e2.names]);
        nameScore = nameUnion.size > 0 ? nameIntersection.size / nameUnion.size : 0;
    }

    // Strategy 5: Word overlap (Jaccard similarity)
    const wordIntersection = new Set([...e1.words].filter(w => e2.words.has(w)));
    const wordUnion = new Set([...e1.words, ...e2.words]);
    const wordScore = wordUnion.size > 0 ? wordIntersection.size / wordUnion.size : 0;

    // Strategy 6: Number matching
    let numberScore = 0;
    if (e1.numbers.size > 0 || e2.numbers.size > 0) {
        const numberIntersection = new Set([...e1.numbers].filter(n => e2.numbers.has(n)));
        const numberUnion = new Set([...e1.numbers, ...e2.numbers]);
        numberScore = numberUnion.size > 0 ? numberIntersection.size / numberUnion.size : 0;
    }

    // Weighted combination of scores
    // Word overlap is most important, names and numbers are secondary
    const finalScore = (wordScore * 0.6) + (nameScore * 0.25) + (numberScore * 0.15);

    return finalScore;
}

/**
 * Find matching markets between platforms
 * @param {Array} kalshiMarkets - Markets from Kalshi
 * @param {Array} polymarketMarkets - Markets from Polymarket
 * @param {number} minSimilarity - Minimum similarity threshold (0-1)
 * @returns {Array} Array of matched market pairs
 */
function findMatchingMarkets(kalshiMarkets, polymarketMarkets, minSimilarity = 0.4) {
    const matches = [];
    const usedPolyMarkets = new Set(); // Track which poly markets we've already matched

    for (const kalshiMarket of kalshiMarkets) {
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const polyMarket of polymarketMarkets) {
            // Skip if this poly market is already matched to a better kalshi market
            if (usedPolyMarkets.has(polyMarket.id)) continue;

            const similarity = calculateSimilarity(
                kalshiMarket.title || kalshiMarket.question || '',
                polyMarket.title || polyMarket.question || ''
            );

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
                matchConfidence: bestSimilarity >= 0.7 ? 'high' : bestSimilarity >= 0.5 ? 'medium' : 'low'
            });
        }
    }

    return matches;
}

/**
 * Calculate optimal arbitrage opportunity
 * @param {object} kalshiMarket - Kalshi market data
 * @param {object} polyMarket - Polymarket market data
 * @param {number} investment - Total investment amount
 * @returns {object|null} Arbitrage opportunity or null if none exists
 */
function calculateArbitrage(kalshiMarket, polyMarket, investment = 100) {
    // Extract prices (assuming they're in 0-1 range)
    const kalshiYesPrice = kalshiMarket.yes_price || kalshiMarket.price || 0.5;
    const kalshiNoPrice = 1 - kalshiYesPrice;
    const polyYesPrice = polyMarket.yes_price || polyMarket.price || 0.5;
    const polyNoPrice = 1 - polyYesPrice;

    // Check all four possible arbitrage combinations
    const opportunities = [];

    // Opportunity 1: Buy YES on Kalshi, NO on Polymarket
    const opp1 = checkArbitrageOpportunity(
        'kalshi', 'yes', kalshiYesPrice,
        'polymarket', 'no', polyNoPrice,
        investment
    );
    if (opp1) opportunities.push(opp1);

    // Opportunity 2: Buy NO on Kalshi, YES on Polymarket
    const opp2 = checkArbitrageOpportunity(
        'kalshi', 'no', kalshiNoPrice,
        'polymarket', 'yes', polyYesPrice,
        investment
    );
    if (opp2) opportunities.push(opp2);

    // Return the best opportunity (highest profit)
    if (opportunities.length === 0) return null;

    opportunities.sort((a, b) => b.netProfit - a.netProfit);
    return opportunities[0];
}

/**
 * Check a specific arbitrage opportunity
 * @param {string} platform1 - First platform
 * @param {string} side1 - Side to buy on first platform ('yes' or 'no')
 * @param {number} price1 - Price on first platform
 * @param {string} platform2 - Second platform
 * @param {string} side2 - Side to buy on second platform
 * @param {number} price2 - Price on second platform
 * @param {number} investment - Total investment
 * @returns {object|null} Opportunity details or null
 */
function checkArbitrageOpportunity(platform1, side1, price1, platform2, side2, price2, investment) {
    // For a valid arbitrage, we need price1 + price2 < 1 (after fees)
    // This ensures guaranteed profit regardless of outcome

    // Calculate optimal allocation
    // We want to allocate investment such that both sides pay out the same amount
    // Let x = contracts on platform1, y = contracts on platform2
    // We want: x = y (same payout)
    // And: x * price1 + y * price2 ≈ investment (before fees)

    // Simplified: buy equal number of contracts on both sides
    // Calculate how many contracts we can buy
    const totalPrice = price1 + price2;

    // Initial estimate of contracts (will adjust for fees)
    let contracts = investment / totalPrice;

    // Calculate costs with fees
    const cost1 = platform1 === 'kalshi'
        ? calculateKalshiCost(contracts, price1, false)
        : calculatePolymarketCost(contracts, price1);

    const cost2 = platform2 === 'kalshi'
        ? calculateKalshiCost(contracts, price2, false)
        : calculatePolymarketCost(contracts, price2);

    // Adjust contracts to fit investment
    const totalCost = cost1.totalCost + cost2.totalCost;
    if (totalCost > investment) {
        contracts = contracts * (investment / totalCost);

        // Recalculate with adjusted contracts
        const adjustedCost1 = platform1 === 'kalshi'
            ? calculateKalshiCost(contracts, price1, false)
            : calculatePolymarketCost(contracts, price1);

        const adjustedCost2 = platform2 === 'kalshi'
            ? calculateKalshiCost(contracts, price2, false)
            : calculatePolymarketCost(contracts, price2);

        const profit = calculateArbitrageProfit(adjustedCost1, adjustedCost2);

        // Only return if profitable
        if (profit.netProfit > 0) {
            return {
                platform1,
                side1,
                price1,
                contracts1: contracts,
                cost1: adjustedCost1,
                platform2,
                side2,
                price2,
                contracts2: contracts,
                cost2: adjustedCost2,
                ...profit
            };
        }
    } else {
        const profit = calculateArbitrageProfit(cost1, cost2);

        if (profit.netProfit > 0) {
            return {
                platform1,
                side1,
                price1,
                contracts1: contracts,
                cost1,
                platform2,
                side2,
                price2,
                contracts2: contracts,
                cost2,
                ...profit
            };
        }
    }

    return null;
}

/**
 * Find all arbitrage opportunities from matched markets
 * @param {Array} matchedMarkets - Array of matched market pairs
 * @param {number} investment - Investment amount per opportunity
 * @returns {Array} Array of arbitrage opportunities
 */
function findArbitrageOpportunities(matchedMarkets, investment = 100) {
    const opportunities = [];

    for (const match of matchedMarkets) {
        const arb = calculateArbitrage(match.kalshi, match.polymarket, investment);

        if (arb) {
            opportunities.push({
                ...arb,
                kalshiMarket: match.kalshi,
                polymarketMarket: match.polymarket,
                similarity: match.similarity,
                matchConfidence: match.matchConfidence
            });
        }
    }

    // Sort by profit percentage (descending)
    opportunities.sort((a, b) => b.profitPercent - a.profitPercent);

    return opportunities;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateSimilarity,
        findMatchingMarkets,
        calculateArbitrage,
        findArbitrageOpportunities
    };
}
