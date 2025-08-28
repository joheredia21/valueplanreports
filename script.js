// Application configuration
const APP_CONFIG = {
    RPC_URL: 'https://api.hive.blog',
    LIMIT: 12,
    DEFAULT_USER: 'hiveio',
    SHEETS_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4/pub?output=csv'
};

// Application state
let appState = {
    currentUser: null,
    posts: [],
    metrics: [],
    isLoading: false
};

// DOM elements
const DOM = {
    mobileMenu: document.getElementById('mobile-menu'),
    userSearch: document.getElementById('user-search'),
    searchBtn: document.getElementById('search-btn'),
    heroSection: document.getElementById('hero-section'),
    postsGrid: document.getElementById('posts-grid'),
    metricsContainer: document.getElementById('metrics-container'),
    loadingOverlay: document.getElementById('loading-overlay'),
    refreshData: document.getElementById('refresh-data'),
    totalProjects: document.getElementById('total-projects'),
    totalFunding: document.getElementById('total-funding'),
    activeCountries: document.getElementById('active-countries')
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Initialize application
function initializeApp() {
    setupEventListeners();
    loadDefaultContent();
    loadMetricsData();
}

// Set up event listeners
function setupEventListeners() {
    // Mobile menu
    DOM.mobileMenu.addEventListener('click', function() {
        this.classList.toggle('active');
        document.querySelector('.nav-menu').classList.toggle('active');
    });
    
    // Search
    DOM.searchBtn.addEventListener('click', handleSearch);
    DOM.userSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    // Refresh data
    DOM.refreshData.addEventListener('click', loadMetricsData);
}

// Load default content
async function loadDefaultContent() {
    await loadUserContent(APP_CONFIG.DEFAULT_USER);
}

// Handle search
async function handleSearch() {
    const username = DOM.userSearch.value.trim();
    if (!username) {
        showNotification('Please enter a username', 'error');
        return;
    }
    
    await loadUserContent(username);
}

// Load user content
async function loadUserContent(username) {
    showLoading(true);
    
    try {
        // Verify if user exists
        const accounts = await rpcCall('condenser_api.get_accounts', [[username]]);
        if (!accounts || accounts.length === 0) {
            throw new Error(`User "${username}" not found`);
        }
        
        appState.currentUser = accounts[0];
        
        // Get user posts
        const posts = await rpcCall('condenser_api.get_discussions_by_blog', [
            { tag: username, limit: APP_CONFIG.LIMIT }
        ]);
        
        appState.posts = posts || [];
        
        // Update UI
        updateHeroSection(posts[0]);
        renderPostsGrid(posts);
        
        showNotification(`Content from @${username} loaded successfully`, 'success');
        
    } catch (error) {
        console.error('Error:', error);
        showNotification(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Load metrics data from Google Sheets
async function loadMetricsData() {
    showLoading(true);
    
    try {
        const response = await fetch(APP_CONFIG.SHEETS_URL);
        const csvData = await response.text();
        const metrics = parseCSV(csvData);
        
        appState.metrics = metrics;
        renderMetrics(metrics);
        updateSummaryStats(metrics);
        
        showNotification('Data updated successfully', 'success');
    } catch (error) {
        console.error('Error loading metrics:', error);
        showNotification('Error loading data', 'error');
    } finally {
        showLoading(false);
    }
}

// Parse CSV to JSON
function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const entry = {};
        
        headers.forEach((header, i) => {
            entry[header] = values[i] || '';
        });
        
        return entry;
    }).filter(entry => entry.Proyecto); // Filter empty entries
}

// Render metrics
function renderMetrics(metrics) {
    if (!DOM.metricsContainer || !metrics) return;
    
    DOM.metricsContainer.innerHTML = '';
    
    metrics.forEach(metric => {
        const metricElement = createMetricElement(metric);
        DOM.metricsContainer.appendChild(metricElement);
    });
}

// Create metric element
function createMetricElement(metric) {
    const card = document.createElement('div');
    card.className = 'metric-card fade-in';
    
    // Calculate random trend (in a real implementation, this would come from data)
    const change = (Math.random() * 20 - 10).toFixed(1);
    const isPositive = change >= 0;
    
    card.innerHTML = `
        <div class="metric-header">
            <div class="metric-title">${metric.Proyecto}</div>
            <div class="metric-icon">
                <i class="fas fa-chart-line"></i>
            </div>
        </div>
        <div class="metric-value">${metric.Presupuesto || 'N/A'}</div>
        <div class="metric-change ${isPositive ? 'change-positive' : 'change-negative'}">
            <i class="fas ${isPositive ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
            ${Math.abs(change)}%
        </div>
        <div class="metric-chart"></div>
        <div class="metric-details">
            <div><strong>Country:</strong> ${metric.País || 'N/A'}</div>
            <div><strong>Status:</strong> ${metric.Estado || 'N/A'}</div>
            <div><strong>Date:</strong> ${metric['Fecha de inicio'] || 'N/A'}</div>
        </div>
    `;
    
    return card;
}

// Update summary statistics
function updateSummaryStats(metrics) {
    if (!metrics.length) return;
    
    // Calculate total projects
    DOM.totalProjects.textContent = metrics.length;
    
    // Calculate total funding
    const totalFunding = metrics.reduce((sum, metric) => {
        const value = parseFloat(metric.Presupuesto?.replace(/[^\d.-]/g, '') || 0);
        return sum + value;
    }, 0);
    
    DOM.totalFunding.textContent = `$${totalFunding.toLocaleString('en-US')}`;
    
    // Calculate unique countries
    const uniqueCountries = new Set(metrics.map(m => m.País).filter(Boolean));
    DOM.activeCountries.textContent = uniqueCountries.size;
}

// Generic RPC call
async function rpcCall(method, params) {
    const body = {
        jsonrpc: '2.0',
        method,
        params,
        id: 1
    };
    
    const response = await fetch(APP_CONFIG.RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.error) {
        throw new Error(data.error.message || 'RPC call error');
    }
    
    return data.result;
}

// Update hero section
function updateHeroSection(post) {
    if (!post || !DOM.heroSection) return;
    
    const metadata = parseMetadata(post.json_metadata);
    const images = extractImages(post, metadata);
    
    DOM.heroSection.innerHTML = `
        <div class="hero-image">
            ${images.length > 0 ? 
                `<img src="${images[0]}" alt="${post.title || 'Post image'}">` : 
                `<div class="image-placeholder"><i class="fas fa-image"></i></div>`
            }
        </div>
        <div class="hero-content">
            <h3>${post.title || 'No title'}</h3>
            <p class="hero-excerpt">${extractExcerpt(post.body, 150)}</p>
            <div class="hero-meta">
                <span class="hero-author">By @${post.author}</span>
                <span class="hero-date">${formatDate(post.created)}</span>
            </div>
            <a href="${generatePostLink(post)}" target="_blank" class="cta-button">
                Read more <i class="fas fa-arrow-right"></i>
            </a>
        </div>
    `;
}

// Render posts grid
function renderPostsGrid(posts) {
    if (!DOM.postsGrid || !posts) return;
    
    DOM.postsGrid.innerHTML = '';
    
    // Filter posts (exclude the first one which is in the hero)
    const postsToShow = posts.slice(1, APP_CONFIG.LIMIT);
    
    postsToShow.forEach((post, index) => {
        const postElement = createPostElement(post, index === 0);
        DOM.postsGrid.appendChild(postElement);
    });
    
    // Entry animation
    animatePosts();
}

// Create post element
function createPostElement(post, isFeatured = false) {
    const metadata = parseMetadata(post.json_metadata);
    const images = extractImages(post, metadata);
    const votes = post.net_votes || 0;
    const comments = post.children || 0;
    
    const article = document.createElement('article');
    article.className = `post-card fade-in ${isFeatured ? 'featured' : ''}`;
    
    article.innerHTML = `
        <div class="post-image">
            ${images.length > 0 ? 
                `<img src="${images[0]}" alt="${post.title || 'Post image'}" loading="lazy">` : 
                `<div class="image-placeholder"><i class="fas fa-image"></i></div>`
            }
        </div>
        <div class="post-content">
            <div class="post-meta">
                <span class="post-author">@${post.author}</span>
                <span class="post-date">${formatDate(post.created)}</span>
            </div>
            <h3 class="post-title">${post.title || 'No title'}</h3>
            <p class="post-excerpt">${extractExcerpt(post.body, 120)}</p>
            <div class="post-actions">
                <button class="action-btn"><i class="fas fa-heart"></i> <span>${votes}</span></button>
                <button class="action-btn"><i class="fas fa-comment"></i> <span>${comments}</span></button>
                <a href="${generatePostLink(post)}" target="_blank" class="read-more">
                    Read more <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        </div>
    `;
    
    return article;
}

// Animate posts
function animatePosts() {
    const posts = document.querySelectorAll('.post-card');
    posts.forEach((post, index) => {
        post.style.animationDelay = `${index * 0.1}s`;
    });
}

// Parse metadata
function parseMetadata(metadata) {
    try {
        return typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {};
    } catch (error) {
        console.error('Error parsing metadata:', error);
        return {};
    }
}

// Extract images from post
function extractImages(post, metadata) {
    const images = [];
    
    // From metadata
    if (metadata.image) {
        const metaImages = Array.isArray(metadata.image) ? metadata.image : [metadata.image];
        images.push(...metaImages.filter(img => typeof img === 'string'));
    }
    
    if (metadata.images) {
        const metaImages = Array.isArray(metadata.images) ? metadata.images : [metadata.images];
        images.push(...metaImages.filter(img => typeof img === 'string'));
    }
    
    // From post body
    if (post.body) {
        const imageRegex = /https?:\/\/[^"']*\.(jpg|jpeg|png|gif|webp)/gi;
        const bodyImages = post.body.match(imageRegex) || [];
        images.push(...bodyImages);
    }
    
    // Filter and normalize URLs
    return images
        .filter(img => typeof img === 'string' && img.trim().length > 0)
        .map(img => img.trim().replace('http://', 'https://'))
        .filter((url, index, self) => self.indexOf(url) === index);
}

// Extract excerpt
function extractExcerpt(body, maxLength) {
    if (!body) return 'No content available';
    
    const plainText = body
        .replace(/[#*\[\]()~`>]/g, '')
        .replace(/\n/g, ' ')
        .replace(/<[^>]*>/g, '')
        .trim();
    
    if (plainText.length <= maxLength) return plainText;
    
    return plainText.substring(0, maxLength) + '...';
}

// Format date
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateString;
    }
}

// Generate post link
function generatePostLink(post) {
    if (!post) return '#';
    
    let url = post.url;
    if (!url.startsWith('http')) {
        url = `https://peakd.com${url}`;
    }
    
    return url;
}

// Show/hide loading
function showLoading(show) {
    appState.isLoading = show;
    DOM.loadingOverlay.style.display = show ? 'flex' : 'none';
    document.body.style.overflow = show ? 'hidden' : 'auto';
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Notification styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Make images clickable
function enhanceImagesFunctionality() {
    document.addEventListener('click', function(e) {
        const postCard = e.target.closest('.post-card');
        if (postCard) {
            const link = postCard.querySelector('.read-more');
            if (link) {
                window.open(link.href, '_blank');
            }
        }
    });
}

// Enhanced initialization
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    enhanceImagesFunctionality();
    
    // Load data every 5 minutes
    setInterval(loadMetricsData, 300000);
});

// Handle image errors
document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            const parent = e.target.parentElement;
            if (parent.classList.contains('post-image') || parent.classList.contains('hero-image')) {
                e.target.style.display = 'none';
                const placeholder = parent.querySelector('.image-placeholder');
                if (placeholder) {
                    placeholder.style.display = 'flex';
                }
            }
        }
    }, true);
});