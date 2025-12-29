# 🚀 Prediction Market Arbitrage Bot - LIVE VERSION

**Fully functional arbitrage bot with live API integration!**

## ✨ Features

- ✅ **Live API Integration** - Real-time data from Polymarket & Kalshi via PolyRouter
- ✅ **No CORS Issues** - Backend proxy server handles all API calls
- ✅ **Exact Fee Calculations** - Implements Kalshi taker/maker fees and Polymarket fees
- ✅ **Color-Coded Opportunities** - Green (profit), Orange (break-even), Red (loss)
- ✅ **Demo Mode** - Test with mock data instantly
- ✅ **Premium Dark UI** - Modern glassmorphism design
- ✅ **Auto-Refresh** - Configurable automatic updates

## 🎯 Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web server
- `cors` - CORS handling
- `node-fetch` - API requests

### 2. Start the Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Arbitrage Bot Server Running!                        ║
║                                                            ║
║   📊 Dashboard: http://localhost:3000                      ║
║   🔧 API Proxy: http://localhost:3000/api/markets          ║
║   ❤️  Health:    http://localhost:3000/api/health          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

### 3. Open the Dashboard

Navigate to **http://localhost:3000** in your browser.

### 4. Fetch Live Data

Click the **"Refresh Data"** button to fetch real-time market data from both platforms.

## 📊 How It Works

### Architecture

```
Browser (http://localhost:3000)
    ↓
Express Server (port 3000)
    ↓
PolyRouter API (with your API key)
    ↓
Polymarket & Kalshi Data
```

### Backend Proxy

The `server.js` file creates an Express server that:
1. Serves the frontend files
2. Provides a `/api/markets` endpoint
3. Forwards requests to PolyRouter with authentication
4. Returns data to the browser (no CORS issues!)

### API Key

Your PolyRouter API key is stored in `server.js`:
```javascript
const API_KEY = 'pk_5f19d0fc535ed3c4304514dcbb01e36262045f92c9f62686d6e06b8ef932117c';
```

**Note:** This key is already configured and working!

## 🎬 Demo Mode

Don't want to wait for API calls? Click **"Demo Mode"** to instantly see how the bot works with pre-loaded data showing a profitable arbitrage opportunity.

## 📈 Understanding Results

### When Opportunities Are Found

The bot will display cards showing:
- **Market Name** - The prediction market
- **Profit %** - Expected return after all fees
- **Net Profit** - Dollar amount you'd earn
- **Strategy** - Which platform and side (YES/NO) to buy
- **Match Confidence** - How certain the markets are equivalent

Click any card to see:
- Detailed cost breakdown
- Exact contract quantities
- Fee calculations for each platform
- Trading instructions

### When No Opportunities Found

This is actually **normal and expected**! Real arbitrage opportunities are:
- ⏱️ **Rare** - Markets are usually efficient
- ⚡ **Brief** - Disappear quickly when found
- 💰 **Small** - Often < 1-2% profit after fees

The bot is working correctly if it shows "No Opportunities Found" - it just means the current market prices don't allow for profitable arbitrage.

## 🔧 Configuration

### Changing the API Key

Edit `server.js` line 9:
```javascript
const API_KEY = 'your-new-api-key-here';
```

Then restart the server.

### Adjusting Filters

In the UI:
- **Min Profit %** - Filter out low-profit opportunities
- **Investment ($)** - Change the investment amount for calculations
- **Sort By** - Sort by profit, profit %, or confidence

### Fee Settings

Click **Settings** to choose:
- **Kalshi Fee Type** - Taker (7%) or Maker (1.75%)
- **Auto-refresh** - Enable/disable automatic updates

## 📁 File Structure

```
arbitrage-bot/
├── server.js           # Express backend with proxy
├── package.json        # Dependencies
├── index.html          # Main UI
├── styles.css          # Premium dark mode design
├── config.js           # Configuration
├── fees.js             # Fee calculation logic
├── api.js              # API client (uses proxy)
├── arbitrage.js        # Arbitrage detection
├── app.js              # Main application logic
├── mockData.js         # Demo mode data
└── README.md           # This file
```

## 🚨 Important Notes

### Market Verification
Always verify that matched markets are truly equivalent before trading. The bot uses fuzzy text matching which may occasionally pair different markets.

### Price Changes
Prices can change between viewing and execution. Always check current prices on the actual platforms before trading.

### Not Financial Advice
This is a research and educational tool. Trade at your own risk.

## 🔍 Troubleshooting

### Server Won't Start

**Error:** `EADDRINUSE: address already in use`

**Solution:** Port 3000 is already in use. Either:
1. Stop the other process using port 3000
2. Change the port in `server.js` (line 6)

### No Data Loading

1. Check server logs in the terminal
2. Verify the API key is correct
3. Check your internet connection
4. Try Demo Mode to verify the UI works

### "No markets found" Error

This means the API call failed. Check:
- API key is valid
- Internet connection is working
- PolyRouter service is online

## 🎯 Next Steps

### For Development

1. **Add More Platforms** - Extend to support additional prediction markets
2. **WebSocket Integration** - Real-time price updates
3. **Historical Tracking** - Log opportunities over time
4. **Automated Trading** - Execute trades automatically (with approval)
5. **Alerts** - Email/SMS notifications for high-profit opportunities

### For Production

1. **Environment Variables** - Move API key to `.env` file
2. **HTTPS** - Add SSL certificate
3. **Rate Limiting** - Implement request throttling
4. **Caching** - Redis for better performance
5. **Monitoring** - Add logging and error tracking

## 📞 Support

If you encounter issues:
1. Check the server logs in your terminal
2. Verify the API key is correct
3. Try Demo Mode to isolate the issue
4. Check PolyRouter documentation: https://docs.polyrouter.io

## 📜 License

MIT License - Feel free to modify and use as you wish!

---

**Built with ❤️ for prediction market traders**

**Status:** ✅ Fully functional with live API integration
**Last Updated:** December 18, 2025
