// Configuración de la app
const APP_CONFIG = {
  RPC_URL: 'https://api.hive.blog',
  LIMIT: 12,
  DEFAULT_USER: 'hiveio',
  SHEETS_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4/pub?output=csv',

  TOTAL_FUNDING_EXPORT_CSV: 'https://docs.google.com/spreadsheets/d/1tqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4/export?format=csv&gid=1152760254',

  // Ya no necesitamos endpoint
  CREATE_COPY_ENDPOINT: '',

  // ID de tu plantilla
  TEMPLATE_SPREADSHEET_ID: '1TEdXH_QQLH7wZub7QdsI9CdJOy8eAlyM0xY6h8I1me0'
};

// Acción al dar clic en "Project Reports"
function onProjectReportsClick(){
  showLoading(true, 'Abriendo tu copia de la plantilla...');
  try {
    const copyUrl = `https://docs.google.com/spreadsheets/d/${APP_CONFIG.TEMPLATE_SPREADSHEET_ID}/copy`;
    window.open(copyUrl, '_blank');
    showNotification('Se abrió la plantilla para que hagas tu copia en Google Drive.', 'success');
  } catch (err) {
    console.error('Project Reports error:', err);
    showNotification('No se pudo abrir la copia de la plantilla.', 'error');
  } finally {
    showLoading(false);
  }
}


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

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp(){
    setupEventListeners();
    loadDefaultContent();
    loadMetricsData();
    loadTotalFunding(); // new: load the live Total Funding value
    // refresh funding every 2 minutes
    setInterval(loadTotalFunding, 120000);
}

// -------------------- Event listeners --------------------
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

    // Project Reports actions (desktop)
    if (DOM.projectReportsBtn) DOM.projectReportsBtn.addEventListener('click', onProjectReportsClick);
    // Project Reports link (mobile)
    if (DOM.projectReportsLink) DOM.projectReportsLink.addEventListener('click', function(e){ e.preventDefault(); onProjectReportsClick(); });
}

// -------------------- Hive RPC & Posts (keep original functionality) --------------------
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

// generic RPC call (unchanged)
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

// -------------------- Metrics CSV parsing (unchanged) --------------------
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
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 1) return [];
    const headers = splitCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++){
        const values = splitCsvLine(lines[i]);
        const entry = {};
        headers.forEach((h, idx) => entry[h] = values[idx] || '');
        rows.push(entry);
    }
    return rows.filter(r => r.Proyecto);
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

// rendering functions (kept as before)
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
    card.innerHTML = `
        <div class="metric-header">
            <div class="metric-title">${escapeHtml(metric.Proyecto)}</div>
            <div class="metric-icon"><i class="fas fa-chart-line"></i></div>
        </div>
        <div class="metric-value">${escapeHtml(metric.Presupuesto || 'N/A')}</div>
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
    DOM.totalProjects.textContent = metrics.length;
    const totalFunding = metrics.reduce((sum, metric) => {
        const value = parseFloat((metric.Presupuesto || '').replace(/[^\d.-]/g, '')) || 0;
        return sum + value;
    }, 0);
    DOM.totalFunding.textContent = `$${totalFunding.toLocaleString('en-US')}`;
    const uniqueCountries = new Set(metrics.map(m => m.País).filter(Boolean));
    DOM.activeCountries.textContent = uniqueCountries.size;
}

// ------------- Total Funding live update (new) --------------
async function loadTotalFunding(){
    try {
        const resp = await fetch(APP_CONFIG.TOTAL_FUNDING_EXPORT_CSV, { cache: "no-store" });
        if (!resp.ok) throw new Error('No se pudo obtener Total Funding');
        const csv = await resp.text();
        // Parse CSV robustly: split into lines, then parse columns
        const lines = csv.split(/\r?\n/).filter(Boolean);
        // Row N3 -> index 2 (0-based)
        if (lines.length < 3) {
            console.warn('ValuePlan sheet CSV tiene menos de 3 filas');
            return;
        }
        const row3 = splitCsvLine(lines[2]); // third row
        // Column N is 14th column => index 13
        const valueN3 = row3[14] !== undefined ? row3[14] : row3[row3.length - 1] || '';
        if (valueN3 !== '') {
            // Try to format as currency (if numeric)
            const cleaned = String(valueN3).replace(/[^\d.-]/g, '');
            const num = parseFloat(cleaned);
            if (!Number.isNaN(num)) {
                DOM.totalFunding.textContent = `$${num.toLocaleString('en-US')}`;
            } else {
                // if not numeric, show raw
                DOM.totalFunding.textContent = String(valueN3);
            }
        }
    } catch (err) {
        console.error('Error loading total funding:', err);
    }
}

// -------------------- Posts & UI helpers (kept) --------------------
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

// -------------------- UI helpers --------------------
function showLoading(show, text='Loading data...'){ appState.isLoading = !!show; if (DOM.loadingOverlay) { DOM.loadingOverlay.style.display = show ? 'flex' : 'none'; const lt = document.getElementById('loading-text'); if (lt) lt.textContent = text; } document.body.style.overflow = show ? 'hidden' : 'auto'; }
function showNotification(message, type='info'){ const notification = document.createElement('div'); notification.className = `notification ${type}`; notification.innerHTML = `<span>${escapeHtml(message)}</span><button onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`; notification.style.cssText = `position:fixed; top:20px; right:20px; padding:12px 20px; background:${type==='error'?'#ef4444':type==='success'?'#10b981':'#3b82f6'}; color:white; border-radius:8px; display:flex; align-items:center; gap:10px; z-index:10001;`; document.body.appendChild(notification); setTimeout(()=>{ if (notification.parentElement) notification.remove(); },5000); }
function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[s]); }

// -------------------- Project Reports functionality (NEW) --------------------
/*
Behavior:
- When user clicks "Project Reports" we send a POST to CREATE_COPY_ENDPOINT.
- That endpoint (Apps Script or server-side) must:
    - Open the TEMPLATE_SPREADSHEET_ID (master),
    - Extract/copy only the tab named "Report" into a new Spreadsheet,
    - Optionally set sharing / permissions (or keep private for admin),
    - Return { success: true, url: 'https://docs.google.com/spreadsheets/d/NEW_ID' }.
- The new spreadsheet will be owned by the account that runs the server-side script, so your admin account will be owner.
- If CREATE_COPY_ENDPOINT is empty or request fails, we fallback to opening the master template in a new tab for user to "Make a copy" (full doc).
*/

/**
 * Called when user clicks Project Reports
 */
async function onProjectReportsClick(){
    // visual feedback
    showLoading(true, 'Creating copy of Report sheet...');
    try {
        if (APP_CONFIG.CREATE_COPY_ENDPOINT && APP_CONFIG.CREATE_COPY_ENDPOINT.trim() !== '') {
            // call the server-side endpoint
            const resp = await fetch(APP_CONFIG.CREATE_COPY_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateSpreadsheetId: APP_CONFIG.TEMPLATE_SPREADSHEET_ID,
                    sheetName: 'Report' // explicitly request only the Report sheet
                })
            });
            const data = await resp.json();
            if (data && data.success && data.url) {
                showNotification('Report copy creada correctamente', 'success');
                // open the new spreadsheet in a new tab
                window.open(data.url, '_blank');
            } else {
                throw new Error((data && data.error) ? data.error : 'No se pudo crear la copia (endpoint).');
            }
        } else {
            // fallback: open template so user can "Make a copy" manually (full spreadsheet)
            showNotification('No hay endpoint configurado. Abriendo plantilla (copia manual).', 'info');
            const openUrl = `https://docs.google.com/spreadsheets/d/${APP_CONFIG.TEMPLATE_SPREADSHEET_ID}`;
            window.open(openUrl, '_blank');
        }
    } catch (err) {
        console.error('Project Reports error:', err);
        showNotification(err.message || 'Error creando copia', 'error');
    } finally {
        showLoading(false);
    }
}

/*
----------------------------
Ejemplo de Apps Script (server-side) que puedes desplegar
----------------------------
Pega este código en un nuevo proyecto de Google Apps Script (bound a tu cuenta admin),
configura "Deploy > New deployment" como "Web app", seleccionar "Execute as: Me (tu cuenta)" y
"Who has access: Anyone" (o quienes necesiten usarlo). Usa la URL resultante como CREATE_COPY_ENDPOINT.

Código de ejemplo (Apps Script):
--------------------------------
function doPost(e) {
  try {
    const body = typeof e.postData.contents === 'string' ? JSON.parse(e.postData.contents) : e.postData.contents;
    const templateId = body.templateSpreadsheetId; // e.g. '1tqPtEb...'
    const sheetName = body.sheetName || 'Report';

    // open template
    const src = SpreadsheetApp.openById(templateId);
    const sheet = src.getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + sheetName);

    // create new spreadsheet
    const newSs = SpreadsheetApp.create(sheetName + ' - Copy ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'));
    const newId = newSs.getId();

    // remove default sheet
    const defaultSheet = newSs.getSheets()[0];
    newSs.deleteSheet(defaultSheet);

    // copy sheet into new spreadsheet
    sheet.copyTo(newSs);

    // after copy, the copied sheet name will be something like 'Copy of Report', rename it
    const copied = newSs.getSheets()[0];
    copied.setName(sheetName);

    // OPTIONAL: Move to a specific folder in your Drive or set sharing.
    // const folderId = 'FOLDER_ID_IF_WANTED';
    // DriveApp.getFileById(newId).moveTo(DriveApp.getFolderById(folderId));

    // OPTIONAL: set sharing so the user who requested can request access later, or add editors
    // DriveApp.getFileById(newId).addEditor('someone@example.com');

    const url = 'https://docs.google.com/spreadsheets/d/' + newId;
    return ContentService.createTextOutput(JSON.stringify({ success: true, url: url })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
--------------------------------
Notas:
- El script se ejecuta "as you" (la cuenta propietaria del script) — así las copias pertenecerán a esa cuenta.
- Ajusta permisos, carpetas o compartir según necesites.
- No pongas credenciales en código cliente.
----------------------------
*/

// -------------------- Misc --------------------
document.addEventListener('DOMContentLoaded', function(){
    enhanceImagesFunctionality();
    // ensure nav links close mobile menu when clicked
    try {
        const nav = document.getElementById('main-nav');
        if (nav) nav.querySelectorAll('a').forEach(link => link.addEventListener('click', ()=> {
            if (DOM.mobileMenu && DOM.mobileMenu.classList.contains('active')) {
                DOM.mobileMenu.classList.remove('active');
                nav.classList.remove('active');
                document.body.classList.remove('menu-open');
            }
        }));
    } catch(e){ /* ignore */ }

    // Load metrics periodically (kept)
    setInterval(loadMetricsData, 300000); // 5 minutes
});

// clickable posts behaviour
function enhanceImagesFunctionality(){
    document.addEventListener('click', function(e){
        const postCard = e.target.closest('.post-card');
        if (postCard) {
            const link = postCard.querySelector('.read-more');
            if (link) window.open(link.href, '_blank');
        }
    });
}

// image error handling
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
// Acción al dar clic en "Project Reports"
function onProjectReportsClick(){
  const copyUrl = `https://docs.google.com/spreadsheets/d/${APP_CONFIG.TEMPLATE_SPREADSHEET_ID}/copy`;
  window.open(copyUrl, '_blank');
}

// Vincular el botón al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('project-reports-btn');
  if (btn) {
    btn.addEventListener('click', onProjectReportsClick);
  }
});
