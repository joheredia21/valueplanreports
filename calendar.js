/* calendar.js
   English comments throughout.
   High-level features:
   - Reads events from a Google Sheet CSV (via gviz CSV endpoint)
   - Shows compact 1..3 mini-month calendars + an expandable full calendar modal
   - Event drawer shows rich event detail with image, description and funds (HBD)
   - Charts: bar (funds by event), pie (funds by country)
   - Map (Leaflet): circle markers, color/size by funds
   - Toggle to show/hide past events (prioritize upcoming)
   - Past events are visually marked as completed
*/

/* ========== CONFIG - EDIT THESE VALUES ========== */
// Replace with your Google Sheet ID (the long string in the sheet URL)
const SHEET_ID = "1tqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4";

// Exact tab name in the Spreadsheet that contains the table
const TAB_CALENDAR = "calendar";

// Optional: timezone (FullCalendar)
const TIMEZONE = "UTC";

/* ========== END CONFIG ========== */

// CSV URL helper - public sheet or published sheet should work
const CSV_URL = (tabName) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

// DOM references
const compactContainer = document.getElementById("compact-calendars");
const monthsSelect = document.getElementById("months-count");
const expandBtn = document.getElementById("expand-btn");
const modal = document.getElementById("modal");
const modalBackdrop = document.getElementById("modal-backdrop");
const closeModalBtn = document.getElementById("close-modal");
const expandedCalendarEl = document.getElementById("expanded-calendar");
const showPastToggle = document.getElementById("show-past-toggle");
const eventsListEl = document.getElementById("events-list");
const eventsCountEl = document.getElementById("events-count");

// charts + map globals
let barChart, pieChart, mapInstance;
let leafletLayerGroup;

// FullCalendar instances
let miniCalendars = [];
let expandedCalendar; // full calendar

// Data store
let rawEvents = []; // parsed from sheet
let events = []; // normalized events

// small country lat-lon dictionary (extendable)
const COUNTRY_COORDS = {
  "poland":[51.9194,19.1451],
  "bolivia":[-16.4897,-68.1193],
  "venezuela":[6.4238,-66.5897],
  "paraguay":[-23.4425,-58.4438],
  "colombia":[4.5709,-74.2973],
  "cuba":[21.5218,-77.7812],
  "germany":[51.1657,10.4515],
  "united states":[37.0902,-95.7129],
  "spain":[40.4637,-3.7492],
  "france":[46.2276,2.2137],
  "italy":[41.8719,12.5674]
};

// Helper: parse funds string like "3.165,00" or "9,178.38" or "3165.00" to float
function parseFunds(value){
  if(value === undefined || value === null) return 0;
  let s = String(value).trim();
  // remove currency symbols, spaces
  s = s.replace(/[^\d\.,-]/g,'').trim();

  // detect european format (dot thousands, comma decimal) common when string contains both '.' and ','
  if(s.indexOf('.') !== -1 && s.indexOf(',') !== -1){
    // assume '.' thousands and ',' decimal
    s = s.replace(/\./g,'').replace(',', '.');
  }else{
    // if only commas exist and no dots -> probably comma as decimal
    if(s.indexOf(',') !== -1 && s.indexOf('.') === -1){
      s = s.replace(',', '.');
    }else{
      // keep as is (dots may be decimal)
    }
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Helper: clamp
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Helper: color interpolation green -> yellow -> red by normalized ratio 0..1
function fundsColor(val, min, max){
  if(min === max) return 'hsl(10 80% 50%)';
  const ratio = clamp((val - min) / (max - min), 0, 1);
  // hue from 120 (green) to 0 (red)
  const hue = Math.round((1 - ratio) * 120);
  return `hsl(${hue} 75% 45%)`;
}

// convert "City, Country" to just country (taking last part)
function extractCountry(raw){
  if(!raw) return "";
  let parts = raw.split(',');
  return parts[parts.length - 1].trim();
}

// parse date string tolerant to "YYYY-MM-DD" and "YYYY-MM-DD HH:MM"
function parseDateString(s){
  if(!s) return null;
  s = String(s).trim();
  // If only date (YYYY-MM-DD), new Date handles it as UTC in modern browsers; to avoid timezone shift we add 'T00:00:00'
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    return new Date(s + 'T00:00:00');
  }
  // replace space between date and time with 'T' if present
  if(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)){
    return new Date(s.replace(/\s+/, 'T'));
  }
  // try Date parse fallback
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/* =================== DATA LOADING =================== */
async function loadSheet(){
  const url = CSV_URL(TAB_CALENDAR);
  const resp = await fetch(url, { cache: "no-store" });
  if(!resp.ok) throw new Error(`CSV fetch failed: ${resp.status}`);
  const csv = await resp.text();
  const parsed = Papa.parse(csv, { header:true, skipEmptyLines:true });
  rawEvents = parsed.data;
  normalizeEvents();
}

/* Normalize rawEvents -> events array used by app */
function normalizeEvents(){
  events = rawEvents.map((r, idx) => {
    // Normalize column names tolerant to the variations in your sheet
    // Possible headers: Start Date / End date / Evento / Funds / Image link / description / country
    // We'll try to find fields by lowercased keys
    const normalized = {};
    for(const k of Object.keys(r)){
      const k2 = k.replace(/\s+/g,'').toLowerCase().trim();
      normalized[k2] = r[k];
    }

    const rawStart = normalized['startdate'] ?? normalized['start date'] ?? normalized['start'] ?? normalized['fecha'] ?? '';
    const rawEnd   = normalized['enddate'] ?? normalized['end date'] ?? normalized['end'] ?? normalized['fecha fin'] ?? '';
    const title    = r['Evento'] ?? r['evento'] ?? r['Event'] ?? r['evento'] ?? r['Evento'] ?? (normalized['evento'] || normalized['event'] || 'Untitled Event');
    const fundsRaw = r['Funds'] ?? r['funds'] ?? normalized['funds'] ?? '';
    const image    = r['Image link'] ?? r['image link'] ?? r['img'] ?? normalized['imagelink'] ?? normalized['image'] ?? '';
    const description = r['description'] ?? r['Description'] ?? normalized['description'] ?? '';
    const rawCountry  = r['country'] ?? r['Country'] ?? normalized['country'] ?? '';

    const start = parseDateString(rawStart);
    const end = parseDateString(rawEnd);
    const funds = parseFunds(fundsRaw);
    const country = extractCountry(rawCountry || '');

    return {
      id: `evt-${idx}`,
      title: String(title || '').trim(),
      start,
      end,
      funds,
      image: String(image || '').trim(),
      description: String(description || '').trim(),
      country: country,
      raw: r
    };
  })
  // sort events ascending by start
  events.sort((a,b) => {
    if(!a.start) return 1;
    if(!b.start) return -1;
    return a.start - b.start;
  });
}

/* =================== RENDERING LOGIC =================== */

/* Filter according to showPast toggle:
   - if showPast = false -> upcoming events: events whose end >= today OR start >= today
   - if showPast = true -> show all events
*/
function getFilteredEvents(){
  const showPast = showPastToggle.checked;
  if(showPast) return events;
  const now = new Date();
  return events.filter(e => {
    // treat missing end as using start
    const eEnd = e.end ?? e.start;
    // if eEnd >= start of today => upcoming or ongoing
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return eEnd >= startOfToday;
  });
}

/* Create mini calendars (1..n) each showing sequential months starting from current month */
function renderMiniCalendars(){
  // destroy previous calendars
  miniCalendars.forEach(c => c.destroy && c.destroy());
  miniCalendars = [];
  compactContainer.innerHTML = '';

  const months = parseInt(monthsSelect.value || '1', 10);
  const filtered = getFilteredEvents();

  // find funds min/max for coloring
  const fundsArr = filtered.map(f => f.funds);
  const minFunds = Math.min(...fundsArr, 0);
  const maxFunds = Math.max(...fundsArr, 1);

  const baseDate = new Date(); // current
  for(let i=0;i<months;i++){
    const wrapper = document.createElement('div');
    wrapper.className = 'mini-cal';
    wrapper.id = `mini-cal-${i}`;
    compactContainer.appendChild(wrapper);

    // initialDate = current month + i
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);

    // convert our events to FullCalendar source format with colors
    const fcEvents = filtered.map(ev => {
      const eventColor = fundsColor(ev.funds, minFunds, maxFunds);
      return {
        id: ev.id,
        title: ev.title,
        start: ev.start ? ev.start.toISOString() : null,
        end: ev.end ? ev.end.toISOString() : null,
        allDay: true,
        backgroundColor: eventColor,
        borderColor: eventColor,
        extendedProps: {
          funds: ev.funds,
          description: ev.description,
          image: ev.image,
          country: ev.country
        }
      };
    });

    const calendar = new FullCalendar.Calendar(wrapper, {
      initialView: 'dayGridMonth',
      initialDate: d,
      locale: 'en',
      height: 320,
      headerToolbar: {
        left: '',
        center: 'title',
        right: ''
      },
      events: fcEvents,
      eventClick: function(info){
        info.jsEvent.preventDefault();
        openEventDrawer(info.event);
      },
      dayMaxEventRows: true,
      navLinks: false
    });

    calendar.render();
    miniCalendars.push(calendar);
  }
}

/* Expanded calendar modal with full features */
function renderExpandedCalendar(){
  // destroy if exists
  if(expandedCalendar){
    expandedCalendar.destroy();
    expandedCalendar = null;
  }

  // prepare events
  const filtered = getFilteredEvents();
  const fundsArr = filtered.map(f => f.funds);
  const minFunds = Math.min(...fundsArr,0);
  const maxFunds = Math.max(...fundsArr,1);

  const fcEvents = filtered.map(ev => ({
    id: ev.id,
    title: ev.title,
    start: ev.start ? ev.start.toISOString() : null,
    end: ev.end ? ev.end.toISOString() : null,
    allDay: true,
    backgroundColor: fundsColor(ev.funds, minFunds, maxFunds),
    borderColor: fundsColor(ev.funds, minFunds, maxFunds),
    extendedProps:{
      funds: ev.funds,
      description: ev.description,
      image: ev.image,
      country: ev.country
    }
  }));

  expandedCalendar = new FullCalendar.Calendar(expandedCalendarEl, {
    initialView: 'dayGridMonth',
    height: 620,
    headerToolbar:{
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
    },
    locale: 'en',
    events: fcEvents,
    eventClick: function(info){
      info.jsEvent.preventDefault();
      openEventDrawer(info.event);
    }
  });

  expandedCalendar.render();
}

/* Render events list (cards) - upcoming prioritized */
function renderEventsList(){
  const filtered = getFilteredEvents();
  const now = new Date();

  // split upcoming and past
  const upcoming = filtered.filter(ev => (ev.end ?? ev.start) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const past = filtered.filter(ev => (ev.end ?? ev.start) < new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  // we show upcoming first, then a small collapsed past section if showPast true
  eventsListEl.innerHTML = '';

  const listToShow = upcoming.concat(past);

  listToShow.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'event-card';
    // image
    const thumb = document.createElement('div');
    thumb.className = 'event-thumb';
    if(ev.image){
      const img = document.createElement('img');
      img.src = ev.image;
      img.alt = ev.title;
      thumb.appendChild(img);
    }else{
      thumb.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:6px">No image</div>`;
    }

    const meta = document.createElement('div');
    meta.className = 'event-meta';
    const title = document.createElement('div');
    title.className = 'event-title';
    title.textContent = ev.title + ( ( (ev.end ?? ev.start) < new Date() ) ? ' · Completed' : '' );

    const dates = document.createElement('div');
    dates.className = 'event-dates muted';
    const startFmt = ev.start ? ev.start.toLocaleDateString() : 'TBA';
    const endFmt = ev.end ? ev.end.toLocaleDateString() : '';
    dates.textContent = endFmt ? `${startFmt} — ${endFmt}` : startFmt;

    const funds = document.createElement('div');
    funds.className = 'event-funds';
    funds.textContent = `${ev.funds.toLocaleString(undefined, {maximumFractionDigits:2})} HBD`;

    const desc = document.createElement('div');
    desc.className = 'muted';
    desc.style.marginTop = '6px';
    desc.textContent = ev.description ? (ev.description.length > 120 ? ev.description.slice(0,120) + '…' : ev.description) : '';

    const cta = document.createElement('div');
    cta.className = 'event-cta';
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-ghost';
    viewBtn.innerHTML = `<i class="fa-solid fa-eye"></i> View`;
    viewBtn.onclick = () => openEventDrawerById(ev.id);
    cta.appendChild(viewBtn);

    meta.appendChild(title);
    meta.appendChild(dates);
    meta.appendChild(funds);
    if(desc.textContent) meta.appendChild(desc);
    meta.appendChild(cta);

    item.appendChild(thumb);
    item.appendChild(meta);
    eventsListEl.appendChild(item);
  });

  eventsCountEl.textContent = `${listToShow.length} events`;
}

/* Open event drawer by FullCalendar event object */
function openEventDrawer(fcEvent){
  const ev = {
    id: fcEvent.id,
    title: fcEvent.title,
    funds: fcEvent.extendedProps?.funds ?? 0,
    description: fcEvent.extendedProps?.description ?? '',
    image: fcEvent.extendedProps?.image ?? '',
    country: fcEvent.extendedProps?.country ?? '',
    start: fcEvent.start,
    end: fcEvent.end
  };
  populateDrawer(ev);
}

/* Open by id (from list) */
function openEventDrawerById(id){
  const ev = events.find(e => e.id === id);
  if(!ev) return;
  populateDrawer(ev);
}

/* Populate drawer HTML and show it */
function populateDrawer(ev){
  const drawer = document.getElementById('event-drawer');
  const content = document.getElementById('drawer-content');
  drawer.setAttribute('aria-hidden','false');

  // build beautiful content
  const html = `
    <div>
      ${ ev.image ? `<img src="${ev.image}" alt="${ev.title}" />` : '' }
      <h3 style="margin:8px 0 6px">${ev.title}</h3>
      <div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">
        ${ ev.start ? (new Date(ev.start)).toLocaleDateString() : 'TBA' }
        ${ ev.end ? ' — ' + (new Date(ev.end)).toLocaleDateString() : '' }
      </div>
      <div style="font-weight:800;color:var(--hive-red);margin-bottom:10px">
        ${ ev.funds.toLocaleString(undefined,{maximumFractionDigits:2}) } HBD
      </div>
      <div style="color:var(--text-secondary);font-size:14px;line-height:1.45">
        ${ ev.description ? ev.description : '<span style="color:var(--muted)">No description provided.</span>'}
      </div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        ${ ev.image ? `<a class="btn-primary" href="${ev.image}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-image"></i> View Image</a>` : '' }
        <button class="btn-ghost" id="drawer-focus-calendar">Locate on calendar</button>
      </div>
    </div>
  `;
  content.innerHTML = html;

  // attach locate button behaviour
  const locate = document.getElementById('drawer-focus-calendar');
  if(locate){
    locate.onclick = () => {
      // open modal and navigate to event date
      openModal();
      if(expandedCalendar && ev.start){
        expandedCalendar.gotoDate(ev.start);
        // optionally, flash the event in calendar
      }
    }
  }
}

/* Close drawer */
document.getElementById('drawer-close').addEventListener('click', () => {
  document.getElementById('event-drawer').setAttribute('aria-hidden','true');
});

/* Charts & Map rendering */
function renderChartsAndMap(){
  const filtered = getFilteredEvents();

  // 1) Bar chart: funds per event (top 10 descending)
  const sortedByFunds = [...filtered].sort((a,b)=>b.funds - a.funds).slice(0,10);
  const labels = sortedByFunds.map(e=>e.title);
  const data = sortedByFunds.map(e=>e.funds);
  const minFunds = Math.min(...filtered.map(e=>e.funds), 0);
  const maxFunds = Math.max(...filtered.map(e=>e.funds), 1);

  // Bar chart
  const barCtx = document.getElementById('barChart').getContext('2d');
  if(barChart) barChart.destroy();
  barChart = new Chart(barCtx, {
    type:'bar',
    data:{
      labels: labels,
      datasets:[{
        label:'Funds (HBD)',
        data:data,
        backgroundColor: data.map(v => fundsColor(v, minFunds, maxFunds)),
        borderRadius:6
      }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ ticks:{ maxRotation:30, minRotation:10 } },
        y:{ beginAtZero:true }
      }
    }
  });

  // 2) Pie chart aggregated by country
  const byCountry = {};
  filtered.forEach(e=>{
    const c = (e.country || 'Unknown').toLowerCase();
    byCountry[c] = (byCountry[c] || 0) + e.funds;
  });
  const pLabels = Object.keys(byCountry).map(k => k === 'unknown' ? 'Unknown' : capitalize(k));
  const pData = Object.values(byCountry);
  const pColors = pData.map(v => fundsColor(v, Math.min(...pData), Math.max(...pData)));

  const pieCtx = document.getElementById('pieChart').getContext('2d');
  if(pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type:'pie',
    data:{
      labels:pLabels,
      datasets:[{
        data:pData,
        backgroundColor:pColors
      }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ position:'bottom' } }
    }
  });

  // 3) Map (Leaflet) with circle markers colored by funds
  if(!mapInstance){
    mapInstance = L.map('map', { scrollWheelZoom:false, attributionControl:false }).setView([20,0],2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(mapInstance);
    leafletLayerGroup = L.layerGroup().addTo(mapInstance);
  }else{
    leafletLayerGroup.clearLayers();
  }

  // aggregate by country and map to coords
  const countryAgg = {};
  filtered.forEach(e=>{
    const c = (e.country || 'Unknown').toLowerCase();
    countryAgg[c] = countryAgg[c] || { funds:0, events:[] };
    countryAgg[c].funds += e.funds;
    countryAgg[c].events.push(e);
  });

  const values = Object.values(countryAgg).map(x=>x.funds);
  const globalMin = Math.min(...values,0);
  const globalMax = Math.max(...values,1);

  Object.keys(countryAgg).forEach(k=>{
    const agg = countryAgg[k];
    const label = k === 'unknown' ? 'Unknown' : capitalize(k);
    // find coordinates
    const coords = COUNTRY_COORDS[k] || null;
    if(!coords) return; // skip unknown country locations; you may add lat-lon to sheet for precision
    const color = fundsColor(agg.funds, globalMin, globalMax);
    const radius = 6 + ( (agg.funds / (globalMax || 1)) * 30 );

    const circle = L.circleMarker(coords, {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.8,
      weight:1
    }).bindPopup(`<strong>${label}</strong><br/>Funds: ${agg.funds.toLocaleString(undefined,{maximumFractionDigits:2})} HBD<br/>Events: ${agg.events.length}`);
    leafletLayerGroup.addLayer(circle);
  });

  // zoom to fit markers
  const allLayers = leafletLayerGroup.getLayers();
  if(allLayers.length > 0){
    const group = new L.featureGroup(allLayers);
    mapInstance.fitBounds(group.getBounds().pad(0.3));
  }
}

/* small helper */
function capitalize(s){ return s && s.length ? s[0].toUpperCase() + s.slice(1) : s; }

/* Re-render everything */
function refreshUI(){
  renderMiniCalendars();
  renderEventsList();
  renderChartsAndMap();
  // expanded calendar will be re-rendered when opening modal
}

/* Modal open/close */
function openModal(){
  modal.setAttribute('aria-hidden','false');
  // render full calendar fresh
  renderExpandedCalendar();
}
function closeModal(){
  modal.setAttribute('aria-hidden','true');
  if(expandedCalendar){
    expandedCalendar.destroy();
    expandedCalendar = null;
    expandedCalendarEl.innerHTML = '';
  }
}

// bind modal events
expandBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);

/* Events for UI controls */
monthsSelect.addEventListener('change', ()=> {
  renderMiniCalendars();
});
showPastToggle.addEventListener('change', ()=> {
  refreshUI();
});

/* ESC closes modal/drawer */
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    closeModal();
    document.getElementById('event-drawer').setAttribute('aria-hidden','true');
  }
});

/* Initial load */
(async function init(){
  try{
    await loadSheet();
    // convert string dates in events to Date objects already done in normalize
    refreshUI();
  }catch(err){
    console.error('Failed to load calendar data:', err);
    document.querySelector('.app-shell').insertAdjacentHTML('afterbegin',
      `<div style="padding:12px;background:#fff3f3;border:1px solid #ffd2d2;border-radius:10px;color:#7a1b1b;margin-bottom:12px">
         Error loading sheet: ${err.message}. Please verify SHEET_ID, sheet accessibility (Anyone with the link can view) and tab name.
       </div>`);
  }
})();
