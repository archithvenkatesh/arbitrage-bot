// Fee calculation module for different prediction market platforms

/**
 * Calculate Kalshi taker fees
 * Formula: fees = ceil(0.07 × C × P × (1-P))
 * @param {number} contracts - Number of contracts
 * @param {number} price - Price per contract (0-1)
 * @returns {number} Fee in dollars
 */
function calculateKalshiTakerFee(contracts, price) {
    const fee = CONFIG.fees.kalshi.takerFeeRate * contracts * price * (1 - price);
    // Round up to next cent
    return Math.ceil(fee * 100) / 100;
}

/**
 * Calculate Kalshi maker fees
 * Formula: fees = ceil(0.0175 × C × P × (1-P))
 * @param {number} contracts - Number of contracts
 * @param {number} price - Price per contract (0-1)
 * @returns {number} Fee in dollars
 */
function calculateKalshiMakerFee(contracts, price) {
    const fee = CONFIG.fees.kalshi.makerFeeRate * contracts * price * (1 - price);
    // Round up to next cent
    return Math.ceil(fee * 100) / 100;
}

/**
 * Calculate Polymarket fees
 * Polymarket charges 2% on profits
 * @param {number} contracts - Number of contracts
 * @param {number} price - Price per contract (0-1)
 * @returns {number} Fee in dollars
 */
function calculatePolymarketFee(contracts, price) {
    // Cost to buy contracts
    const cost = contracts * price;
    // Potential profit (max payout - cost)
    const potentialProfit = contracts - cost;
    // Fee is 2% of potential profit
    const fee = CONFIG.fees.polymarket.feeRate * potentialProfit;
    return Math.max(0, fee);
}

/**
 * Calculate total cost including fees for Kalshi
 * @param {number} contracts - Number of contracts
 * @param {number} price - Price per contract (0-1)
 * @param {boolean} isMaker - Whether this is a maker order
 * @returns {object} Cost breakdown
 */
function calculateKalshiCost(contracts, price, isMaker = false) {
    const contractCost = contracts * price;
    const fee = isMaker
        ? calculateKalshiMakerFee(contracts, price)
        : calculateKalshiTakerFee(contracts, price);

    return {
        contractCost,
        fee,
        totalCost: contractCost + fee,
        maxPayout: contracts
    };
}

/**
 * Calculate total cost including fees for Polymarket
 * @param {number} contracts - Number of contracts
 * @param {number} price - Price per contract (0-1)
 * @returns {object} Cost breakdown
 */
function calculatePolymarketCost(contracts, price) {
    const contractCost = contracts * price;
    const fee = calculatePolymarketFee(contracts, price);

    return {
        contractCost,
        fee,
        totalCost: contractCost + fee,
        maxPayout: contracts
    };
}

/**
 * Calculate net profit from an arbitrage opportunity
 * @param {object} side1 - First side of the arbitrage (e.g., Kalshi YES)
 * @param {object} side2 - Second side of the arbitrage (e.g., Polymarket NO)
 * @returns {object} Profit analysis
 */
function calculateArbitrageProfit(side1, side2) {
    const totalCost = side1.totalCost + side2.totalCost;
    const guaranteedPayout = side1.maxPayout; // Both sides should have same payout
    const netProfit = guaranteedPayout - totalCost;
    const profitPercent = (netProfit / totalCost) * 100;

    return {
        totalCost,
        guaranteedPayout,
        netProfit,
        profitPercent,
        side1Cost: side1.totalCost,
        side2Cost: side2.totalCost,
        side1Fee: side1.fee,
        side2Fee: side2.fee
    };
}

/**
 * Get profit color based on profit percentage
 * @param {number} profitPercent - Profit percentage
 * @returns {string} Color class name
 */
function getProfitColor(profitPercent) {
    if (profitPercent >= CONFIG.arbitrage.profitThresholds.green) {
        return 'profit-green';
    } else if (profitPercent >= CONFIG.arbitrage.profitThresholds.orange) {
        return 'profit-orange';
    } else {
        return 'profit-red';
    }
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateKalshiTakerFee,
        calculateKalshiMakerFee,
        calculatePolymarketFee,
        calculateKalshiCost,
        calculatePolymarketCost,
        calculateArbitrageProfit,
        getProfitColor
    };
}
