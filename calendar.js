/* calendar.js - Calendar with independent Tag searches:
   - Show Hive Posts uses General Tag (col F, index 5)
   - Community button uses Tag2 (col I, index 8)
   Both use identical logic: sanitizeForApiTag(...) -> fetchHivePosts(...)
   Other features preserved: event info (K-L-M-N), onboarding (col J), clickable event cards,
   bar click opens drawer, post-modal, dhive fallback, caching.
*/

(function(){
  // ========== CONFIG ==========
  const SHEET_ID = "1tqPtEbS5EsajO-kgEgNtK1-eqXdZS8IOLaZ0CRKBrN4";
  const TAB_CALENDAR = "calendar";
  const GEOJSON_COUNTRIES_URL = "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json";
  const HIVE_RPC = "https://api.hive.blog";
  const CACHE_TTL = 1000 * 60 * 60 * 6; // 6h
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

  const postModal = document.getElementById('post-modal');
  const postBackdrop = document.getElementById('post-backdrop');
  const postClose = document.getElementById('post-close');
  const postModalTitle = document.getElementById('post-modal-title');
  const postModalBody = document.getElementById('post-modal-body');

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
  let sheetFields = null;
  let dhiveClient = null;

  // helpers mapping chart index to event
  let lastBarSorted = [];

  // ========== HELPERS ==========
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
  function normalizeCommunityName(s){
    if(!s) return '';
    return String(s).toLowerCase().replace(/(^#+)|(^@+)/g,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function sanitizeForApiTag(s){
    if(!s) return '';
    return String(s).toLowerCase().replace(/^#+/, '').replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function fundsColor(val, min, max){
    if(min === max) return '#7a0f16';
    const ratio = clamp((val - min) / (max - min), 0, 1);
    const start = [255,200,200];
    const end = [120,10,20];
    const r = Math.round(start[0] + (end[0]-start[0]) * ratio);
    const g = Math.round(start[1] + (end[1]-start[1]) * ratio);
    const b = Math.round(start[2] + (end[2]-start[2]) * ratio);
    return `rgb(${r},${g},${b})`;
  }
  function dateISO(d){ return d.toISOString().split('T')[0]; }
  function isDateWithinEvent(dayISO, ev){
    const startStr = ev.start ? dateISO(ev.start) : null;
    const endStr = ev.end ? dateISO(ev.end) : startStr;
    if(!startStr) return false;
    return (dayISO >= startStr && dayISO <= (endStr || startStr));
  }

  // localStorage cache
  function cacheSet(key, value){ try{ localStorage.setItem(`vp_cache_${key}`, JSON.stringify({ t: Date.now(), v: value })); }catch(e){} }
  function cacheGet(key, maxAge = CACHE_TTL){
    try{
      const raw = localStorage.getItem(`vp_cache_${key}`);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !parsed.t) return null;
      if(Date.now() - parsed.t > maxAge) { localStorage.removeItem(`vp_cache_${key}`); return null; }
      return parsed.v;
    }catch(e){ return null; }
  }
  function simpleHash(s){
    let h = 2166136261 >>> 0;
    for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); }
    return (h >>> 0).toString(16);
  }

  // ========== SHEET LOADING ==========
  async function loadSheet(){
    const url = CSV_URL(TAB_CALENDAR);
    const resp = await fetch(url, { cache: "no-store" });
    if(!resp.ok) throw new Error(`CSV fetch failed: ${resp.status}`);
    const csv = await resp.text();
    const parsed = Papa.parse(csv, { header:true, skipEmptyLines:true, dynamicTyping:false });
    rawEvents = parsed.data || [];
    sheetFields = (parsed && parsed.meta && parsed.meta.fields) ? parsed.meta.fields : null;
    console.debug('sheet fields', sheetFields);
    await normalizeEvents();
  }

  // prefer indexes else fallback to headers
  function getFieldByIndexOrName(r, candidateIndexes = [], candidateKeywords = []){
    if(sheetFields && Array.isArray(sheetFields)){
      for(const idx of candidateIndexes){
        if(typeof idx === 'number' && idx >= 0 && idx < sheetFields.length){
          const header = sheetFields[idx];
          if(header && (r[header] !== undefined && r[header] !== null && String(r[header]).trim() !== '')){
            return String(r[header]).trim();
          }
        }
      }
    }
    const normalizedMap = {};
    for(const k of Object.keys(r || {})){ normalizedMap[k.replace(/\s+/g,'').toLowerCase().trim()] = r[k]; }
    for(const kw of candidateKeywords){
      for(const nk of Object.keys(normalizedMap)){
        if(nk.includes(kw) && normalizedMap[nk] !== undefined && normalizedMap[nk] !== null && String(normalizedMap[nk]).trim() !== ''){
          return String(normalizedMap[nk]).trim();
        }
      }
    }
    for(const k of ['tag','tags','event','evento','eventtag','community','communityname','comunidad','community-name','categoria','onboarding','onboard','onboarding-count','count','manual onboarding','manual onboarding count','event description','attendees','attendees/viewers','benefit','potential']){
      if(r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') return String(r[k]).trim();
    }
    return '';
  }

  // ========== COMMUNITY PARSING & RESOLUTION (kept for fallback but not used for tag searches) ==========
  function parseCommunityCell(value){
    if(!value) return { type:'raw', raw: value };
    const s = String(value).trim();
    if(/^[a-z0-9][a-z0-9-]{1,}$/.test(s.toLowerCase())) return { type:'slug', slug: s.toLowerCase(), raw: s };
    if(!/^https?:\/\//i.test(s)) return { type:'raw', raw: s };
    try{
      const u = new URL(s);
      const parts = u.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
      if(parts.length >= 2 && ['c','t','tag','trending'].includes(parts[0].toLowerCase())) return { type:'slug', slug: parts[1].toLowerCase(), raw: s };
      for(let i=0;i<parts.length-1;i++){ if(['c','t','tag','trending'].includes(parts[i].toLowerCase())) return { type:'slug', slug: parts[i+1].toLowerCase(), raw: s }; }
      if(parts.length >= 2 && /^@/.test(parts[0])) return { type:'post', author: parts[0].replace('@',''), permlink: parts[1], raw: s };
      const atIndex = parts.findIndex(p => /^@/.test(p));
      if(atIndex !== -1 && parts.length > atIndex+1) return { type:'post', author: parts[atIndex].replace('@',''), permlink: parts[atIndex+1], raw: s };
      for(let i=0;i<parts.length;i++){ if(['community','communities'].includes(parts[i].toLowerCase()) && parts[i+1]) return { type:'slug', slug: parts[i+1].toLowerCase(), raw: s }; }
      const last = parts[parts.length-1] || '';
      if(last && !/@/.test(last) && last.length > 1) return { type:'slug', slug: last.toLowerCase(), raw: s };
      return { type:'raw', raw: s };
    }catch(e){
      return { type:'raw', raw: s };
    }
  }

  async function fetchPostContent(author, permlink){
    try{
      const cacheKey = `post_${author}_${permlink}`;
      const cached = cacheGet(cacheKey);
      if(cached) return cached;
      // try dhive first
      const client = await getDhiveClient();
      if(client){
        try{
          const post = await client.database.getContent(author, permlink);
          if(post){ cacheSet(cacheKey, post); return post; }
        }catch(e){ /* fall through to RPC */ }
      }
      // fallback RPC
      const body = { jsonrpc: "2.0", method: "condenser_api.get_content", params: [author, permlink], id: 1 };
      const res = await fetch(HIVE_RPC, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if(json && json.result){ cacheSet(cacheKey, json.result); return json.result; }
    }catch(e){ console.warn('fetchPostContent error', e); }
    return null;
  }

  function extractCommunityFromPostRaw(p){
    if(!p) return '';
    try{
      const parent = (p.parent_permlink || p.category || '').toString().toLowerCase();
      if(parent) return normalizeCommunityName(parent);
      const meta = typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata) : p.json_metadata;
      if(meta){
        if(meta.community) return normalizeCommunityName(meta.community);
        if(Array.isArray(meta.tags) && meta.tags.length) return normalizeCommunityName(meta.tags[0]);
      }
    }catch(e){}
    return '';
  }

  async function resolveCommunityPermlink(cellValue){
    // kept for fallback use in special cases
    if(!cellValue) return '';
    const cacheKey = `resolve_comm_${simpleHash(String(cellValue))}`;
    const cached = cacheGet(cacheKey);
    if(cached) return cached;
    const parsed = parseCommunityCell(cellValue);
    if(parsed.type === 'slug' && parsed.slug){ const n = normalizeCommunityName(parsed.slug); cacheSet(cacheKey, n); return n; }
    if(parsed.type === 'post' && parsed.author && parsed.permlink){
      const post = await fetchPostContent(parsed.author, parsed.permlink);
      if(post){
        const resolved = extractCommunityFromPostRaw(post);
        if(resolved){ cacheSet(cacheKey, resolved); return resolved; }
      }
    }
    const normalized = normalizeCommunityName(String(cellValue));
    cacheSet(cacheKey, normalized);
    return normalized;
  }

  // ========== DHIVE CLIENT (optional) ==========
  async function getDhiveClient(){
    if(dhiveClient) return dhiveClient;
    try{
      if(window.dhive && window.dhive.Client){
        dhiveClient = new dhive.Client(["https://api.hive.blog", "https://anyx.io"]);
        return dhiveClient;
      }
    }catch(e){}
    return null;
  }

  // wrapper to fetch discussions by tag (dhive preferred, fallback RPC)
  async function fetchDiscussionsByTagRaw(tag, limit = 10){
    if(!tag) return [];
    const cacheKey = `discussions_${tag}_${limit}`;
    const cached = cacheGet(cacheKey);
    if(cached) return cached;
    try{
      const client = await getDhiveClient();
      if(client){
        try{
          // dhive's getDiscussions expects { tag, limit } when used with 'created'
          // dhive acepta máximo limit = 20; asegurar rango 1..20
const dhiveLimit = Math.max(1, Math.min(limit, 20));
const raw = await client.database.getDiscussions('created', { tag, limit: dhiveLimit });

          if(raw && Array.isArray(raw)){ cacheSet(cacheKey, raw); return raw; }
        }catch(e){
          console.warn('dhive getDiscussions failed, falling back to RPC', e);
        }
      }
      // fallback RPC
      const body = { jsonrpc: "2.0", method: "condenser_api.get_discussions_by_created", params: [{ tag: tag || '', limit }], id: 1 };
      const res = await fetch(HIVE_RPC, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if(json && json.result && Array.isArray(json.result)){ cacheSet(cacheKey, json.result); return json.result; }
    }catch(e){
      console.warn('fetchDiscussionsByTagRaw error', e);
    }
    return [];
  }

  // ========== NORMALIZE EVENTS ==========
  async function normalizeEvents(){
    const mapped = rawEvents.map(async (r, idx) => {
      const normalized = {};
      for(const k of Object.keys(r || {})){ normalized[k.replace(/\s+/g,'').toLowerCase().trim()] = r[k]; }
      const rawStart = getFieldByIndexOrName(r, [], ['startdate','start','fecha','date']) || normalized['startdate'] || normalized['start'] || '';
      const rawEnd   = getFieldByIndexOrName(r, [], ['enddate','end','fechaend','enddate']) || normalized['enddate'] || normalized['end'] || '';
      const title    = getFieldByIndexOrName(r, [], ['event','evento','title','nombre']) || r['Evento'] || r['evento'] || r['Event'] || normalized['evento'] || normalized['event'] || 'Untitled Event';
      const fundsRaw = getFieldByIndexOrName(r, [], ['funds','hbd','amount']) || r['Funds'] || r['funds'] || normalized['funds'] || '';
      const image    = getFieldByIndexOrName(r, [], ['image','imagelink','imagen']) || r['Image link'] || r['image link'] || normalized['imagelink'] || normalized['image'] || '';
      const description = getFieldByIndexOrName(r, [], ['description','desc','descripcion']) || r['description'] || normalized['description'] || '';

      // Note: We explicitly read BOTH tags:
      // - General Tag (col F, index 5) -> used by Show Hive Posts
      // - Tag2 (col I, index 8) -> used by Community button (independent)
      const rawTag = getFieldByIndexOrName(r, [5], ['tag','tags','eventtag','hashtag','general tag','general_tag']) || normalized['tag'] || normalized['tags'] || '';
      const rawTag2 = getFieldByIndexOrName(r, [8], ['tag2','tag 2','tag 2','tag-2','tag2','tag 2','tag 2','tag2']) || normalized['tag2'] || '';

      const start = parseDateString(rawStart);
      const end = parseDateString(rawEnd);
      const funds = parseFunds(fundsRaw);
      const country = normalizeName(getFieldByIndexOrName(r, [], ['country','pais','país']) || normalized['country'] || '');

      // Normalize tags (both use same sanitizer so searches are identical)
      const tagNormalized = sanitizeForApiTag(rawTag || '');
      const tag2Normalized = sanitizeForApiTag(rawTag2 || '');

      // onboarding count (manual) - column J (index 9)
      const onboardingRaw = getFieldByIndexOrName(r, [9], ['onboarding','onboard','onboardingcount','checkins']) || '';
      const onboardingCount = onboardingRaw ? (Number(String(onboardingRaw).replace(/[^0-9]/g,'')) || 0) : 0;

      // NEW: Event Information columns (K-L-M-N -> indices 10..13)
      const eventDescription = getFieldByIndexOrName(r, [10], ['event description','description','descripcion','detail','details']) || '';
      const attendees = getFieldByIndexOrName(r, [11], ['attendees','viewers','attendees/viewers','attendees viewers','asistentes']) || '';
      const benefit = getFieldByIndexOrName(r, [12], ['benefit','beneficios','benefit description']) || '';
      const potential = getFieldByIndexOrName(r, [13], ['potential','potencial','potential impact']) || '';

      return {
        id: `evt-${idx}`,
        title: String(title || '').trim(),
        start, end, funds,
        image: String(image || '').trim(),
        description: String(description || '').trim(),
        country,
        tag: tagNormalized,   // General Tag (col F) - used by Show Hive Posts
        tag2: tag2Normalized, // Tag2 (col I) - used by Community button (independent)
        onboardingCount,
        eventDescription: String(eventDescription || '').trim(),
        attendees: String(attendees || '').trim(),
        benefit: String(benefit || '').trim(),
        potential: String(potential || '').trim(),
        raw: r
      };
    });

    events = await Promise.all(mapped);
    events.sort((a,b)=> {
      if(!a.start) return 1;
      if(!b.start) return -1;
      return a.start - b.start;
    });
    console.debug('Events normalized:', events.length);
  }

  // ========== MINI CALENDARS & EXPANDED (no cross-month painting) ==========
  function renderMiniCalendars(){
    miniCalendars.forEach(c => c.destroy && c.destroy());
    miniCalendars = [];
    compactContainer.innerHTML = '';
    const months = parseInt(monthsSelect.value || '3', 10);
    const filtered = getFilteredEvents();
    const baseDate = new Date();
    for(let i=0;i<months;i++){
      const wrapper = document.createElement('div'); wrapper.className = 'mini-cal'; wrapper.id = `mini-cal-${i}`; compactContainer.appendChild(wrapper);
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, 1);
      const fcEvents = filtered.map(ev => ({
        id: ev.id, title: ev.title, start: ev.start ? ev.start.toISOString() : null, end: ev.end ? ev.end.toISOString() : null, allDay: true,
        extendedProps: { funds: ev.funds, description: ev.description, image: ev.image, country: ev.country, tag: ev.tag, tag2: ev.tag2 }
      }));
      const calendar = new FullCalendar.Calendar(wrapper, {
        initialView: 'dayGridMonth', initialDate: d, locale: 'en', height: 320,
        headerToolbar: { left: '', center: 'title', right: '' }, events: fcEvents,
        eventClick: function(info){ info.jsEvent.preventDefault(); openEventDrawer(info.event); },
        dayMaxEventRows: true, navLinks:false,
        dayCellDidMount: function(arg){
          const viewMonth = arg.view.currentStart.getMonth();
          const viewYear  = arg.view.currentStart.getFullYear();
          if (arg.date.getMonth() !== viewMonth || arg.date.getFullYear() !== viewYear) return;
          const dayStr = dateISO(arg.date);
          const hasEvent = filtered.some(ev => isDateWithinEvent(dayStr, ev));
          if(hasEvent){
            arg.el.classList.add('event-day');
            arg.el.style.cursor = 'pointer';
            arg.el.onclick = () => { const evs = filtered.filter(ev => isDateWithinEvent(dayStr, ev)); openDayDrawer(evs, dayStr); };
          }
        }
      });
      calendar.render();
      miniCalendars.push(calendar);
    }
  }
  function renderExpandedCalendar(){
    if(expandedCalendar){ expandedCalendar.destroy(); expandedCalendar = null; expandedCalendarEl.innerHTML = ''; }
    const filtered = getFilteredEvents();
    const fcEvents = filtered.map(ev => ({ id: ev.id, title: ev.title, start: ev.start ? ev.start.toISOString() : null, end: ev.end ? ev.end.toISOString() : null, allDay: true, extendedProps:{ funds: ev.funds, description: ev.description, image: ev.image, country: ev.country, tag: ev.tag, tag2: ev.tag2 } }));
    expandedCalendar = new FullCalendar.Calendar(expandedCalendarEl, {
      initialView: 'dayGridMonth', height: 680, headerToolbar:{ left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }, locale:'en',
      events: fcEvents, eventClick: function(info){ info.jsEvent.preventDefault(); openEventDrawer(info.event); },
      dayCellDidMount: function(arg){
        const viewMonth = arg.view.currentStart.getMonth();
        const viewYear  = arg.view.currentStart.getFullYear();
        if (arg.date.getMonth() !== viewMonth || arg.date.getFullYear() !== viewYear) return;
        const dayStr = dateISO(arg.date);
        const hasEvent = filtered.some(ev => isDateWithinEvent(dayStr, ev));
        if(hasEvent){ arg.el.classList.add('event-day'); arg.el.onclick = () => { const evs = filtered.filter(ev => isDateWithinEvent(dayStr, ev)); openDayDrawer(evs, dayStr); }; }
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

  // ========== POST MODAL (show full post HTML) ==========
  function sanitizeHtml(html){
    if(!html) return '';
    html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/ on[a-zA-Z]+=\s*"(?:[^"]*)"/gi, '');
    html = html.replace(/ on[a-zA-Z]+=\s*'(?:[^']*)'/gi, '');
    html = html.replace(/ on[a-zA-Z]+=\s*[^\s>]+/gi, '');
    return html;
  }

  function showPostModal(post){
    if(!post) return;
    postModalTitle.textContent = post.title || `${post.author}/${post.permlink}`;
    let bodyHtml = post.body || '';
    try{
      const meta = typeof post.json_metadata === 'string' ? JSON.parse(post.json_metadata) : post.json_metadata;
      if(!bodyHtml && meta && meta.description) bodyHtml = meta.description;
    }catch(e){}
    bodyHtml = sanitizeHtml(bodyHtml);
    let imgUrl = '';
    try{ const meta = typeof post.json_metadata === 'string' ? JSON.parse(post.json_metadata) : post.json_metadata; if(meta && meta.image && meta.image.length) imgUrl = meta.image[0]; }catch(e){}
    const header = `<div style="margin-bottom:12px;display:flex;gap:12px;align-items:center"><div style="flex:0 0 80px">${imgUrl?`<img src="${imgUrl}" style="width:80px;height:60px;object-fit:cover;border-radius:8px" onerror="this.style.display='none'">`:''}</div><div><strong style="font-size:18px">${post.title || ''}</strong><div class="muted" style="margin-top:6px">by ${post.author} · ${post.created ? (new Date(post.created)).toLocaleDateString() : ''}</div></div></div>`;
    postModalBody.innerHTML = header + `<div style="line-height:1.6;font-size:15px;color:var(--text-secondary)">${bodyHtml}</div>`;
    postModal.setAttribute('aria-hidden','false');
  }
  function closePostModal(){ postModal.setAttribute('aria-hidden','true'); postModalBody.innerHTML = ''; }
  postClose && postClose.addEventListener('click', closePostModal);
  postBackdrop && postBackdrop.addEventListener('click', closePostModal);

  // ========== DRAWER & HIVE POSTS ==========
  function openEventDrawer(fcEvent){
    const ev = {
      id: fcEvent.id,
      title: fcEvent.title,
      funds: fcEvent.extendedProps?.funds ?? 0,
      description: fcEvent.extendedProps?.description ?? '',
      image: fcEvent.extendedProps?.image ?? '',
      country: fcEvent.extendedProps?.country ?? '',
      tag: fcEvent.extendedProps?.tag ?? '',
      tag2: fcEvent.extendedProps?.tag2 ?? '',
      start: fcEvent.start ?? null,
      end: fcEvent.end ?? null
    };
    const fromList = events.find(e => e.id === ev.id);
    if(fromList){
      // ensure we have the normalized values from sheet
      ev.tag = fromList.tag || '';
      ev.tag2 = fromList.tag2 || '';
      ev.onboardingCount = fromList.onboardingCount || 0;
      ev.eventDescription = fromList.eventDescription || '';
      ev.attendees = fromList.attendees || '';
      ev.benefit = fromList.benefit || '';
      ev.potential = fromList.potential || '';
      ev.raw = fromList.raw;
    }
    populateDrawer(ev);
  }
  function openEventDrawerById(id){
    const ev = events.find(e => e.id === id);
    if(!ev) return;
    populateDrawer(ev);
  }
  function openDayDrawer(evs, dayISO){
    drawer.setAttribute('aria-hidden','false');
    const contentParts = evs.map(ev => `<div style="margin-bottom:12px;padding:10px;border-radius:10px;background:linear-gradient(180deg,#fff,var(--hive-light-gray));">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-weight:800">${ev.title}</div>
          <div style="font-weight:800;color:var(--hive-red)">${ev.funds.toLocaleString()} HBD</div>
        </div>
        <div style="margin-top:8px">${ ev.description ? (ev.description.length>160?ev.description.slice(0,160)+'…':ev.description) : '<span class="muted">No description</span>' }</div>
        <div style="margin-top:8px"><button class="btn-ghost" data-id="${ev.id}">View</button></div>
      </div>`).join('');
    drawerContent.innerHTML = `<h3 style="margin-top:0">${(new Date(dayISO)).toLocaleDateString()}</h3>${contentParts}`;
    hivePostsContainer.innerHTML = '';
    drawerContent.querySelectorAll('button[data-id]').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); openEventDrawerById(e.currentTarget.getAttribute('data-id')); } ); });
  }

  // check if post contains onboarding phrase in title
  function postTitleHasOnboardPhrase(p){
    try{
      const title = (p.title || '').toString().toLowerCase();
      return title.includes('i was onboarded to hive by');
    }catch(e){ return false; }
  }

  // Match post to community using same sanitization logic as tags (kept for onboarding filter)
  function postBelongsToCommunityRaw(p, communityName){
    if(!communityName) return false;
    const c = sanitizeForApiTag(communityName || '').toString().toLowerCase();
    try{
      const parent = (p.parent_permlink || p.category || '').toString().toLowerCase();
      if(parent && sanitizeForApiTag(parent) === c) return true;
      if(p.community && sanitizeForApiTag(String(p.community || '')) === c) return true;
      const meta = typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata) : p.json_metadata;
      if(meta){
        if(meta.community && sanitizeForApiTag(String(meta.community || '')) === c) return true;
        if(Array.isArray(meta.tags)){
          const tags = meta.tags.map(t => sanitizeForApiTag(String(t || '')).toLowerCase());
          if(tags.includes(c)) return true;
        }
      }
    }catch(e){}
    return false;
  }

  // ---------- FETCH ONBOARDING POSTS (community tag + title phrase) ----------
  async function fetchHiveOnboardingPosts(eventTag, year, communityPermlink, limit = 20){
    const communityNormalized = sanitizeForApiTag(communityPermlink || '');
    const requestedYear = Number(year) || new Date().getFullYear();
    try{
      const collected = [];
      const pushUnique = (p) => { if(!collected.some(cp => cp.author===p.author && cp.permlink===p.permlink)) collected.push(p); };

      const commCandidates = new Set();
      if(communityNormalized){
        commCandidates.add(communityNormalized);
        const stripped = communityNormalized.replace(/^hive-/i, '').replace(/^-+|-+$/g,'');
        if(stripped) commCandidates.add(stripped);
      }
      if(commCandidates.size === 0 && eventTag){
        const et = sanitizeForApiTag(eventTag);
        if(et) commCandidates.add(et);
      }
      if(commCandidates.size === 0){
        console.warn('No community candidate provided for onboarding search.');
        return [];
      }

      const candidateArray = Array.from(commCandidates);
      for(const comm of candidateArray){
        if(!comm) continue;
        try{
          const raw = await fetchDiscussionsByTagRaw(comm, Math.min(limit, 20));
          raw.forEach(pushUnique);
        }catch(e){
          console.warn('Error fetching discussions for community candidate', comm, e);
        }
      }

      const filtered = collected.filter(p => {
        try{
          const createdYear = new Date(p.created).getFullYear();
          if(createdYear !== requestedYear) return false;
          if(!postTitleHasOnboardPhrase(p)) return false;
          let belongs = false;
          for(const comm of candidateArray){
            if(postBelongsToCommunityRaw(p, comm)){ belongs = true; break; }
            try{
              const meta = typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata) : p.json_metadata;
              const tags = (meta && Array.isArray(meta.tags)) ? meta.tags.map(t=>sanitizeForApiTag(String(t||'')).toLowerCase()) : [];
              if(tags.includes(comm)){ belongs = true; break; }
            }catch(e){}
          }
          return belongs;
        }catch(e){
          return false;
        }
      }).map(p => {
        let img = '';
        try{ const meta = typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata) : p.json_metadata; if(meta && meta.image && meta.image.length) img = meta.image[0]; }catch(e){}
        return { title: p.title, image: img, author: p.author, permlink: p.permlink, link: `https://peakd.com/@${p.author}/${p.permlink}`, created: p.created, raw: p };
      });

      const uniq = [];
      const seen = new Set();
      for(const it of filtered){
        const k = `${it.author}::${it.permlink}`;
        if(!seen.has(k)){ seen.add(k); uniq.push(it); }
      }
      return uniq;
    }catch(err){
      console.warn('fetchHiveOnboardingPosts (new logic) error', err);
      return [];
    }
  }

  // convenience wrapper for UI to show posts by tag
  async function fetchHivePosts(tag, limit = 6){
    if(!tag) return [];
    try{
      const raw = await fetchDiscussionsByTagRaw(tag, limit);
      return raw.map(p => {
        let img = '';
        try{ const meta = typeof p.json_metadata === 'string' ? JSON.parse(p.json_metadata) : p.json_metadata; if(meta && meta.image && meta.image.length) img = meta.image[0]; }catch(e){}
        return { title: p.title, image: img, author: p.author, permlink: p.permlink, link: `https://peakd.com/@${p.author}/${p.permlink}`, created: p.created, raw: p };
      });
    }catch(e){
      console.warn('fetchHivePosts fallback', e);
      return [];
    }
  }

  function renderHivePosts(posts){
    if(!Array.isArray(posts) || posts.length === 0){ hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">No posts found.</div>`; return; }
    hivePostsContainer.innerHTML = '';
    posts.forEach(p => {
      const el = document.createElement('div'); el.className = 'hive-post';
      const link = p.link || `https://peakd.com/@${p.author}/${p.permlink}`;
      el.innerHTML = `<img src="${p.image || 'https://picsum.photos/120/90?random=9'}" alt="${p.title}"><div style="flex:1"><a href="${link}" target="_blank" rel="noopener noreferrer" style="font-weight:700;color:var(--hive-black)">${p.title}</a><div class="muted" style="margin-top:6px">by ${p.author} · ${p.created ? (new Date(p.created)).toLocaleDateString() : ''}</div></div>`;
      el.addEventListener('click', async (e)=>{
        if(e.target && e.target.tagName && e.target.tagName.toLowerCase() === 'a') return;
        e.stopPropagation();
        try{
          const postRaw = await fetchPostContent(p.author, p.permlink);
          if(postRaw) showPostModal(postRaw);
          else window.open(link, '_blank');
        }catch(err){
          window.open(link, '_blank');
        }
      });
      hivePostsContainer.appendChild(el);
    });
  }

  // ========== CHARTS / MAP ==========
  function renderBarChart(){
    const filtered = getFilteredEvents();
    const sorted = [...filtered].sort((a,b)=> b.funds - a.funds).slice(0,12);
    lastBarSorted = sorted; // store mapping for clicks
    const labels = sorted.map(s=> s.title);
    const data = sorted.map(s=> s.funds);
    const ctx = document.getElementById('barChart').getContext('2d');
    if(barChart) { try{ barChart.destroy(); }catch(e){} }
    barChart = new Chart(ctx, {
      type:'bar',
      data:{
        labels,
        datasets:[{ label:'Funds (HBD)', data, backgroundColor: data.map(v=> '#e31337'), borderRadius:8 }]
      },
      options:{
        indexAxis: 'y',
        responsive:true,
        plugins:{
          legend:{ display:false },
          tooltip:{ callbacks:{ label: (ctx) => `${ctx.parsed.x.toLocaleString()} HBD` } }
        },
        scales:{ x:{ beginAtZero:true, ticks:{ callback: v => Number(v).toLocaleString() } }, y:{ ticks:{ autoSkip:false } } },
        onClick: function(evt, elements) {
          if(!elements || !elements.length) return;
          const el = elements[0];
          const idx = el.index;
          const selected = lastBarSorted[idx];
          if(selected && selected.id) {
            openEventDrawerById(selected.id);
            drawer.setAttribute('aria-hidden','false');
          }
        }
      }
    });
  }

  function openChartDetails(){
    chartModal.setAttribute('aria-hidden','false');
    chartModalTitle.textContent = 'Funds by Event (Top)';
    chartModalBody.innerHTML = `<canvas id="pieChartModal" width="520" height="420"></canvas><div id="chart-summary" style="display:none"></div>`;
    const filtered = getFilteredEvents();
    const sorted = [...filtered].sort((a,b)=> b.funds - a.funds).slice(0,10);
    const labels = sorted.map(s=> s.title);
    const data = sorted.map(s=> s.funds);
    const colors = data.map((v,i)=> fundsColor(v, Math.min(...data,0), Math.max(...data,1)));
    const ctx = document.getElementById('pieChartModal').getContext('2d');
    if(pieChartModal) pieChartModal.destroy();
    pieChartModal = new Chart(ctx, { type:'pie', data:{ labels, datasets:[{ data, backgroundColor: colors }]}, options:{ responsive:true, plugins:{ legend:{ position:'right' } } } });
    const summary = document.getElementById('chart-summary');
    if(summary){
      const total = data.reduce((a,b)=>a+b,0);
      summary.innerHTML = `<div style="padding:12px;background:var(--bg-white);border-radius:12px;box-shadow:var(--shadow)"><h4>Summary</h4><p class="muted">Total funds (top): <strong style="color:var(--hive-red)">${total.toLocaleString(undefined,{maximumFractionDigits:2})} HBD</strong></p></div>`;
      summary.style.display = 'block';
    }
  }
  chartDetailsBtn && chartDetailsBtn.addEventListener('click', openChartDetails);
  chartClose && chartClose.addEventListener('click', () => chartModal.setAttribute('aria-hidden','true'));
  chartBackdrop && chartBackdrop.addEventListener('click', () => chartModal.setAttribute('aria-hidden','true'));

  async function loadCountriesGeoJSON(){ if(countriesGeoJSON) return countriesGeoJSON; try{ const r = await fetch(GEOJSON_COUNTRIES_URL); if(!r.ok) throw new Error('geojson fetch failed'); const json = await r.json(); countriesGeoJSON = json; return countriesGeoJSON; }catch(e){ console.warn('Could not load world geojson:', e); countriesGeoJSON = null; return null; } }

  async function renderMap(){
    if(mapInstance){ mapInstance.remove(); mapInstance = null; }
    const el = document.getElementById('map'); el.innerHTML = '';
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
    const geo = await loadCountriesGeoJSON();
    if(geo){
      if(countryLayer) { countryLayer.remove(); countryLayer = null; }
      countryLayer = L.geoJSON(geo, {
        style: function(feature){
          const name = normalizeName(feature.properties.name || feature.properties.NAME || '');
          const agg = countryAgg[name];
          if(agg){ return { fillColor: fundsColor(agg.funds, minV, maxV), weight:1, color:'#900', fillOpacity:0.85 }; }
          else { return { fillColor: '#e9edf1', weight:0.2, color:'#cfd8df', fillOpacity:0.06 }; }
        },
        onEachFeature: function(feature, layer){
          const name = normalizeName(feature.properties.name || feature.properties.NAME || '');
          const agg = countryAgg[name];
          if(agg){ layer.bindPopup(`<strong>${feature.properties.name}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`); }
        }
      }).addTo(mapInstance);
      mapNoteEl.textContent = 'World view: countries shaded by funds (darker red = more funds).';
    } else {
      mapNoteEl.textContent = 'World view (fallback): showing markers for countries with coordinates. Countries without coordinates will not appear on map.';
      const COUNTRY_COORDS = { poland:[51.9194,19.1451], bolivia:[-16.4897,-68.1193], venezuela:[6.4238,-66.5897], paraguay:[-23.4425,-58.4438], colombia:[4.5709,-74.2973], cuba:[21.5218,-77.7812], germany:[51.1657,10.4515], "united states":[37.0902,-95.7129], spain:[40.4637,-3.7492], france:[46.2276,2.2137], italy:[41.8719,12.5674], uk:[55.3781,-3.4360], unitedkingdom:[55.3781,-3.4360] };
      Object.keys(countryAgg).forEach(k => {
        const agg = countryAgg[k]; const coords = COUNTRY_COORDS[k] || null;
        if(coords){ const radius = 6 + ((agg.funds/(maxV||1)) * 30); L.circleMarker(coords, { radius, color: '#9b0f22', fillColor:'#9b0f22', fillOpacity:0.85, weight:1 }).bindPopup(`<strong>${capitalize(k)}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`).addTo(mapInstance); }
      });
    }
  }

  mapExpandBtn && mapExpandBtn.addEventListener('click', () => {
    chartModalTitle.textContent = 'Event Map (world)';
    chartModalBody.innerHTML = `<div id="map-modal" style="height:520px;border-radius:12px;overflow:hidden"></div>`;
    chartModal.setAttribute('aria-hidden','false');
    setTimeout(async () => {
      const el = document.getElementById('map-modal'); if(!el) return; el.innerHTML = '';
      const mm = L.map('map-modal', { scrollWheelZoom:false, attributionControl:false }).setView([20,0],2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:5 }).addTo(mm);
      const filtered = getFilteredEvents(); const countryAgg = {};
      filtered.forEach(e => { const c = e.country || 'unknown'; countryAgg[c] = countryAgg[c] || { funds:0, events:[] }; countryAgg[c].funds += e.funds; countryAgg[c].events.push(e); });
      const values = Object.values(countryAgg).map(x=>x.funds); const minV = Math.min(...values,0); const maxV = Math.max(...values,1);
      const geo = await loadCountriesGeoJSON();
      if(geo){ L.geoJSON(geo, { style: function(feature){ const name = normalizeName(feature.properties.name || feature.properties.NAME || ''); const agg = countryAgg[name]; if(agg) return { fillColor: fundsColor(agg.funds, minV, maxV), weight:1, color:'#900', fillOpacity:0.85 }; return { fillColor: '#e9edf1', weight:0.2, fillOpacity:0.04 }; }, onEachFeature: function(feature, layer){ const name = normalizeName(feature.properties.name || feature.properties.NAME || ''); const agg = countryAgg[name]; if(agg) layer.bindPopup(`<strong>${feature.properties.name}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`); } }).addTo(mm); }
      else { Object.keys(countryAgg).forEach(k => { const agg = countryAgg[k]; const coords = null; if(coords){ const radius = 6 + ((agg.funds/(maxV||1)) * 30); L.circleMarker(coords, { radius, color: '#9b0f22', fillColor:'#9b0f22', fillOpacity:0.85, weight:1 }).bindPopup(`<strong>${capitalize(k)}</strong><br/>Funds: ${agg.funds.toLocaleString()} HBD<br/>Events: ${agg.events.length}`).addTo(mm); } }); }
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
    const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming = filtered.filter(ev => (ev.end ?? ev.start) >= startOfToday);
    const past = filtered.filter(ev => (ev.end ?? ev.start) < startOfToday);
    eventsListEl.innerHTML = '';
    const listToShow = upcoming.concat(past);
    listToShow.forEach(ev => {
      const item = document.createElement('div'); item.className = 'event-card';
      item.setAttribute('role','button');
      item.setAttribute('tabindex','0');
      // clicking entire card opens drawer (user requirement)
      item.addEventListener('click', ()=> openEventDrawerById(ev.id));
      item.addEventListener('keydown', (k)=> { if(k.key === 'Enter' || k.key === ' ') { openEventDrawerById(ev.id); k.preventDefault(); } });

      if((ev.end ?? ev.start) < startOfToday) item.classList.add('completed');
      const thumb = document.createElement('div'); thumb.className = 'event-thumb';
      if(ev.image){ const img = document.createElement('img'); img.src = ev.image; img.alt = ev.title; thumb.appendChild(img); } else thumb.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:6px">No image</div>`;
      const meta = document.createElement('div'); meta.className = 'event-meta';
      const title = document.createElement('div'); title.className = 'event-title'; title.textContent = ev.title + (((ev.end ?? ev.start) < startOfToday) ? ' · Completed' : '');
      const dates = document.createElement('div'); dates.className='event-dates muted';
      const startFmt = ev.start ? ev.start.toLocaleDateString() : 'TBA'; const endFmt = ev.end ? ev.end.toLocaleDateString() : '';
      dates.textContent = endFmt ? `${startFmt} — ${endFmt}` : startFmt;
      const funds = document.createElement('div'); funds.className='event-funds'; funds.textContent = `${ev.funds.toLocaleString()} HBD`;
      const desc = document.createElement('div'); desc.className='muted'; desc.style.marginTop='6px'; desc.textContent = ev.description ? (ev.description.length>120?ev.description.slice(0,120)+'…':ev.description) : '';
      const cta = document.createElement('div'); cta.className='event-cta';
      const viewBtn = document.createElement('button'); viewBtn.className='btn-ghost'; viewBtn.innerHTML=`<i class="fa-solid fa-eye"></i> View`;
      viewBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openEventDrawerById(ev.id); });
      cta.appendChild(viewBtn);
      meta.appendChild(title); meta.appendChild(dates); meta.appendChild(funds); if(desc.textContent) meta.appendChild(desc); meta.appendChild(cta);
      item.appendChild(thumb); item.appendChild(meta); eventsListEl.appendChild(item);
    });
    eventsCountEl.textContent = `${listToShow.length} events`;
  }

  function buildAllEventsList(){
    const filtered = getFilteredEvents();
    const container = document.getElementById('all-events-list'); if(!container) return; container.innerHTML = '';
    filtered.forEach(ev=>{
      const card = document.createElement('div'); card.className='event-card'; card.setAttribute('role','button');
      card.addEventListener('click', ()=> openEventDrawerById(ev.id));
      const thumb = document.createElement('div'); thumb.className='event-thumb';
      thumb.innerHTML = ev.image ? `<img src="${ev.image}">` : `<div style="font-size:12px;color:var(--muted);padding:6px">No image</div>`;
      const meta = document.createElement('div'); meta.className='event-meta';
      meta.innerHTML = `<div class="event-title">${ev.title}</div>
        <div class="event-dates muted">${ev.start ? ev.start.toLocaleDateString() : 'TBA'}${ev.end ? ' — ' + ev.end.toLocaleDateString():''}</div>
        <div class="event-funds">${ev.funds.toLocaleString()} HBD</div>
        <div style="margin-top:8px"><button class="btn-ghost" data-id="${ev.id}"><i class="fa-solid fa-eye"></i> View</button></div>`;
      card.appendChild(thumb); card.appendChild(meta); container.appendChild(card);
    });
    container.querySelectorAll('button[data-id]').forEach(b=>{ b.addEventListener('click', (e) => { e.stopPropagation(); openEventDrawerById(e.currentTarget.getAttribute('data-id')); }); });
  }

  // ========== POPULATE DRAWER + INTEGRATE INDEPENDENT TAG SEARCHES ==========
  async function populateDrawer(ev){
    drawer.setAttribute('aria-hidden','false');
    let imageToShow = ev.image || '';
    if(!imageToShow){
      try{ const posts = await fetchHivePosts(ev.tag || sanitizeForApiTag(ev.title), 1); if(posts && posts.length && posts[0].image) imageToShow = posts[0].image; }catch(e){}
    }
    const startFmt = ev.start ? (new Date(ev.start)).toLocaleDateString() : 'TBA';
    const endFmt = ev.end ? (new Date(ev.end)).toLocaleDateString() : '';
    const onboardingCount = (ev.onboardingCount || 0);
    const checkinLink = `https://checkinwith.xyz/#/reports`;

    // Drawer HTML:
    drawerContent.innerHTML = `
      ${ imageToShow ? `<img src="${imageToShow}" alt="${ev.title}" />` : '' }
      <h3 style="margin:8px 0 6px">${ev.title}</h3>
      <div style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">
        ${ startFmt } ${ endFmt ? ' — ' + endFmt : '' } ${ ev.country ? ' · ' + capitalize(ev.country) : '' }
      </div>
      <div style="font-weight:800;color:var(--hive-red);margin-bottom:10px">
        ${ ev.funds.toLocaleString(undefined,{maximumFractionDigits:2}) } HBD
      </div>

      <!-- descripción: tono más claro (restaurado) -->
      <div style="color:var(--muted);font-size:14px;line-height:1.45">
        ${ ev.description || '<span class="muted">No description provided.</span>' }
      </div>

      <div style="margin-top:12px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button class="btn-primary" id="drawer-load-posts">Show Hive Posts (#General Tag)</button>
        <button class="btn-primary" id="drawer-community" title="Show posts using Tag2 (col I)">Community</button>
        <button class="event-info-btn" id="drawer-event-info" title="Event Information (K-L-M-N)">Event Information</button>
      </div>

      <div id="onboarding-count" style="margin-top:8px"></div>

      <div id="event-info-panel-container" style="margin-top:12px;display:none"></div>
    `;
    hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">Hive posts will appear here...</div>`;
    const loadBtn = document.getElementById('drawer-load-posts');
    const communityBtn = document.getElementById('drawer-community');
    const eventInfoBtn = document.getElementById('drawer-event-info');
    const infoContainer = document.getElementById('event-info-panel-container');
    const onboardCountEl = document.getElementById('onboarding-count');

    // show manual onboarding count (linked to checkinwith)
    (()=>{
      try{
        const pillHtml = `<div class="onboarding-pill"><a href="${checkinLink}" target="_blank" rel="noopener noreferrer">Onboarding: <strong>${onboardingCount}</strong></a></div>`;
        onboardCountEl.innerHTML = pillHtml;
      }catch(err){
        onboardCountEl.innerHTML = `<div class="muted">No onboarding count</div>`;
      }
    })();

    // load hive posts by General Tag (col F)
    if(loadBtn) loadBtn.onclick = async (e) => {
      e.stopPropagation();
      const eventTag = ev.tag || sanitizeForApiTag(ev.title || '');
      if(!eventTag){
        hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">No General Tag provided for this event.</div>`;
        return;
      }
      console.debug('Show Hive Posts -> searching tag:', eventTag);
      hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">Loading posts for #${eventTag}…</div>`;
      const posts = await fetchHivePosts(eventTag, 20);
      renderHivePosts(posts);
    };

    // COMMUNITY button: performs the SAME tag-based fetch but uses Tag2 (col I) INDEPENDENTLY
    // COMMUNITY button: performs the SAME tag-based fetch but uses Tag2 (col I) INDEPENDENTLY
if(communityBtn) communityBtn.onclick = async (e) => {
  e.stopPropagation();
  const rawTag2 = ev.tag2 || '';
  if(!rawTag2){
    hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">No Tag2 provided for this event (Tag2 is column I).</div>`;
    return;
  }

  // Normalize once
  const t0 = sanitizeForApiTag(rawTag2);
  // Candidate variants to try (most likely to work)
  const variants = [];
  if(t0) variants.push(t0);
  // stripped hive- (e.g. "hive-108943" -> "108943" or "hive-abc" -> "abc")
  const stripped = t0.replace(/^hive-/i, '').replace(/^-+|-+$/g,'');
  if(stripped && !variants.includes(stripped)) variants.push(stripped);
  // prefixed variant if not present
  const withHive = stripped ? `hive-${stripped}` : null;
  if(withHive && !variants.includes(withHive)) variants.push(withHive);

  // Try each variant in order (bypass local cache by using a fresh fetch wrapper)
  console.debug('Community (Tag2) searching variants for:', rawTag2, '->', variants);
  hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">Searching Tag2 variants for ${rawTag2}…</div>`;

  let foundPosts = [];
  for(const candidate of variants){
    try{
      console.debug('Community try candidate:', candidate);
      // Force fresh RPC by temporarily bypassing cache: call fetchDiscussionsByTagRaw but clear cached item for this tag
      try{ localStorage.removeItem(`vp_cache_discussions_${candidate}_50`); }catch(err){}
      const posts = await fetchHivePosts(candidate, 50);
      if(posts && posts.length){
        foundPosts = posts;
        console.debug('Community found posts for candidate:', candidate, posts.length);
        break;
      } else {
        console.debug('No posts for candidate:', candidate);
      }
    }catch(err){
      console.warn('Error fetching for candidate', candidate, err);
    }
  }

  if(!foundPosts || foundPosts.length === 0){
    hivePostsContainer.innerHTML = `<div class="muted" style="margin-top:12px">No posts found for ${rawTag2} (tried variants: ${variants.join(', ')}).</div>`;
  } else {
    renderHivePosts(foundPosts);
  }
};


    // Event Information toggle
    if(eventInfoBtn){
      eventInfoBtn.onclick = (e) => {
        e.stopPropagation();
        if(infoContainer.style.display === 'none' || !infoContainer.style.display){
          const edesc = ev.eventDescription || '';
          const att = ev.attendees || '';
          const ben = ev.benefit || '';
          const pot = ev.potential || '';
          if(!edesc && !att && !ben && !pot){
            infoContainer.innerHTML = `<div class="event-info-panel"><div class="muted">No additional event information available.</div></div>`;
            infoContainer.style.display = 'block';
            return;
          }
          const parts = [];
          if(edesc) parts.push(`<div class="event-info-row"><h5>Event Description</h5><p>${edesc}</p></div>`);
          if(att) parts.push(`<div class="event-info-row"><h5>Attendees / Viewers</h5><p>${att}</p></div>`);
          if(ben) parts.push(`<div class="event-info-row"><h5>Benefit</h5><p>${ben}</p></div>`);
          if(pot) parts.push(`<div class="event-info-row"><h5>Potential</h5><p>${pot}</p></div>`);
          infoContainer.innerHTML = `<div class="event-info-panel">${parts.join('')}</div>`;
          infoContainer.style.display = 'block';
        } else {
          infoContainer.style.display = 'none';
        }
      };
    }
  }
  drawerClose && drawerClose.addEventListener('click', ()=> drawer.setAttribute('aria-hidden','true'));

  // ========== UI BINDINGS ==========
  const listModal = document.getElementById('list-modal');
  const listClose = document.getElementById('list-close');
  const listBackdrop = document.getElementById('list-backdrop');
  if(viewAllBtn){
    viewAllBtn.addEventListener('click', ()=> { listModal.setAttribute('aria-hidden','false'); buildAllEventsList(); });
  }
  if(listClose) listClose.addEventListener('click', ()=> listModal.setAttribute('aria-hidden','true'));
  if(listBackdrop) listBackdrop.addEventListener('click', ()=> listModal.setAttribute('aria-hidden','true'));
  monthsSelect && monthsSelect.addEventListener('change', ()=> renderAll());
  showPastToggle && showPastToggle.addEventListener('change', ()=> renderAll());
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape'){ closeModal(); chartModal.setAttribute('aria-hidden','true'); listModal.setAttribute('aria-hidden','true'); drawer.setAttribute('aria-hidden','true'); closePostModal(); } });
  if(mobileNavToggle){ mobileNavToggle.addEventListener('click', ()=>{ const open = document.body.classList.toggle('nav-open'); mobileNavToggle.setAttribute('aria-expanded', String(open)); }); }

  function renderAll(){ renderMiniCalendars(); renderEventsList(); renderBarChart(); renderMap(); }

  // ========== INIT ==========
  (async function init(){
    try{
      await getDhiveClient();
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
