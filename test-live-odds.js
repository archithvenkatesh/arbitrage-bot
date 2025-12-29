#!/usr/bin/env node
// Quick test script to show 10 markets from each platform with live odds

const fetch = require('node-fetch');

const POLYMARKET_API = 'https://gamma-api.polymarket.com/markets';
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2/markets';

async function fetchPolymarketSample() {
    console.log('\n' + '═'.repeat(70));
    console.log('📈 POLYMARKET - Top 10 Markets with Live Odds');
    console.log('═'.repeat(70));

    try {
        const response = await fetch(`${POLYMARKET_API}?limit=20&active=true&closed=false&order=volume24hr&ascending=false`);
        const markets = await response.json();

        let count = 0;
        for (const m of markets) {
            if (count >= 10) break;

            // Parse outcomePrices JSON string
            let yesPrice = 0.5, noPrice = 0.5;
            try {
                const prices = typeof m.outcomePrices === 'string'
                    ? JSON.parse(m.outcomePrices)
                    : m.outcomePrices;
                if (prices && prices.length >= 2) {
                    yesPrice = parseFloat(prices[0]);
                    noPrice = parseFloat(prices[1]);
                }
            } catch (e) { }

            // Skip 50/50 markets (no real data)
            if (Math.abs(yesPrice - 0.5) < 0.01) continue;

            count++;
            const title = (m.question || m.slug || 'Unknown').substring(0, 55);
            const yesCents = Math.round(yesPrice * 100);
            const noCents = Math.round(noPrice * 100);
            const vol = Math.round(m.volume24hr || 0).toLocaleString();

            console.log(`\n${count}. ${title}${title.length >= 55 ? '...' : ''}`);
            console.log(`   YES: ${yesCents}¢  |  NO: ${noCents}¢  |  24h Vol: $${vol}`);
        }
    } catch (error) {
        console.error('Error fetching Polymarket:', error.message);
    }
}

async function fetchKalshiSample() {
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 KALSHI - Top 10 Markets with Live Odds');
    console.log('═'.repeat(70));

    try {
        const response = await fetch(`${KALSHI_API}?limit=50&status=open`);
        const data = await response.json();
        const markets = data.markets || [];

        let count = 0;
        for (const m of markets) {
            if (count >= 10) break;

            // Kalshi prices are in cents (0-100)
            const yesBid = parseFloat(m.yes_bid || 0);
            const yesAsk = parseFloat(m.yes_ask || 100);
            const yesPrice = m.last_price ? parseFloat(m.last_price) : (yesBid + yesAsk) / 2;
            const noPrice = 100 - yesPrice;

            // Skip markets with no real price data
            if (yesBid === 0 && yesAsk === 100) continue;

            count++;
            const title = (m.title || m.ticker || 'Unknown').substring(0, 55);
            const vol = Math.round(m.volume_24h || 0).toLocaleString();

            console.log(`\n${count}. ${title}${title.length >= 55 ? '...' : ''}`);
            console.log(`   YES: ${Math.round(yesPrice)}¢  |  NO: ${Math.round(noPrice)}¢  |  24h Vol: $${vol}`);
        }
    } catch (error) {
        console.error('Error fetching Kalshi:', error.message);
    }
}

async function main() {
    console.log('\n🔄 Fetching live market data from Polymarket and Kalshi...\n');

    await fetchPolymarketSample();
    await fetchKalshiSample();

    console.log('\n\n' + '═'.repeat(70));
    console.log('✅ Done! These are live prices from both platforms.');
    console.log('═'.repeat(70) + '\n');
}

main();
