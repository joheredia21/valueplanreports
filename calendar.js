/* calendar.js - updated to:
   - use top nav similar to index
   - show map world view initially and shade countries via GeoJSON when possible
   - pie chart in modal by event (top N)
   - remove "View Image", keep only "Show Hive Posts" styled as btn-primary
   - use SHEET_ID/TAB_CALENDAR as provided
*/

(function(){
  // ========== CONFIG ==========
  const SHEET_ID = "1tqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4";
  const TAB_CALENDAR = "calendar";
  const TIMEZONE = "UTC";
  const GEOJSON_COUNTRIES_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";
  // ============================

  const CSV_URL = (tab) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

  // DOM refs
  const compactContainer = document.getElementById("compact-calendars");
  const monthsSelect = document.getElementById("months-count");
  const expandBtn = document.getElementById("expand-btn");
  const expandBottomBtn = document.getElementById("expand-bottom-btn");
  const viewAllBtn = document.getElementById("view-all-btn");
  const modal = document.getElementById("modal");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const closeModalBtn = document.getElementById("close-modal");
  const expandedCalendarEl = document.getElementById("expanded-calendar");
  const showPastToggle = document.getElementById("show-past-toggle");
  const eventsListEl = document.getElementById("events-list");
  const eventsCountEl = document.getElementById("events-count");

  const chartDetailsBtn = document.getElementById("chart-details");
  const chartModal = document.getElementById("chart-modal");
  const chartBackdrop = document.getElementById("chart-backdrop");
  const chartClose = document.getElementById("chart-close");
  const chartModalTitle = document.getElementById("chart-modal-title");
  const chartModalBody = document.getElementById("chart-modal-body");

  const mapExpandBtn = document.getElementById("map-expand");
  const mapNoteEl = document.getElementById("map-note");

  const drawer = document.getElementById("event-drawer");
  const drawerContent = document.getElementById("drawer-content");
  const hivePostsContainer = document.getElementById("hive-posts");
  const drawerClose = document.getElementById("drawer-close");

  const mobileNavToggle = document.getElementById('mobile-nav-toggle');

  // state
  let rawEvents = [];
  let events = [];
  let miniCalendars = [];
  let expandedCalendar = null;
  let barChart = null;
  let pieChartModal = null;
  let mapInstance = null;
  let countriesGeoJSON = null;
  let countryLayer = null;

  // small manual centroids for some countries (fallback to markers)
  const COUNTRY_COORDS = {
    poland:[51.9194,19.1451],
    bolivia:[-16.4897,-68.1193],
    venezuela:[6.4238,-66.5897],
    paraguay:[-23.4425,-58.4438],
    colombia:[4.5709,-74.2973],
    cuba:[21.5218,-77.7812],
    germany:[51.1657,10.4515],
    "united states":[37.0902,-95.7129],
    spain:[40.4637,-3.7492],
    france:[46.2276,2.2137],
    italy:[41.8719,12.5674],
    uk:[55.3781,-3.4360],
    unitedkingdom:[55.3781,-3.4360]
  };

  // ========== UTILS ==========
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function capitalize(s){ return s && s.length ? s[0].toUpperCase() + s.slice(1) : s; }

  function parseFunds(v){
    if(v === undefined || v === null) return 0;
    let s = String(v).trim();
    s = s.replace(/[^\d\.,-]/g,'').trim();
    if(s.indexOf('.') !== -1 && s.indexOf(',') !== -1){
      s = s.replace(/\./g,'').replace(',', '.');
    } else if(s.indexOf(',') !== -1 && s.indexOf('.') === -1){
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function parseDateString(s){
    if(!s) return null;
    s = String(s).trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
    if(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s)) return new Date(s.replace(/\s+/, 'T'));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function normalizeName(s){
    if(!s) return '';
    return s.toString().toLowerCase().replace(/\s*\(.+\)/g,'').replace(/[^\w\s]/g,'').replace(/\s+/g,' ').trim();
  }

  // produce red shade based on value between min..max
  function fundsColor(val, min, max){
    if(min === max) return '#7a0f16';
    const ratio = clamp((val - min) / (max - min), 0, 1);
    // interpolate from light pink to dark red
    const start = [255,200,200]; // light
    const end = [120,10,20]; // dark
    const r = Math.round(start[0] + (end[0]-start[0]) * ratio);
    const g = Math.round(start[1] + (end[1]-start[1]) * ratio);
    const b = Math.round(start[2] + (end[2]-start[2]) * ratio);
    return `rgb(${r},${g},${b})`;
  }

  // iso date
  function dateISO(d){ return d.toISOString().split('T')[0]; }
  function isDateWithinEvent(dayISO, ev){
    const startStr = ev.start ? dateISO(ev.start) : null;
    const endStr = ev.end ? dateISO(ev.end) : startStr;
    if(!startStr) return false;
    return (dayISO >= startStr && dayISO <= (endStr || startStr));
  }

  // ========== LOAD SHEET ==========
  async function loadSheet(){
    const url = CSV_URL(TAB_CALENDAR);
    const resp = await fetch(url, { cache: "no-store" });
    if(!resp.ok) throw new Error(`CSV fetch failed: ${resp.status}`);
    const csv = await resp.text();
    const parsed = Papa.parse(csv, { header:true, skipEmptyLines:true });
    rawEvents = parsed.data;
    normalizeEvents();
  }

  function normalizeEvents(){
    events = rawEvents.map((r, idx) => {
      const normalized = {};
      for(const k of Object.keys(r)){
        const k2 = k.replace(/\s+/g,'').toLowerCase().trim();
        normalized[k2] = r[k];
      }
      const rawStart = normalized['startdate'] ?? normalized['start date'] ?? normalized['start'] ?? '';
      const rawEnd   = normalized['enddate'] ?? normalized['end date'] ?? normalized['end'] ?? '';
      const title    = r['Evento'] ?? r['evento'] ?? r['Event'] ?? normalized['evento'] ?? normalized['event'] ?? 'Untitled Event';
      const fundsRaw = r['Funds'] ?? r['funds'] ?? normalized['funds'] ?? '';
      const image    = r['Image link'] ?? r['image link'] ?? normalized['imagelink'] ?? normalized['image'] ?? '';
      const description = r['description'] ?? normalized['description'] ?? '';
      // expect 'country' column in H as normalized['country']
      const rawCountry  = r['country'] ?? normalized['country'] ?? '';

      const start = parseDateString(rawStart);
      const end = parseDateString(rawEnd);
      const funds = parseFunds(fundsRaw);
      const country = normalizeName(rawCountry || '');

      return {
        id: `evt-${idx}`,
        title: String(title || '').trim(),
        start, end, funds,
        image: String(image || '').trim(),
        description: String(description || '').trim(),
        country,
        raw: r
      };
    });

    events.sort((a,b) => {
      if(!a.start) return 1;
      if(!b.start) return -1;
      return a.start - b.start;
    });
  }

  // ========== MINI CALENDARS ==========
  function renderMiniCalendars(){
    miniCalendars.forEach(c => c.destroy && c.destroy());
    miniCalendars = [];
    compactContainer.innerHTML = '';

    const months = parseInt(monthsSelect.value || '3', 10);
    const filtered = getFilteredEvents();
    const baseDate = new Date();

    for(let i=0;i<months;i++){
      const wrapper = document.createElement('div');
      wrapper.className = 'mini-cal';
      wrapper.id = `mini-cal-${i}`;
      compactContainer.appendChild(wrapper);

      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);

      const fcEvents = filtered.map(ev => ({
        id: ev.id,
        title: ev.title,
        start: ev.start ? ev.start.toISOString() : null,
        end: ev.end ? ev.end.toISOString() : null,
        allDay: true,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        extendedProps: {
          funds: ev.funds,
          description: ev.description,
          image: ev.image,
          country: ev.country
        }
      }));

      const calendar = new FullCalendar.Calendar(wrapper, {
        initialView: 'dayGridMonth',
        initialDate: d,
        locale: 'en',
        height: 320,
        headerToolbar: { left: '', center: 'title', right: '' },
        events: fcEvents,
        eventClick: function(info){
          info.jsEvent.preventDefault();
          openEventDrawer(info.event);
        },
        dayMaxEventRows: true,
        navLinks: false,
        dayCellDidMount: function(arg){
          const dayStr = dateISO(arg.date);
          const hasEvent = filtered.some(ev => isDateWithinEvent(dayStr, ev));
          if(hasEvent){
            arg.el.classList.add('event-day');
            arg.el.style.cursor = 'pointer';
            arg.el.onclick = () => {
              const evs = filtered.filter(ev => isDateWithinEvent(dayStr, ev));
              openDayDrawer(evs, dayStr);
            };
          }
        }
      });

      calendar.render();
      miniCalendars.push(calendar);
    }
  }

  // ========== EXPANDED CALENDAR ==========
  function renderExpandedCalendar(){
    if(expandedCalendar){ expandedCalendar.destroy(); expandedCalendar = null; expandedCalendarEl.innerHTML = ''; }

    const filtered = getFilteredEvents();
    const fcEvents = filtered.map(ev => ({
      id: ev.id,
      title: ev.title,
      start: ev.start ? ev.start.toISOString() : null,
      end: ev.end ? ev.end.toISOString() : null,
      allDay:true,
      backgroundColor:'transparent',
      borderColor:'transparent',
      extendedProps:{ funds: ev.funds, description: ev.description, image: ev.image, country: ev.country }
    }));

    expandedCalendar = new FullCalendar.Calendar(expandedCalendarEl, {
      initialView: 'dayGridMonth',
      height: 680,
      headerToolbar:{ left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
      locale: 'en',
      events: fcEvents,
      eventClick: function(info){ info.jsEvent.preventDefault(); openEventDrawer(info.event); },
      dayCellDidMount: function(arg){
        const dayStr = dateISO(arg.date);
        const hasEvent = filtered.some(ev => isDateWithinEvent(dayStr, ev));
        if(hasEvent){
          arg.el.classList.add('event-day');
          arg.el.onclick = () => {
            const evs = filtered.filter(ev => isDateWithinEvent(dayStr, ev));
            openDayDrawer(evs, dayStr);
          };
        }
      }
    });

    expandedCalendar.render();
  }

  // ========== MODALS ==========
  function openModal(){ modal.setAttribute('aria-hidden','false'); renderExpandedCalendar(); }
  function closeModal(){ modal.setAttribute('aria-hidden','true'); if(expandedCalendar){ expandedCalendar.destroy(); expandedCalendar = null; expandedCalendarEl.innerHTML = ''; } }
  expandBtn && expandBtn.addEventListener('click', openModal);
  expandBottomBtn && expandBottomBtn.addEventListener('click', openModal);
  closeModalBtn && closeModalBtn.addEventListener('click', closeModal);
  modalBackdrop && modalBackdrop.addEventListener('click', closeModal);

  // ========== DRAWER & HIVE POSTS ==========
  function openEventDrawer(fcEvent){
    const ev = {
      id: fcEvent.id,
      title: fcEvent.title,
      funds: fcEvent.extendedProps?.funds ?? 0,
      description: fcEvent.extendedProps?.description ?? '',
      image: fcEvent.extendedProps?.image ?? '',
      country: fcEvent.extendedProps?.country ?? '',
      start: fcEvent.start ?? null,
      end: fcEvent.end ?? null
    };
    populateDrawer(ev);
  }

  function openEventDrawerById(id){
    const ev = events.find(e => e.id === id);
    if(!ev) return;
    populateDrawer(ev);
  }

  function openDayDrawer(evs, dayISO){
    drawer.setAttribute('aria-hidden','false');
    const contentParts = evs.map(ev => {
      return `<div style="margin-bottom:12px;padding:10px;border-radius:10px;background:linear-gradient(180deg,#fff,var(--hive-light-gray));">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:800">${ev.title}</div>
          <div style="font-weight:800;color:var(--hive-red)">${ev.funds.toLocaleString()} HBD</div>
        </div>
        <div style="margin-top:8px">${ ev.description ? (ev.description.length>160?ev.description.slice(0,160)+'…':ev.description) : '<span class="muted">No description</span>' }</div>
        <div style="margin-top:8px"><button class="btn-ghost" data-id="${ev.id}">View</button></div>
      </div>`;
    }).join('');
    drawerContent.innerHTML = `<h3 style="margin-top:0">${(new Date(dayISO)).toLocaleDateString()}</h3>${contentParts}`;
    hivePostsContainer.innerHTML = '';
    drawerContent.querySelectorAll('button[data-id]').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        openEventDrawerById(id);
      });
    });
  }

  async function populateDrawer(ev){
    drawer.setAttribute('aria-hidden','false');

    // determine image (if any) but we no longer show the image button. Still can display image at top if present or from Hive posts
    let imageToShow = ev.image || '';
    if(!imageToShow){
      // attempt to fetch a post with image for that tag
      try{
        const posts = await fetchHivePosts(sanitizeTag(ev.title), 1);
        if(posts && posts.length && posts[0].image) imageToShow = posts[0].image;
      }catch(e){}
    }

    const startFmt = ev.start ? (new Date(ev.start)).toLocaleDateString() : 'TBA';
    const endFmt = ev.end ? (new Date(ev.end)).toLocaleDateString() : '';
    drawerContent.innerHTML = `
      ${ imageToShow ? `<img src="${imageToShow}" alt="${ev.title}" />` : '' }
      <h3 style="margin:8px 0 6px">${ev.title}</h3>
      <div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">
        ${ startFmt } ${ endFmt ? ' — ' + endFmt : '' } ${ ev.country ? ' · ' + capitalize(ev.country) : '' }
      </div>
      <div style="font-weight:800;color:var(--hive-red);margin-bottom:10px">
        ${ ev.funds.toLocaleString(undefined,{maximumFractionDigits:2}) } HBD
      </div>
      <div style="color:var(--text-secondary);font-size:14px;line-height:1.45">
        ${ ev.description || '<span class="muted">No description provided.</span>' }
      </div>
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button class="btn-primary" id="drawer-load-posts">Show Hive Posts (#${sanitizeTag(ev.title)})</button>
      </div>
    `;

    hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">Hive posts will appear here...</div>`;
    const loadBtn = document.getElementById('drawer-load-posts');
    if(loadBtn) loadBtn.onclick = async () => {
      hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">Loading posts for #${sanitizeTag(ev.title)}…</div>`;
      const posts = await fetchHivePosts(sanitizeTag(ev.title), 10);
      renderHivePosts(posts);
    };
  }

  drawerClose && drawerClose.addEventListener('click', ()=> drawer.setAttribute('aria-hidden','true'));

  function sanitizeTag(title){
    if(!title) return '';
    return title.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  }

  // ========== HIVE POSTS (via condenser_api) ==========
  async function fetchHivePosts(tag, limit = 6){
    try{
      const body = {
        jsonrpc: "2.0",
        method: "condenser_api.get_discussions_by_created",
        params: [{ tag: tag || '', limit }],
        id: 1
      };
      const res = await fetch('https://api.hive.blog', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if(json && json.result && Array.isArray(json.result)){
        return json.result.map(p => {
          let img = '';
          try{
            const meta = typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata) : p.json_metadata;
            if(meta && meta.image && meta.image.length) img = meta.image[0];
          }catch(e){}
          return { title: p.title, image: img, author: p.author, permlink: p.permlink, link: `https://peakd.com/@${p.author}/${p.permlink}` };
        });
      }
    }catch(err){
      console.warn('Hive RPC fetch failed:', err);
    }
    return [
      { title: `Sample post about ${tag}`, image: "https://picsum.photos/320/200?random=21", link:"#", author:'sample', permlink:'sample' }
    ];
  }

  function renderHivePosts(posts){
    if(!Array.isArray(posts) || posts.length === 0){
      hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">No posts found.</div>`;
      return;
    }
    hivePostsContainer.innerHTML = '';
    posts.forEach(p => {
      const el = document.createElement('div');
      el.className = 'hive-post';
      const link = p.link || `https://peakd.com/@${p.author}/${p.permlink}`;
      el.innerHTML = `<img src="${p.image || 'https://picsum.photos/120/90?random=9'}" alt="${p.title}"><div style="flex:1"><a href="${link}" target="_blank" rel="noopener noreferrer" style="font-weight:700;color:var(--hive-black)">${p.title}</a></div>`;
      hivePostsContainer.appendChild(el);
    });
  }

  // ========== BAR CHART ==========
  function renderBarChart(){
    const filtered = getFilteredEvents();
    const sorted = [...filtered].sort((a,b)=> b.funds - a.funds).slice(0,12);
    const labels = sorted.map(s=> s.title);
    const data = sorted.map(s=> s.funds);

    const ctx = document.getElementById('barChart').getContext('2d');
    if(barChart) barChart.destroy();
    barChart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Funds (HBD)', data, backgroundColor: '#e31337', borderRadius:8 }]},
      options:{
        indexAxis: 'y',
        responsive:true,
        plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: (ctx) => `${ctx.parsed.x.toLocaleString()} HBD` } } },
        scales:{
          x:{ beginAtZero:true, ticks:{ callback: v => Number(v).toLocaleString() } },
          y:{ ticks:{ autoSkip:false } }
        }
      }
    });
  }

  // ========== PIE (modal) BY EVENT ==========
  function openChartDetails(){
    chartModal.setAttribute('aria-hidden','false');
    chartModalTitle.textContent = 'Funds by Event (Top)';
    // build pie by top events
    chartModalBody.innerHTML = `<canvas id="pieChartModal" width="520" height="420"></canvas><div id="chart-summary" style="display:none"></div>`;
    const filtered = getFilteredEvents();
    const sorted = [...filtered].sort((a,b)=> b.funds - a.funds).slice(0,10);
    const labels = sorted.map(s=> s.title);
    const data = sorted.map(s=> s.funds);

    const colors = data.map((v,i)=> {
      // slightly varying reds
      const ratio = i / Math.max(1, data.length-1);
      return fundsColor(v, Math.min(...data,0), Math.max(...data,1));
    });

    const ctx = document.getElementById('pieChartModal').getContext('2d');
    if(pieChartModal) pieChartModal.destroy();
    pieChartModal = new Chart(ctx, {
      type:'pie',
      data:{ labels, datasets:[{ data, backgroundColor: colors }]},
      options:{ responsive:true, plugins:{ legend:{ position:'right' } } }
    });

    const summary = document.getElementById('chart-summary');
    if(summary){
      const total = data.reduce((a,b)=>a+b,0);
      summary.innerHTML = `<div style="padding:12px;background:var(--bg-white);border-radius:12px;box-shadow:var(--shadow)">
        <h4>Summary</h4><p class="muted">Total funds (top): <strong style="color:var(--hive-red)">${total.toLocaleString(undefined,{maximumFractionDigits:2})} HBD</strong></p>
      </div>`;
      summary.style.display = 'block';
    }
  }
  chartDetailsBtn && chartDetailsBtn.addEventListener('click', openChartDetails);
  chartClose && chartClose.addEventListener('click', () => chartModal.setAttribute('aria-hidden','true'));
  chartBackdrop && chartBackdrop.addEventListener('click', () => chartModal.setAttribute('aria-hidden','true'));

  // ========== MAP (world geojson shading) ==========
  async function loadCountriesGeoJSON(){
    if(countriesGeoJSON) return countriesGeoJSON;
    try{
      const r = await fetch(GEOJSON_COUNTRIES_URL);
      if(!r.ok) throw new Error('geojson fetch failed');
      const json = await r.json();
      countriesGeoJSON = json;
      return countriesGeoJSON;
    }catch(e){
      console.warn('Could not load world geojson:', e);
      countriesGeoJSON = null;
      return null;
    }
  }

  async function renderMap(){
    // initial world view
    if(mapInstance){ mapInstance.remove(); mapInstance = null; }
    const el = document.getElementById('map');
    el.innerHTML = '';
    mapInstance = L.map('map', { scrollWheelZoom:false, attributionControl:false }).setView([20,0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom: 5, attribution: '' }).addTo(mapInstance);

    const filtered = getFilteredEvents();
    const countryAgg = {};
    filtered.forEach(e => {
      const c = e.country || 'unknown';
      countryAgg[c] = countryAgg[c] || { funds:0, events:[] };
      countryAgg[c].funds += e.funds;
      countryAgg[c].events.push(e);
    });

    const values = Object.values(countryAgg).map(x=>x.funds);
    const minV = Math.min(...values,0);
    const maxV = Math.max(...values,1);

    // Try to load GeoJSON and shade countries
    const geo = await loadCountriesGeoJSON();
    if(geo){
      // remove previous layer
      if(countryLayer) { countryLayer.remove(); countryLayer = null; }
      // style by matching normalized name
      countryLayer = L.geoJSON(geo, {
        style: function(feature){
          const name = normalizeName(feature.properties.name || feature.properties.NAME || '');
          const agg = countryAgg[name];
          if(agg){
            return { fillColor: fundsColor(agg.funds, minV, maxV), weight:1, color:'#900', fillOpacity:0.85 };
          } else {
            return { fillColor: '#e9edf1', weight:0.2, color:'#cfd8df', fillOpacity:0.06 };
          }
        },
        onEachFeature: function(feature, layer){
          const name = normalizeName(feature.properties.name || feature.properties.NAME || '');
          const agg = countryAgg[name];
          if(agg){
            layer.bindPopup(`<strong>${feature.properties.name}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`);
          }
        }
      }).addTo(mapInstance);

      // keep initial world zoom (do not fit to group) as requested
      mapNoteEl.textContent = 'World view: countries shaded by funds (darker red = more funds).';
    } else {
      // fallback: drop circle markers on known centroids
      mapNoteEl.textContent = 'World view (fallback): showing markers for countries with coordinates. Countries without coordinates will not appear on map.';
      Object.keys(countryAgg).forEach(k => {
        const agg = countryAgg[k];
        const coords = COUNTRY_COORDS[k] || null;
        if(coords){
          const radius = 6 + ((agg.funds/(maxV||1)) * 30);
          L.circleMarker(coords, { radius, color: '#9b0f22', fillColor:'#9b0f22', fillOpacity:0.85, weight:1 })
            .bindPopup(`<strong>${capitalize(k)}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`)
            .addTo(mapInstance);
        } else {
          console.warn('No coordinates for', k);
        }
      });
    }
  }

  // map expand -> show map in modal
  mapExpandBtn && mapExpandBtn.addEventListener('click', () => {
    chartModalTitle.textContent = 'Event Map (world)';
    chartModalBody.innerHTML = `<div id="map-modal" style="height:520px;border-radius:12px;overflow:hidden"></div>`;
    chartModal.setAttribute('aria-hidden','false');
    setTimeout(async () => {
      // render map-modal similar to renderMap but target 'map-modal' container
      const el = document.getElementById('map-modal');
      if(!el) return;
      el.innerHTML = '';
      const mm = L.map('map-modal', { scrollWheelZoom:false, attributionControl:false }).setView([20,0],2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:5 }).addTo(mm);

      const filtered = getFilteredEvents();
      const countryAgg = {};
      filtered.forEach(e => {
        const c = e.country || 'unknown';
        countryAgg[c] = countryAgg[c] || { funds:0, events:[] };
        countryAgg[c].funds += e.funds;
        countryAgg[c].events.push(e);
      });
      const values = Object.values(countryAgg).map(x=>x.funds);
      const minV = Math.min(...values,0);
      const maxV = Math.max(...values,1);

      const geo = await loadCountriesGeoJSON();
      if(geo){
        L.geoJSON(geo, {
          style: function(feature){
            const name = normalizeName(feature.properties.name || feature.properties.NAME || '');
            const agg = countryAgg[name];
            if(agg){
              return { fillColor: fundsColor(agg.funds, minV, maxV), weight:1, color:'#900', fillOpacity:0.85 };
            } else {
              return { fillColor: '#e9edf1', weight:0.2, fillOpacity:0.04 };
            }
          },
          onEachFeature: function(feature, layer){
            const name = normalizeName(feature.properties.name || feature.properties.NAME || '');
            const agg = countryAgg[name];
            if(agg){
              layer.bindPopup(`<strong>${feature.properties.name}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`);
            }
          }
        }).addTo(mm);
      } else {
        // fallback markers
        Object.keys(countryAgg).forEach(k => {
          const agg = countryAgg[k];
          const coords = COUNTRY_COORDS[k] || null;
          if(coords){
            const radius = 6 + ((agg.funds/(maxV||1)) * 30);
            L.circleMarker(coords, { radius, color: '#9b0f22', fillColor:'#9b0f22', fillOpacity:0.85, weight:1 })
              .bindPopup(`<strong>${capitalize(k)}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`)
              .addTo(mm);
          }
        });
      }
    }, 150);
  });

  // ========== EVENTS LIST ==========
  function getFilteredEvents(){
    const showPast = showPastToggle.checked;
    if(showPast) return events;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return events.filter(e => ((e.end ?? e.start) >= startOfToday));
  }

  function renderEventsList(){
    const filtered = getFilteredEvents();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const upcoming = filtered.filter(ev => (ev.end ?? ev.start) >= startOfToday);
    const past = filtered.filter(ev => (ev.end ?? ev.start) < startOfToday);

    eventsListEl.innerHTML = '';
    const listToShow = upcoming.concat(past);

    listToShow.forEach(ev => {
      const item = document.createElement('div'); item.className = 'event-card';
      if((ev.end ?? ev.start) < startOfToday) item.classList.add('completed');

      const thumb = document.createElement('div'); thumb.className = 'event-thumb';
      if(ev.image){ const img = document.createElement('img'); img.src = ev.image; img.alt = ev.title; thumb.appendChild(img); }
      else thumb.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:6px">No image</div>`;

      const meta = document.createElement('div'); meta.className = 'event-meta';
      const title = document.createElement('div'); title.className = 'event-title'; title.textContent = ev.title + (((ev.end ?? ev.start) < startOfToday) ? ' · Completed' : '');
      const dates = document.createElement('div'); dates.className='event-dates muted';
      const startFmt = ev.start ? ev.start.toLocaleDateString() : 'TBA'; const endFmt = ev.end ? ev.end.toLocaleDateString() : '';
      dates.textContent = endFmt ? `${startFmt} — ${endFmt}` : startFmt;
      const funds = document.createElement('div'); funds.className='event-funds'; funds.textContent = `${ev.funds.toLocaleString()} HBD`;
      const desc = document.createElement('div'); desc.className='muted'; desc.style.marginTop='6px'; desc.textContent = ev.description ? (ev.description.length>120?ev.description.slice(0,120)+'…':ev.description) : '';
      const cta = document.createElement('div'); cta.className='event-cta';
      const viewBtn = document.createElement('button'); viewBtn.className='btn-ghost'; viewBtn.innerHTML=`<i class="fa-solid fa-eye"></i> View`; viewBtn.onclick = ()=> openEventDrawerById(ev.id);
      cta.appendChild(viewBtn);

      meta.appendChild(title); meta.appendChild(dates); meta.appendChild(funds); if(desc.textContent) meta.appendChild(desc); meta.appendChild(cta);
      item.appendChild(thumb); item.appendChild(meta);
      eventsListEl.appendChild(item);
    });

    eventsCountEl.textContent = `${listToShow.length} events`;
  }

  function buildAllEventsList(){
    const filtered = getFilteredEvents();
    const container = document.getElementById('all-events-list');
    if(!container) return;
    container.innerHTML = '';
    filtered.forEach(ev=>{
      const card = document.createElement('div'); card.className='event-card';
      const thumb = document.createElement('div'); thumb.className='event-thumb';
      thumb.innerHTML = ev.image ? `<img src="${ev.image}">` : `<div style="font-size:12px;color:var(--muted);padding:6px">No image</div>`;
      const meta = document.createElement('div'); meta.className='event-meta';
      meta.innerHTML = `<div class="event-title">${ev.title}</div>
        <div class="event-dates muted">${ev.start ? ev.start.toLocaleDateString() : 'TBA'}${ev.end ? ' — ' + ev.end.toLocaleDateString():''}</div>
        <div class="event-funds">${ev.funds.toLocaleString()} HBD</div>
        <div style="margin-top:8px"><button class="btn-ghost" data-id="${ev.id}"><i class="fa-solid fa-eye"></i> View</button></div>`;
      card.appendChild(thumb); card.appendChild(meta); container.appendChild(card);
    });
    container.querySelectorAll('button[data-id]').forEach(b=>{
      b.addEventListener('click', (e)=> openEventDrawerById(e.currentTarget.getAttribute('data-id')));
    });
  }

  // ========== RENDER ALL ==========
  function renderAll(){
    renderMiniCalendars();
    renderEventsList();
    renderBarChart();
    renderMap();
  }

  // ========== UI BINDINGS ==========
  const listModal = document.getElementById('list-modal');
  const listClose = document.getElementById('list-close');
  const listBackdrop = document.getElementById('list-backdrop');
  if(viewAllBtn){
    viewAllBtn.addEventListener('click', ()=> {
      listModal.setAttribute('aria-hidden','false');
      buildAllEventsList();
    });
  }
  if(listClose) listClose.addEventListener('click', ()=> listModal.setAttribute('aria-hidden','true'));
  if(listBackdrop) listBackdrop.addEventListener('click', ()=> listModal.setAttribute('aria-hidden','true'));

  monthsSelect && monthsSelect.addEventListener('change', ()=> renderAll());
  showPastToggle && showPastToggle.addEventListener('change', ()=> renderAll());

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      closeModal();
      chartModal.setAttribute('aria-hidden','true');
      listModal.setAttribute('aria-hidden','true');
      drawer.setAttribute('aria-hidden','true');
    }
  });

  // mobile nav toggle
  if(mobileNavToggle){
    mobileNavToggle.addEventListener('click', ()=>{
      const open = document.body.classList.toggle('nav-open');
      mobileNavToggle.setAttribute('aria-expanded', String(open));
    });
  }

  // ========== INIT ==========
  (async function init(){
    try{
      await loadSheet();
      await loadCountriesGeoJSON().catch(()=>{ /* ignore */ });
      renderAll();
    }catch(err){
      console.error('Failed to load calendar data:', err);
      document.querySelector('.app-shell').insertAdjacentHTML('afterbegin',
        `<div style="padding:12px;background:#fff3f3;border:1px solid #ffd2d2;border-radius:10px;color:#7a1b1b;margin-bottom:12px">
           Error loading sheet: ${err.message}. Please verify SHEET_ID, sheet accessibility (Anyone with the link can view) and tab name.
         </div>`);
    }
  })();

})();
