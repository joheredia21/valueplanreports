// Configuración de la app
const APP_CONFIG = {
  RPC_URL: 'https://api.hive.blog',
  LIMIT: 12,
  DEFAULT_USER: 'hiveio',
  SHEETS_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4/pub?output=csv',
  TOTAL_FUNDING_EXPORT_CSV: 'https://docs.google.com/spreadsheets/d/1tqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4/export?format=csv&gid=1152760254',
  CREATE_COPY_ENDPOINT: '',
  TEMPLATE_SPREADSHEET_ID: '1TEdXH_QQLH7wZub7QdsI9CdJOy8I4e0' // keep if needed (not used for button now)
};

// Application state
let appState = {
  currentUser: null,
  posts: [],
  metrics: [],
  isLoading: false
};

// DOM elements (some may not exist immediately)
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
  activeCountries: document.getElementById('active-countries'),
  projectReportsBtn: document.getElementById('project-reports-btn'),
  projectReportsLink: document.getElementById('project-reports-link'),
  mainNav: document.getElementById('main-nav')
};

// -------------------- Utilities --------------------
function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[s]); }

function showLoading(show, text='Loading data...'){
  appState.isLoading = !!show;
  if (DOM.loadingOverlay) {
    DOM.loadingOverlay.style.display = show ? 'flex' : 'none';
    const lt = document.getElementById('loading-text');
    if (lt) lt.textContent = text;
  }
  document.body.style.overflow = show ? 'hidden' : 'auto';
}

function showNotification(message, type='info'){
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `<span>${escapeHtml(message)}</span><button onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
  notification.style.cssText = `position:fixed; top:20px; right:20px; padding:12px 20px; background:${type==='error'?'#ef4444':type==='success'?'#10b981':'#3b82f6'}; color:white; border-radius:8px; display:flex; align-items:center; gap:10px; z-index:10001;`;
  document.body.appendChild(notification);
  setTimeout(()=>{ if (notification.parentElement) notification.remove(); },5000);
}

// Parse numbers from strings robustly (handles "1,234.56" and "1.234.567,89")
function parseNumberFromString(s){
  if (s == null) return NaN;
  let str = String(s).trim();
  if (!str) return NaN;

  // remove currency symbols and whitespace at start/end
  str = str.replace(/^\s*[$€£]\s*/, '').trim();

  const hasDot = str.indexOf('.') !== -1;
  const hasComma = str.indexOf(',') !== -1;

  let normalized = str;

  // Case A: both dot and comma present and comma appears after last dot -> european format "1.234.567,89"
  if (hasDot && hasComma && str.lastIndexOf(',') > str.lastIndexOf('.')) {
    normalized = str.replace(/\./g, '').replace(/,/g, '.'); // remove thousands dots, comma->dot decimal
  } else {
    // Otherwise remove commas (thousands) and keep dot as decimal if present
    normalized = str.replace(/,/g, '');
  }

  // remove any non-digit except dot and minus
  normalized = normalized.replace(/[^\d.-]/g, '');

  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : NaN;
}

// Format number as currency with Spanish-style thousands (1.085.040,71)
function formatCurrencyES(num){
  if (!Number.isFinite(num)) return String(num);
  return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -------------------- RPC & Posts --------------------
async function rpcCall(method, params){
  const body = { jsonrpc:'2.0', method, params, id:1 };
  const response = await fetch(APP_CONFIG.RPC_URL, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

async function loadDefaultContent() {
  await loadUserContent(APP_CONFIG.DEFAULT_USER);
}

async function handleSearch(){
  const username = DOM.userSearch?.value?.trim();
  if (!username) {
    showNotification('Please enter a username', 'error');
    return;
  }
  await loadUserContent(username);
}

async function loadUserContent(username){
  showLoading(true);
  try {
    const accounts = await rpcCall('condenser_api.get_accounts', [[username]]);
    if (!accounts || accounts.length === 0) throw new Error(`User "${username}" not found`);
    appState.currentUser = accounts[0];
    const posts = await rpcCall('condenser_api.get_discussions_by_blog', [{ tag: username, limit: APP_CONFIG.LIMIT }]);
    appState.posts = posts || [];
    updateHeroSection(posts?.[0]);
    renderPostsGrid(posts || []);
    showNotification(`Content from @${username} loaded successfully`, 'success');
  } catch (err) {
    console.error(err);
    showNotification(err.message || 'Error loading user content', 'error');
  } finally {
    showLoading(false);
  }
}

// -------------------- Metrics CSV parsing --------------------
async function loadMetricsData(){
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

function parseCSV(csv){
  if (!csv) return [];
  const lines = csv.split(/\r?\n/);
  // keep blank lines? we'll filter rows later
  const nonEmpty = lines.filter(line => line.trim().length > 0);
  if (nonEmpty.length < 1) return [];
  const headers = splitCsvLine(nonEmpty[0]);
  const rows = [];
  for (let i = 1; i < nonEmpty.length; i++){
    const values = splitCsvLine(nonEmpty[i]);
    const entry = {};
    headers.forEach((h, idx) => entry[h] = values[idx] || '');
    rows.push(entry);
  }
  return rows.filter(r => r.Proyecto); // keep rows with Proyecto
}

// basic CSV line splitter (handles quoted commas)
function splitCsvLine(line){
  const result = [];
  let cur = '', inQuotes = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"' ) { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(cur); cur=''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result.map(s => s.trim());
}

// -------------------- Rendering --------------------
function renderMetrics(metrics){
  if (!DOM.metricsContainer) return;
  DOM.metricsContainer.innerHTML = '';
  metrics.forEach(metric => {
    DOM.metricsContainer.appendChild(createMetricElement(metric));
  });
}

function createMetricElement(metric){
  const card = document.createElement('div');
  card.className = 'metric-card fade-in';
  const change = (Math.random() * 20 - 10).toFixed(1);
  const isPositive = change >= 0;
  const presupuesto = metric.Presupuesto || 'N/A';
  card.innerHTML = `
      <div class="metric-header">
          <div class="metric-title">${escapeHtml(metric.Proyecto)}</div>
          <div class="metric-icon"><i class="fas fa-chart-line"></i></div>
      </div>
      <div class="metric-value">${escapeHtml(presupuesto)}</div>
      <div class="metric-change ${isPositive ? 'change-positive' : 'change-negative'}">
          <i class="fas ${isPositive ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${Math.abs(change)}%
      </div>
      <div class="metric-chart"></div>
      <div class="metric-details">
          <div><strong>Country:</strong> ${escapeHtml(metric.País || 'N/A')}</div>
          <div><strong>Status:</strong> ${escapeHtml(metric.Estado || 'N/A')}</div>
          <div><strong>Date:</strong> ${escapeHtml(metric['Fecha de inicio'] || 'N/A')}</div>
      </div>
  `;
  return card;
}

function updateSummaryStats(metrics){
  if (!metrics || metrics.length === 0) return;
  if (DOM.totalProjects) DOM.totalProjects.textContent = metrics.length;

  const totalFunding = metrics.reduce((sum, metric) => {
    const raw = metric.Presupuesto || '';
    const num = parseNumberFromString(raw);
    return sum + (Number.isFinite(num) ? num : 0);
  }, 0);

  if (DOM.totalFunding) {
    // Format using Spanish-style thousands/comma decimals
    DOM.totalFunding.textContent = `$${formatCurrencyES(totalFunding)}`;
  }

  const uniqueCountries = new Set(metrics.map(m => m.País).filter(Boolean));
  if (DOM.activeCountries) DOM.activeCountries.textContent = uniqueCountries.size;
}

// ------------- Total Funding live update --------------
async function loadTotalFunding(){
  try {
    const resp = await fetch(APP_CONFIG.TOTAL_FUNDING_EXPORT_CSV, { cache: "no-store" });
    if (!resp.ok) throw new Error('No se pudo obtener Total Funding');
    const csv = await resp.text();
    const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length < 3) {
      console.warn('ValuePlan sheet CSV tiene menos de 3 filas');
      return;
    }

    // Third row (index 2)
    const row3 = splitCsvLine(lines[2]);

    // Column N is the 14th column -> index 13 (0-based)
    let valueN3 = (row3[13] !== undefined && String(row3[13]).trim() !== '') ? row3[13] : (row3[row3.length - 1] || '');

    // If still empty, try to find the first cell that looks like a currency/number from the row
    if ((!valueN3 || String(valueN3).trim() === '') && row3.length > 0) {
      for (let i = row3.length - 1; i >= 0; i--) {
        const candidate = row3[i];
        if (candidate && /[\d.,]/.test(candidate)) { valueN3 = candidate; break; }
      }
    }

    if (valueN3 !== '' && valueN3 != null) {
      const num = parseNumberFromString(valueN3);
      if (Number.isFinite(num)) {
        DOM.totalFunding.textContent = `$${formatCurrencyES(num)}`;
      } else {
        // show raw cell (trim)
        DOM.totalFunding.textContent = String(valueN3).trim();
      }
    }
  } catch (err) {
    console.error('Error loading total funding:', err);
  }
}

// -------------------- Posts & UI helpers --------------------
function updateHeroSection(post){
  if (!post || !DOM.heroSection) return;
  const metadata = parseMetadata(post.json_metadata);
  const images = extractImages(post, metadata);
  DOM.heroSection.innerHTML = `
      <div class="hero-image">
          ${images.length > 0 ? `<img src="${images[0]}" alt="${escapeHtml(post.title||'Post image')}">` : `<div class="image-placeholder"><i class="fas fa-image"></i></div>`}
      </div>
      <div class="hero-content">
          <h3>${escapeHtml(post.title || 'No title')}</h3>
          <p class="hero-excerpt">${escapeHtml(extractExcerpt(post.body, 150))}</p>
          <div class="hero-meta">
              <span class="hero-author">By @${escapeHtml(post.author)}</span>
              <span class="hero-date">${formatDate(post.created)}</span>
          </div>
          <a href="${generatePostLink(post)}" target="_blank" class="cta-button">Read more <i class="fas fa-arrow-right"></i></a>
      </div>
  `;
}

function renderPostsGrid(posts){
  if (!DOM.postsGrid) return;
  DOM.postsGrid.innerHTML = '';
  const postsToShow = (posts || []).slice(1, APP_CONFIG.LIMIT);
  postsToShow.forEach((post, i) => DOM.postsGrid.appendChild(createPostElement(post, i===0)));
  animatePosts();
}

function createPostElement(post, isFeatured=false){
  const metadata = parseMetadata(post.json_metadata);
  const images = extractImages(post, metadata);
  const votes = post.net_votes || 0;
  const comments = post.children || 0;
  const article = document.createElement('article');
  article.className = `post-card fade-in ${isFeatured ? 'featured' : ''}`;
  article.innerHTML = `
      <div class="post-image">
          ${images.length>0 ? `<img src="${images[0]}" alt="${escapeHtml(post.title||'Post image')}" loading="lazy">` : `<div class="image-placeholder"><i class="fas fa-image"></i></div>`}
      </div>
      <div class="post-content">
          <div class="post-meta">
              <span class="post-author">@${escapeHtml(post.author)}</span>
              <span class="post-date">${formatDate(post.created)}</span>
          </div>
          <h3 class="post-title">${escapeHtml(post.title||'No title')}</h3>
          <p class="post-excerpt">${escapeHtml(extractExcerpt(post.body,120))}</p>
          <div class="post-actions">
              <button class="action-btn"><i class="fas fa-heart"></i> <span>${votes}</span></button>
              <button class="action-btn"><i class="fas fa-comment"></i> <span>${comments}</span></button>
              <a href="${generatePostLink(post)}" target="_blank" class="read-more">Read more <i class="fas fa-arrow-right"></i></a>
          </div>
      </div>
  `;
  return article;
}

function animatePosts(){ document.querySelectorAll('.post-card').forEach((post,i)=> post.style.animationDelay = `${i*0.1}s`); }
function parseMetadata(metadata){ try { return typeof metadata === 'string' ? JSON.parse(metadata) : metadata || {}; } catch(e){ console.error('metadata parse error',e); return {}; } }
function extractImages(post, metadata){
  const images = [];
  if (metadata.image) { const metaImages = Array.isArray(metadata.image) ? metadata.image : [metadata.image]; images.push(...metaImages.filter(i=> typeof i === 'string')); }
  if (metadata.images) { const metaImages = Array.isArray(metadata.images) ? metadata.images : [metadata.images]; images.push(...metaImages.filter(i=> typeof i === 'string')); }
  if (post.body) {
      const imageRegex = /https?:\/\/[^"']*\.(jpg|jpeg|png|gif|webp)/gi;
      const bodyImages = post.body.match(imageRegex) || [];
      images.push(...bodyImages);
  }
  return images.filter(Boolean).map(s=>s.trim().replace('http://','https://')).filter((v,i,self)=>self.indexOf(v)===i);
}
function extractExcerpt(body, maxLength){ if (!body) return 'No content available'; const plainText = body.replace(/[#*\[\]()~`>]/g,'').replace(/\n/g,' ').replace(/<[^>]*>/g,'').trim(); return plainText.length<=maxLength ? plainText : plainText.substring(0,maxLength)+'...'; }
function formatDate(dateString){ try { const date = new Date(dateString); return date.toLocaleDateString('en-US',{ year:'numeric', month:'long', day:'numeric' }); } catch { return dateString; } }
function generatePostLink(post){ if (!post) return '#'; let url = post.url || post.permlink || '#'; if (!url.startsWith('http')) url = `https://peakd.com${url}`; return url; }

// -------------------- Project Reports (button -> reports.html) --------------------
function onProjectReportsClick(e){
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  // Navigate to local reports page (same tab). If you prefer new tab use window.open('reports.html','_blank')
  window.location.href = 'reports.html';
}

// -------------------- Initialization & events --------------------
function setupEventListeners(){
  // Mobile menu toggle
  if (DOM.mobileMenu) {
      DOM.mobileMenu.addEventListener('click', function(){
          this.classList.toggle('active');
          if (DOM.mainNav) DOM.mainNav.classList.toggle('active');
          document.body.classList.toggle('menu-open');
      });
  }

  // Search
  if (DOM.searchBtn) DOM.searchBtn.addEventListener('click', handleSearch);
  if (DOM.userSearch) DOM.userSearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });

  // Refresh data
  if (DOM.refreshData) DOM.refreshData.addEventListener('click', loadMetricsData);

  // Project Reports actions (desktop & mobile)
  if (DOM.projectReportsBtn) {
    // If projectReportsBtn is an <a> this won't break; we preventDefault inside handler
    DOM.projectReportsBtn.addEventListener('click', onProjectReportsClick);
    // ensure visual href for accessibility if it's an <a>
    if (DOM.projectReportsBtn.tagName === 'A') DOM.projectReportsBtn.setAttribute('href','reports.html');
  }
  if (DOM.projectReportsLink) {
    DOM.projectReportsLink.addEventListener('click', function(e){ e.preventDefault(); onProjectReportsClick(e); });
    DOM.projectReportsLink.setAttribute('href','reports.html');
  }

  // Close mobile menu when link clicked
  try {
    const nav = DOM.mainNav;
    if (nav) nav.querySelectorAll('a').forEach(link => link.addEventListener('click', ()=> {
      if (DOM.mobileMenu && DOM.mobileMenu.classList.contains('active')) {
        DOM.mobileMenu.classList.remove('active');
        nav.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    }));
  } catch(e){ /* ignore */ }
}

function enhanceImagesFunctionality(){
  document.addEventListener('click', function(e){
      const postCard = e.target.closest('.post-card');
      if (postCard) {
          const link = postCard.querySelector('.read-more');
          if (link) window.open(link.href, '_blank');
      }
  });
}

document.addEventListener('error', function(e){
  if (e.target && e.target.tagName === 'IMG') {
      const parent = e.target.parentElement;
      if (parent && (parent.classList.contains('post-image') || parent.classList.contains('hero-image'))) {
          e.target.style.display = 'none';
          const placeholder = parent.querySelector('.image-placeholder');
          if (placeholder) placeholder.style.display = 'flex';
      }
  }
}, true);

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
  setupEventListeners();
  enhanceImagesFunctionality();
  loadDefaultContent();
  loadMetricsData();
  loadTotalFunding(); // load the live Total Funding value on start
  // Refresh intervals
  setInterval(loadTotalFunding, 120000); // every 2 minutes
  setInterval(loadMetricsData, 300000); // every 5 minutes
});
