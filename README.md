# 🚀 Prediction Market Arbitrage Bot - Modular Edition

**Fully functional arbitrage bot with live API integration!**

## ✨ Features

- ✅ **Live API Integration** - Direct connection to Polymarket & Kalshi APIs
- ✅ **Vector Database** - Semantic matching using local vector embeddings (Vectra)
- ✅ **Modular Architecture** - Clean separation of concerns (Frontend/Backend/Services)
- ✅ **Premium Dark UI** - Modern glassmorphism design

## 🎯 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

### 3. Open the Dashboard

Navigate to **http://localhost:3000** in your browser.

## 📂 Architecture

We use a **Modular Monolith** structure:

```
/
├── frontend/               # Frontend (Served statically)
│   ├── css/
│   ├── js/
│   └── index.html
├── backend/                # Backend Source
│   ├── server.js           # Express Server Entry Point
│   ├── routes/             # API Routes
│   ├── services/           # Domain Logic
│   │   ├── kalshi/         # Kalshi API & Vector Logic
│   │   ├── polymarket/     # Polymarket API & Vector Logic
│   │   ├── matching/       # Cross-market matching engine
│   │   └── embeddings.js   # Shared AI Model interactions
│   └── config/
└── .market-db/             # Local Vector Database (Generated)
```

## ⚡ Performance Note (Why is it slow?)
The first time you run a refresh, the bot must:
1.  **Download Match Model**: Loads a 40MB+ AI model (`Xenova/all-MiniLM-L6-v2`) from HuggingFace.
2.  **Generate Embeddings**: Runs the model on your CPU to "read" thousands of market titles. This is computationally intensive.
3.  **Future Runs**: Will be faster as the model is cached, but re-indexing a large number of markets will always take some CPU time.

## 🔧 API Endpoints

-   **GET /api/opportunities**: Get matched markets from the database.
-   **GET /api/opportunities/search?q=...**: Semantic search for markets.
-   **POST /api/system/refresh**: Trigger a full database refresh (Fetch + Embed + Index).
-   **GET /api/system/stats**: Get database statistics.
-   **GET /api/markets/polymarket**: Direct Polymarket live feed.
-   **GET /api/markets/kalshi**: Direct Kalshi live feed.

## 🚀 Deployment

This application is designed to be deployed as a single Node.js container.
-   **Port**: 3000 (default)
-   **Build**: No build step required (Vanilla JS + Node); just `npm start`.
-   **Persistence**: Requires a persistent disk for `.market-db` if you want to retain embeddings across restarts (though it can rebuild on startup).

## 📜 License

MIT License
