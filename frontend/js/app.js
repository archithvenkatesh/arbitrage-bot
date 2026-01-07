// Arbitrage Bot Frontend - Market Comparison App
// Shows Polymarket vs Kalshi matched markets side-by-side with real odds

// Global state
let markets = [];
let autoRefreshInterval = null;

// Configuration
const CONFIG = {
  api: {
    refreshInterval: 60000 // 1 minute
  }
};

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  // Auto-fetch on load
  fetchAndDisplayMarkets();
  // startAutoRefresh();  // Disabled to prevent database conflicts during indexing
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('refreshBtn').addEventListener('click', () => {
    fetchAndDisplayMarkets();
  });

  document.getElementById('sortBy').addEventListener('change', displayMarkets);
  document.getElementById('minSimilarity').addEventListener('change', displayMarkets);
}

/**
 * Fetch matched markets from backend (using vector database)
 */
async function fetchAndDisplayMarkets() {
  // 1. Fetch Stats separate from matches for immediate feedback
  fetch('/api/system/stats')
    .then(res => res.json())
    .then(data => {
      document.getElementById('polymarketCount').textContent = data.polymarketCount || 0;
      document.getElementById('kalshiCount').textContent = data.kalshiCount || 0;
      if (data.lastUpdate) {
        document.getElementById('lastUpdated').textContent = new Date(data.lastUpdate).toLocaleTimeString();
      }
    })
    .catch(console.error);

  showLoading(true, 'Fetching matches from vector database...');
  updateStatus('Fetching...');

  try {
    const minSim = parseInt(document.getElementById('minSimilarity').value) / 100 || 0.75;

    // Use the database endpoint for fast matching
    const response = await fetch(`/api/opportunities?limit=100&minSimilarity=${minSim}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    markets = data.matches || [];

    updateStatus(`${markets.length} matches`, true);
    displayMarkets();

  } catch (error) {
    console.error('Error:', error);
    updateStatus('Error', false);
    showError(error.message);
  } finally {
    showLoading(false);
  }
}

/**
 * Display markets in the UI
 */
function displayMarkets() {
  const container = document.getElementById('opportunitiesList');
  const minSim = parseInt(document.getElementById('minSimilarity').value) / 100 || 0;
  const sortBy = document.getElementById('sortBy').value;

  // Filter by minimum similarity
  let filtered = markets.filter(m => m.similarity >= minSim);

  // Sort
  if (sortBy === 'similarity') {
    filtered.sort((a, b) => b.similarity - a.similarity);
  } else if (sortBy === 'volume') {
    filtered.sort((a, b) => {
      // Support both volume24h (database) and volume_24h (API) formats
      const volA = (a.polymarket?.volume24h || a.polymarket?.volume_24h || 0) +
        (a.kalshi?.volume24h || a.kalshi?.volume_24h || 0);
      const volB = (b.polymarket?.volume24h || b.polymarket?.volume_24h || 0) +
        (b.kalshi?.volume24h || b.kalshi?.volume_24h || 0);
      return volB - volA;
    });
  } else if (sortBy === 'priceDiff') {
    filtered.sort((a, b) => {
      // Support both yesPrice (database) and current_prices (API) formats
      const polyPriceA = a.polymarket?.yesPrice ?? a.polymarket?.current_prices?.yes?.price ?? 0.5;
      const kalshiPriceA = a.kalshi?.yesPrice ?? a.kalshi?.current_prices?.yes?.price ?? 0.5;
      const polyPriceB = b.polymarket?.yesPrice ?? b.polymarket?.current_prices?.yes?.price ?? 0.5;
      const kalshiPriceB = b.kalshi?.yesPrice ?? b.kalshi?.current_prices?.yes?.price ?? 0.5;
      const diffA = Math.abs(polyPriceA - kalshiPriceA);
      const diffB = Math.abs(polyPriceB - kalshiPriceB);
      return diffB - diffA;
    });
  }

  // Update total count
  document.getElementById('totalOpportunities').textContent = filtered.length;
  document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();

  if (filtered.length === 0) {
    container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No Matches Found</h3>
                <p>Try lowering the minimum similarity threshold</p>
            </div>
        `;
    return;
  }

  container.innerHTML = filtered.map(createMarketCard).join('');
}

/**
 * Create a market comparison card
 */
function createMarketCard(match) {
  const poly = match.polymarket || {};
  const kalshi = match.kalshi || {};

  // Get YES/NO prices - support both database format (yesPrice) and API format (current_prices)
  const polyYes = poly.yesPrice ?? poly.current_prices?.yes?.price ?? 0.5;
  const polyNo = poly.noPrice ?? poly.current_prices?.no?.price ?? (1 - polyYes);
  const kalshiYes = kalshi.yesPrice ?? kalshi.current_prices?.yes?.price ?? 0.5;
  const kalshiNo = kalshi.noPrice ?? kalshi.current_prices?.no?.price ?? (1 - kalshiYes);

  // Calculate price difference
  const priceDiff = Math.abs(polyYes - kalshiYes);
  const hasPriceDiff = priceDiff > 0.02; // More than 2% difference

  // Format helpers
  const formatCents = (p) => `${Math.round(p * 100)}¢`;
  const formatPct = (p) => `${Math.round(p * 100)}%`;

  // Similarity badge color
  const simClass = match.similarity >= 0.75 ? 'high-match' :
    match.similarity >= 0.6 ? 'medium-match' : 'low-match';

  // Confidence label
  const confidence = match.matchConfidence?.toUpperCase() || 'LOW';
  const confClass = confidence === 'HIGH' ? 'conf-high' :
    confidence === 'MEDIUM' ? 'conf-medium' : 'conf-low';

  // Check if prices are not 50/50 (real data)
  const polyHasRealPrice = Math.abs(polyYes - 0.5) > 0.01;
  const kalshiHasRealPrice = Math.abs(kalshiYes - 0.5) > 0.01;

  return `
        <div class="opportunity-card ${hasPriceDiff ? 'has-diff' : ''}">
            <!-- Header with match score -->
            <div class="card-header">
                <div class="match-info">
                    <span class="match-badge ${simClass}">${Math.round(match.similarity * 100)}% Match</span>
                    <span class="confidence-badge ${confClass}">${confidence}</span>
                </div>
                ${hasPriceDiff ? `<span class="price-diff-badge">⚡ ${Math.round(priceDiff * 100)}¢ spread</span>` : ''}
            </div>
            
            <!-- Two-column Market Comparison -->
            <div class="markets-grid">
                
                <!-- Polymarket -->
                <div class="market-column polymarket-col">
                    <div class="platform-header">
                        <span class="platform-badge polymarket">POLYMARKET</span>
                        ${!polyHasRealPrice ? '<span class="warning-badge">⚠️ No live price</span>' : ''}
                    </div>
                    <div class="market-title">${poly.title || 'Unknown Market'}</div>
                    <div class="prices-row">
                        <div class="price-box yes-price ${polyYes > kalshiYes ? 'higher' : polyYes < kalshiYes ? 'lower' : ''}">
                            <div class="price-label">YES</div>
                            <div class="price-value">${formatCents(polyYes)}</div>
                            <div class="price-pct">${formatPct(polyYes)}</div>
                        </div>
                        <div class="price-box no-price">
                            <div class="price-label">NO</div>
                            <div class="price-value">${formatCents(polyNo)}</div>
                            <div class="price-pct">${formatPct(polyNo)}</div>
                        </div>
                    </div>
                    <div class="market-meta">
                        Vol 24h: $${(poly.volume24h || poly.volume_24h || 0).toLocaleString()}
                    </div>
                </div>
                
                <!-- Kalshi -->
                <div class="market-column kalshi-col">
                    <div class="platform-header">
                        <span class="platform-badge kalshi">KALSHI</span>
                        ${!kalshiHasRealPrice ? '<span class="warning-badge">⚠️ No live price</span>' : ''}
                    </div>
                    <div class="market-title">${kalshi.title || 'Unknown Market'}</div>
                    <div class="prices-row">
                        <div class="price-box yes-price ${kalshiYes > polyYes ? 'higher' : kalshiYes < polyYes ? 'lower' : ''}">
                            <div class="price-label">YES</div>
                            <div class="price-value">${formatCents(kalshiYes)}</div>
                            <div class="price-pct">${formatPct(kalshiYes)}</div>
                        </div>
                        <div class="price-box no-price">
                            <div class="price-label">NO</div>
                            <div class="price-value">${formatCents(kalshiNo)}</div>
                            <div class="price-pct">${formatPct(kalshiNo)}</div>
                        </div>
                    </div>
                    <div class="market-meta">
                        Vol 24h: $${(kalshi.volume24h || kalshi.volume_24h || 0).toLocaleString()}
                    </div>
                </div>
            </div>
            
            ${match.matchDetails ? createMatchDetailsSection(match.matchDetails) : ''}
        </div>
    `;
}

/**
 * Create match details section showing why markets matched
 */
function createMatchDetailsSection(details) {
  if (!details.matches?.length && !details.conflicts?.length) return '';

  let html = '<div class="match-details">';

  if (details.matches?.length > 0) {
    html += `<div class="matches-list">
            <span class="detail-label">✓ Matched:</span> 
            ${details.matches.join(', ')}
        </div>`;
  }

  if (details.conflicts?.length > 0) {
    html += `<div class="conflicts-list">
            <span class="detail-label">⚠️ Warnings:</span> 
            ${details.conflicts.join(', ')}
        </div>`;
  }

  html += '</div>';
  return html;
}

/**
 * Update status indicator
 */
function updateStatus(text, connected = false) {
  const statusEl = document.getElementById('apiStatus');
  const statusText = statusEl.querySelector('.status-text');

  if (connected) {
    statusEl.classList.add('connected');
  } else {
    statusEl.classList.remove('connected');
  }
  statusText.textContent = text;
}

/**
 * Show/hide loading overlay
 */
function showLoading(show, text = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');

  if (show) {
    loadingText.textContent = text;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

/**
 * Show error message
 */
function showError(message) {
  const container = document.getElementById('opportunitiesList');
  container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3>Error</h3>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Start auto-refresh every 1 minute
 */
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  autoRefreshInterval = setInterval(() => {
    fetchAndDisplayMarkets();
  }, CONFIG.api.refreshInterval);
}

/**
 * Stop auto-refresh
 */
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}
