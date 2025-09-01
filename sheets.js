// ========= CONFIGURACIÓN A EDITAR =========
// 1) Reemplaza por el ID de tu Google Sheet (lo explico abajo).
const SHEET_ID = "REEMPLAZA_CON_TU_SHEET_ID";

// 2) Nombres EXACTOS de las pestañas (hojas)
const TAB_METRICAS = "Métricas";  // columnas: Métrica | Valor | Unidad (opcional)
const TAB_NOTICIAS = "Noticias";  // columnas: Título | URL | Fuente (opcional)

// ========= NO EDITAR (a menos que sepas) =========
const CSV_URL = (tabName) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

const $ = (sel) => document.querySelector(sel);
const lastSyncEl = $("#last-sync");
const reloadBtn = $("#reload-btn");

function updateLastSync(){
  lastSyncEl.textContent = new Date().toLocaleString();
}

async function fetchCSV(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`Error al cargar CSV: ${res.status}`);
  return await res.text();
}

async function loadMetrics(){
  const csv = await fetchCSV(CSV_URL(TAB_METRICAS));
  const parsed = Papa.parse(csv, { header:true, skipEmptyLines:true });
  const rows = parsed.data;

  const grid = $("#metrics-grid");
  grid.innerHTML = "";

  rows.forEach((r) => {
    const label = r["Métrica"] || r["Metrica"] || r["Metric"] || "—";
    const value = r["Valor"] ?? r["Value"] ?? "—";
    const unit  = r["Unidad"] ?? r["Unit"] ?? "";

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="label">${label}</div>
      <div class="value">${value}<span class="unit">${unit ? unit : ""}</span></div>
    `;
    grid.appendChild(card);
  });
}

async function loadNews(){
  const csv = await fetchCSV(CSV_URL(TAB_NOTICIAS));
  const parsed = Papa.parse(csv, { header:true, skipEmptyLines:true });
  const rows = parsed.data;

  const list = $("#news-list");
  list.innerHTML = "";

  rows.forEach((r) => {
    const title = r["Título"] || r["Titulo"] || r["Title"] || "Sin título";
    const url   = r["URL"] || r["Link"] || "#";
    const src   = r["Fuente"] || r["Source"] || "";

    const li = document.createElement("li");
    li.className = "news-item";
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = title;

    const source = document.createElement("span");
    source.className = "source";
    source.textContent = src ? `(${src})` : "";

    li.appendChild(a);
    if(src) li.appendChild(source);
    list.appendChild(li);
  });
}

async function refreshAll(){
  await Promise.all([loadMetrics(), loadNews()]);
  updateLastSync();
}

reloadBtn?.addEventListener("click", refreshAll);

document.addEventListener("DOMContentLoaded", async () => {
  await refreshAll();
  // refresco automático cada 60s
  setInterval(refreshAll, 60_000);
});
