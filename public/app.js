const state = {
  rows: [],
  filtered: [],
  trendChart: null,
  waterfallChart: null,
  rubroChart: null,
  agrupacionChart: null,
  expandedNodes: new Set(),   // claves de nodos expandidos en la tabla
  donutDrill: [],             // ruta de drill-down del donut: [{field, value}, ...]
  donutMode: "inflow",       // inflow | outflow
  activeTab: "dashboardTab",
  movementsSort: { key: "Fecha", direction: "desc" } // desc: mas reciente primero
};

const els = {
  fromPeriod:     document.getElementById("fromPeriod"),
  toPeriod:       document.getElementById("toPeriod"),
  excelFile:      document.getElementById("excelFile"),
  uploadBtn:      document.getElementById("uploadBtn"),
  exportCsvBtn:   document.getElementById("exportCsvBtn"),
  resetUploadBtn: document.getElementById("resetUploadBtn"),
  uploadBanner:   document.getElementById("uploadBanner"),
  fileName:       document.getElementById("fileName"),
  sourceBadge:    document.getElementById("sourceBadge"),
  metrics:        document.getElementById("metrics"),
  pivotTable:     document.getElementById("pivotTable"),
  status:         document.getElementById("status"),
  refreshBtn:     document.getElementById("refreshBtn"),
  tabButtons:     Array.from(document.querySelectorAll(".tab-btn")),
  tabPanes:       Array.from(document.querySelectorAll(".tab-pane")),
  movementsHead:  document.getElementById("movementsHead"),
  movementsBody:  document.getElementById("movementsBody"),
  donutModeInflowBtn: document.getElementById("donutModeInflow"),
  donutModeOutflowBtn: document.getElementById("donutModeOutflow"),
  donutSubtitle: document.getElementById("donutSubtitle")
};

const movementColumns = [
  { key: "Fecha",               label: "Fecha" },
  { key: "Periodo",             label: "Periodo" },
  { key: "Banco",               label: "Banco" },
  { key: "Concepto",            label: "Concepto" },
  { key: "Agrupacion Original", label: "Agrupacion" },
  { key: "Rubro Original",      label: "Rubro" },
  { key: "Original",            label: "Original" },
  { key: "Item",                label: "Item" },
  { key: "ImporteNum",          label: "Importe", alignRight: true, format: (v) => currencyFmt.format(Number(v || 0)) }
];

const movementColumnFilters = Object.fromEntries(
  movementColumns.map((c) => [c.key, ""])
);

const hierarchyFields = [
  "Agrupacion Original",
  "Rubro Original",
  "Original",
  "Item"
];

const currencyFmt = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2
});

// Formato compacto para ejes de graficos: $228M en lugar de $228,119,861
function formatCompact(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return currencyFmt.format(value);
}

// Chart.js light-theme defaults
Chart.defaults.color = "#64748b";
Chart.defaults.borderColor = "#e2e8f0";
Chart.defaults.font.family = "'Inter', 'Space Grotesk', sans-serif";
Chart.defaults.font.size = 11;
if (window.ChartDataLabels) {
  Chart.register(window.ChartDataLabels);
}

const CHART_OPTS = {
  tooltip: {
    backgroundColor: "#0f1e3d",
    borderColor: "rgba(30,58,110,0.5)",
    borderWidth: 1,
    titleColor: "#94a3b8",
    bodyColor: "#f8fafc",
    padding: 10,
    cornerRadius: 8
  },
  scale: {
    grid:   { color: "#f1f5f9" },
    border: { color: "#e2e8f0" },
    ticks:  { color: "#64748b" }
  }
};

function formatPct(value, total, decimals = 1) {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(decimals)}%`;
}

const zeroReferencePlugin = {
  id: "zeroReferencePlugin",
  beforeDatasetsDraw(chart, _args, pluginOptions) {
    if (!pluginOptions?.enabled) return;

    const yScale = chart.scales[pluginOptions.scaleId || "yNet"] || chart.scales.yGross;
    if (!yScale) return;

    const y = yScale.getPixelForValue(0);
    if (!Number.isFinite(y) || y < chart.chartArea.top || y > chart.chartArea.bottom) return;

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = pluginOptions.color || "rgba(15,23,42,0.32)";
    ctx.lineWidth = pluginOptions.lineWidth || 1.4;
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.restore();
  }
};  

Chart.register(zeroReferencePlugin);

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseArNumber(value) {
  if (value == null) return 0;
  // Si xlsx ya entrego un numero JS nativo, usarlo directo
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value).trim().replace(/[^\d,.\-]/g, ""); // quita $ espacios etc.
  if (!s || s === "-") return 0;

  const dots   = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  let normalized;

  if (dots > 1) {
    // -7.418.395,00  o  -7.418.395  → puntos son miles, coma es decimal
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (commas > 1) {
    // -7,418,395.00 → comas son miles, punto es decimal
    normalized = s.replace(/,/g, "");
  } else if (dots === 1 && commas === 1) {
    // Ambos presentes → el ultimo es el decimal
    normalized = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(".", "").replace(",", ".")  // -7.418,00 → coma es decimal
      : s.replace(",", "");                    // -7,418.00 → punto es decimal
  } else if (dots === 0 && commas === 1) {
    // Solo coma → decimal argentino: -7395,00 → -7395.00
    normalized = s.replace(",", ".");
  } else if (dots === 1 && commas === 0) {
    // Solo un punto: si hay exactamente 3 digitos tras el punto es separador de miles
    // -7.418 → 7418; -7.50 → 7.50
    const afterDot = s.split(".")[1] ?? "";
    normalized = afterDot.length === 3 ? s.replace(".", "") : s;
  } else {
    // Sin separadores o caso borde
    normalized = s.replace(/[,.]/g, "");
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDateToTimestamp(value) {
  if (value == null || value === "") return Number.NaN;

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : Number.NaN;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date (dias desde 1899-12-30)
    if (value > 1000 && value < 100000) {
      return Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
    }
    const d = new Date(value);
    const t = d.getTime();
    return Number.isFinite(t) ? t : Number.NaN;
  }
  
  const s = String(value).trim();
  if (!s) return Number.NaN;

  // ISO (YYYY-MM-DD)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const t = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isFinite(t) ? t : Number.NaN;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const t = Date.UTC(year, month - 1, day);
    return Number.isFinite(t) ? t : Number.NaN;
  }

  const fallback = Date.parse(s);
  return Number.isFinite(fallback) ? fallback : Number.NaN;
}

// Convierte cualquier formato de fecha a YYYY-MM para agrupar por mes
function normalizePeriodo(periodo, fecha) {
  const p = String(periodo ?? "").trim();

  // Ya está en YYYY-MM
  if (/^\d{4}-\d{2}$/.test(p)) return p;

  // YYYY-MM-DD (fecha ISO completa)
  if (/^\d{4}-\d{2}-\d{2}/.test(p)) return p.slice(0, 7);

  // DD/MM/YYYY o D/M/YYYY (común en Excel argentino)
  const dmy = p.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}`;

  // MM/DD/YYYY (Excel inglés)
  const mdy = p.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}`;

  // Si Periodo está vacío o irreconocible, derivar de Fecha
  const f = String(fecha ?? "").trim();
  const fdmy = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fdmy) return `${fdmy[3]}-${fdmy[2].padStart(2, "0")}`;

  return p || "Sin periodo";
}

function normalizeRow(row) {
  return {
    ...row,
    ImporteNum: parseArNumber(row.Importe),
    SaldoPesosNum: parseArNumber(row["Saldo Pesos"]),
    Periodo: normalizePeriodo(row.Periodo, row.Fecha)
  };
}

function uniqueSorted(rows, key) {
  const values = [...new Set(rows.map((r) => r[key] || "Sin dato"))];
  return values.sort((a, b) => String(a).localeCompare(String(b)));
}

function fillSelect(select, values, includeAll = true) {
  const current = select.value;
  select.innerHTML = "";

  if (includeAll) {
    const op = document.createElement("option");
    op.value = "__ALL__";
    op.textContent = "Todos";
    select.appendChild(op);
  }

  values.forEach((v) => {
    const op = document.createElement("option");
    op.value = v;
    op.textContent = v;
    select.appendChild(op);
  });

  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function periodInRange(period, from, to) {
  if (!period) return false;
  if (from && period < from) return false;
  if (to && period > to) return false;
  return true;
}

// ── MULTI-SELECT WIDGET ─────────────────────────────────────────
const _msSel = new Map(); // id -> Set<string> (vacia = todos seleccionados)

function buildMultiSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev     = _msSel.get(id) ?? new Set();
  const validPrev = new Set([...prev].filter((v) => values.includes(v)));
  el.innerHTML = `
    <button type="button" class="ms-btn">
      <span class="ms-lbl">Todos</span>
      <svg class="ms-arr" width="10" height="6" viewBox="0 0 10 6" fill="none">
        <path d="M0 0l5 6 5-6" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button type="button" class="ms-clear" aria-label="Limpiar filtro" style="display:none" tabindex="-1">&#x2715;</button>
    <div class="ms-panel">
      <div class="ms-search-wrap">
        <input type="text" class="ms-search" placeholder="Buscar\u2026" autocomplete="off" spellcheck="false">
      </div>
      <label class="ms-opt ms-all-opt">
        <input type="checkbox" class="ms-all-cb" checked>
        <span>Todos</span>
      </label>
      <div class="ms-opts-list">
        ${values.map((v) => `
          <label class="ms-opt">
            <input type="checkbox" class="ms-item-cb"
              value="${escapeHtml(v)}"
              ${validPrev.size === 0 || validPrev.has(v) ? "checked" : ""}>
            <span>${escapeHtml(v)}</span>
          </label>`).join("")}
      </div>
    </div>`;
  _msSel.set(id, validPrev.size === 0 ? new Set() : validPrev);
  _syncMsLabel(id);
  _bindMsEvents(id);
}

function _syncMsLabel(id) {
  const el  = document.getElementById(id);
  if (!el) return;
  const items    = [...el.querySelectorAll(".ms-item-cb")];
  const allCb    = el.querySelector(".ms-all-cb");
  const lbl      = el.querySelector(".ms-lbl");
  const clearBtn = el.querySelector(".ms-clear");
  const chk      = items.filter((c) => c.checked);
  if (chk.length === items.length) {
    // todos marcados → estado "Todos"
    lbl.textContent = "Todos";
    if (allCb) { allCb.checked = true; allCb.indeterminate = false; }
    _msSel.set(id, new Set());
    if (clearBtn) clearBtn.style.display = "none";
  } else if (chk.length === 0) {
    // ninguno marcado: NO revertir a Todos; el usuario está eligiendo
    lbl.textContent = "Ninguno";
    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    _msSel.set(id, new Set());
    if (clearBtn) clearBtn.style.display = "flex";
  } else {
    if      (chk.length === 1) lbl.textContent = chk[0].value;
    else if (chk.length === 2) lbl.textContent = `${chk[0].value}, ${chk[1].value}`;
    else                       lbl.textContent = `${chk.length} seleccionados`;
    if (allCb) { allCb.checked = false; allCb.indeterminate = true; }
    _msSel.set(id, new Set(chk.map((c) => c.value)));
    if (clearBtn) clearBtn.style.display = "flex";
  }
}

function _bindMsEvents(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // Bloquea la propagación de cualquier click dentro del panel al document
  el.querySelector(".ms-panel").addEventListener("click", (e) => e.stopPropagation());
  el.querySelector(".ms-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = el.classList.contains("ms-open");
    document.querySelectorAll(".ms.ms-open").forEach((w) => w.classList.remove("ms-open"));
    if (!isOpen) {
      el.classList.add("ms-open");
      const search = el.querySelector(".ms-search");
      if (search) { search.value = ""; _filterMsOpts(el); search.focus(); }
    }
  });
  const clearBtn = el.querySelector(".ms-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearMultiFilter(id);
      _onMsChange(id);
    });
  }
  el.querySelector(".ms-all-cb").addEventListener("change", function () {
    el.querySelectorAll(".ms-item-cb").forEach((cb) => { cb.checked = this.checked; });
    this.indeterminate = false;
    _syncMsLabel(id);
    _onMsChange(id);
  });
  el.querySelectorAll(".ms-item-cb").forEach((cb) => {
    cb.addEventListener("change", () => { _syncMsLabel(id); _onMsChange(id); });
  });
  const searchInput = el.querySelector(".ms-search");
  if (searchInput) {
    searchInput.addEventListener("input", () => _filterMsOpts(el));
    searchInput.addEventListener("click", (e) => e.stopPropagation());
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") el.classList.remove("ms-open");
    });
  }
}

function _filterMsOpts(el) {
  const q = (el.querySelector(".ms-search")?.value ?? "").toLowerCase().trim();
  let visible = 0;
  el.querySelectorAll(".ms-item-cb").forEach((cb) => {
    const show = !q || cb.value.toLowerCase().includes(q);
    cb.closest(".ms-opt").style.display = show ? "" : "none";
    if (show) visible++;
  });
  let noRes = el.querySelector(".ms-no-results");
  if (!noRes) {
    noRes = document.createElement("p");
    noRes.className = "ms-no-results";
    noRes.textContent = "Sin resultados";
    el.querySelector(".ms-opts-list").insertAdjacentElement("afterend", noRes);
  }
  noRes.style.display = visible === 0 ? "" : "none";
}

function _onMsChange(id) {
  updateDependentFilters(id);
  applyFilters();
}

function getMultiSelected(id) {
  return _msSel.get(id) ?? new Set();
}

function setMultiSingle(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelectorAll(".ms-item-cb").forEach((cb) => { cb.checked = cb.value === val; });
  _syncMsLabel(id);
}

function clearMultiFilter(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelectorAll("input[type=checkbox]").forEach((cb) => { cb.checked = true; cb.indeterminate = false; });
  _syncMsLabel(id);
}
// ─────────────────────────────────────────────────────────────────

function setActiveTab(tabId) {
  state.activeTab = tabId;
  els.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("tab-btn-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  els.tabPanes.forEach((pane) => {
    pane.classList.toggle("tab-pane-active", pane.id === tabId);
  });
}

function initTabs() {
  els.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
  setActiveTab(state.activeTab);
}

function setDonutMode(mode) {
  if (!["inflow", "outflow"].includes(mode)) return;
  state.donutMode = mode;
  state.donutDrill = [];

  const isInflow = mode === "inflow";
  els.donutModeInflowBtn?.classList.toggle("donut-mode-btn-active", isInflow);
  els.donutModeOutflowBtn?.classList.toggle("donut-mode-btn-active", !isInflow);

  renderAgrupacionChart();
}

function applyFilters() {
  const selBank     = getMultiSelected("bankFilter");
  const selAgr      = getMultiSelected("agrupacionFilter");
  const selRubro    = getMultiSelected("rubroFilter");
  const selOriginal = getMultiSelected("originalFilter");
  const selItem     = getMultiSelected("itemFilter");
  const fromPeriod  = els.fromPeriod.value;
  const toPeriod    = els.toPeriod.value;

  state.filtered = state.rows.filter((r) => {
    if (selBank.size     && !selBank.has(r.Banco || "Sin dato"))                 return false;
    if (selAgr.size      && !selAgr.has(r["Agrupacion Original"] || "Sin dato")) return false;
    if (selRubro.size    && !selRubro.has(r["Rubro Original"] || "Sin dato"))    return false;
    if (selOriginal.size && !selOriginal.has(r.Original || "Sin dato"))          return false;
    if (selItem.size     && !selItem.has(r.Item || "Sin dato"))                  return false;
    return periodInRange(r.Periodo, fromPeriod, toPeriod);
  });

  renderAll();
}

function updateDependentFilters(skipId = null) {
  const selBank     = getMultiSelected("bankFilter");
  const selAgr      = getMultiSelected("agrupacionFilter");
  const selRubro    = getMultiSelected("rubroFilter");
  const selOriginal = getMultiSelected("originalFilter");
  const selItem     = getMultiSelected("itemFilter");

  // Cada filtro muestra los valores que tienen filas compatibles con TODOS LOS DEMAS filtros activos
  const ok = (r, skip) => {
    if (skip !== "bank"     && selBank.size     && !selBank.has(r.Banco || "Sin dato"))                 return false;
    if (skip !== "agr"      && selAgr.size      && !selAgr.has(r["Agrupacion Original"] || "Sin dato")) return false;
    if (skip !== "rubro"    && selRubro.size    && !selRubro.has(r["Rubro Original"] || "Sin dato"))    return false;
    if (skip !== "original" && selOriginal.size && !selOriginal.has(r.Original || "Sin dato"))          return false;
    if (skip !== "item"     && selItem.size     && !selItem.has(r.Item || "Sin dato"))                  return false;
    return true;
  };

  // skipId: no reconstruir el filtro que el usuario esta editando en este momento
  if (skipId !== "bankFilter")       buildMultiSelect("bankFilter",       uniqueSorted(state.rows.filter((r) => ok(r, "bank")),     "Banco"));
  if (skipId !== "agrupacionFilter") buildMultiSelect("agrupacionFilter", uniqueSorted(state.rows.filter((r) => ok(r, "agr")),      "Agrupacion Original"));
  if (skipId !== "rubroFilter")      buildMultiSelect("rubroFilter",      uniqueSorted(state.rows.filter((r) => ok(r, "rubro")),    "Rubro Original"));
  if (skipId !== "originalFilter")   buildMultiSelect("originalFilter",   uniqueSorted(state.rows.filter((r) => ok(r, "original")), "Original"));
  if (skipId !== "itemFilter")       buildMultiSelect("itemFilter",       uniqueSorted(state.rows.filter((r) => ok(r, "item")),     "Item"));
}

function renderMetrics() {
  const total   = state.filtered.reduce((sum, r) => sum + r.ImporteNum, 0);
  const inflow  = state.filtered.filter((r) => r.ImporteNum > 0).reduce((sum, r) => sum + r.ImporteNum, 0);
  const outflow = state.filtered.filter((r) => r.ImporteNum < 0).reduce((sum, r) => sum + r.ImporteNum, 0);
  const txCount = state.filtered.length;

  const cards = [
    { title: "Importe Neto",  value: currencyFmt.format(total),   cls: total >= 0 ? "positive" : "negative", accent: total >= 0 ? "var(--green)" : "var(--red)" },
    { title: "Ingresos",      value: currencyFmt.format(inflow),  cls: "positive", accent: "var(--green)" },
    { title: "Egresos",       value: currencyFmt.format(outflow), cls: "negative", accent: "var(--red)" },
    { title: "Movimientos",   value: new Intl.NumberFormat("es-AR").format(txCount), cls: "mono", accent: "var(--blue-400)" }
  ];

  els.metrics.innerHTML = cards
    .map(
      (c) => `
      <article class="metric-card" style="--card-accent:${c.accent}">
        <p class="metric-title">${c.title}</p>
        <p class="metric-value ${c.cls}">${c.value}</p>
      </article>`
    )
    .join("");
}

function totalsByPeriod(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const key = r.Periodo || "Sin periodo";
    m.set(key, (m.get(key) || 0) + r.ImporteNum);
  });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// Abre el modal con el detalle de movimientos del periodo clickeado
function openPeriodModal(period) {
  const rows = state.filtered.filter((r) => r.Periodo === period);
  if (!rows.length) return;

  const ingresos = rows.filter((r) => r.ImporteNum >= 0).reduce((s, r) => s + r.ImporteNum, 0);
  const egresos  = rows.filter((r) => r.ImporteNum < 0).reduce((s, r) => s + r.ImporteNum, 0);
  const neto     = ingresos + egresos;

  document.getElementById("movModalTitle").textContent    = `Movimientos de ${period}`;
  document.getElementById("movModalSubtitle").textContent = `${rows.length} registros`;

  document.getElementById("movModalSummary").innerHTML = [
    { label: "Ingresos",    value: ingresos, cls: "positive" },
    { label: "Egresos",     value: egresos,  cls: "negative" },
    { label: "Neto",        value: neto,     cls: neto >= 0 ? "positive" : "negative" },
    { label: "Movimientos", value: rows.length, mono: true },
  ].map((c) => `
    <div class="mov-summary-chip">
      <span>${c.label}</span>
      <span class="${c.cls || ""} ${c.mono ? "mono" : ""}">
        ${c.mono ? c.value : currencyFmt.format(c.value)}
      </span>
    </div>`).join("");

  // Ordenar por Fecha, luego por Importe descendente
  const sorted = [...rows].sort((a, b) => {
    const da = String(a.Fecha || ""), db = String(b.Fecha || "");
    return da.localeCompare(db) || b.ImporteNum - a.ImporteNum;
  });

  document.getElementById("movModalBody").innerHTML = sorted.map((r) => {
    const cls = r.ImporteNum < 0 ? "negative" : "positive";
    return `<tr>
      <td>${escapeHtml(r.Fecha)}</td>
      <td>${escapeHtml(r.Banco)}</td>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.Concepto)}</td>
      <td>${escapeHtml(r["Rubro Original"])}</td>
      <td>${escapeHtml(r.Original)}</td>
      <td class="importe ${cls}">${currencyFmt.format(r.ImporteNum)}</td>
    </tr>`;
  }).join("");

  document.getElementById("movModal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closePeriodModal() {
  document.getElementById("movModal").style.display = "none";
  document.body.style.overflow = "";
}

// Grafico principal: barras Ingresos/Egresos por mes + linea Neto
function renderTrendChart() {
  if (state.trendChart) { state.trendChart.destroy(); state.trendChart = null; }

  const periodMap = new Map();
  state.filtered.forEach((r) => {
    const p = r.Periodo || "Sin periodo";
    if (!periodMap.has(p)) periodMap.set(p, { ingresos: 0, egresos: 0 });
    const d = periodMap.get(p);
    if (r.ImporteNum >= 0) d.ingresos += r.ImporteNum;
    else d.egresos += r.ImporteNum;
  });

  const sorted = [...periodMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const labels   = sorted.map(([p]) => p);
  const ingresos = sorted.map(([, d]) => d.ingresos);
  const egresos  = sorted.map(([, d]) => d.egresos);
  const neto     = sorted.map(([, d]) => d.ingresos + d.egresos);
  const grossAbsMax = Math.max(
    1,
    ...ingresos.map((v) => Math.abs(v)),
    ...egresos.map((v) => Math.abs(v))
  );
  const netAbsMax = Math.max(1, ...neto.map((v) => Math.abs(v)));
  const grossLimit = grossAbsMax * 1.12;
  const netLimit = netAbsMax * 1.16;

  if (!labels.length) {
    document.getElementById("trendChart").getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  state.trendChart = new Chart(document.getElementById("trendChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Ingresos",
          data: ingresos,
          backgroundColor: "rgba(5,150,105,0.65)",
          borderColor: "#059669",
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: "yGross",
          categoryPercentage: 0.72,
          barPercentage: 0.84,
          order: 2
        },
        {
          type: "bar",
          label: "Egresos",
          data: egresos,
          backgroundColor: "rgba(220,38,38,0.65)",
          borderColor: "#dc2626",
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: "yGross",
          categoryPercentage: 0.72,
          barPercentage: 0.84,
          order: 2
        },
        {
          type: "line",
          label: "Neto",
          data: neto,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.16)",
          fill: false,
          yAxisID: "yNet",
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4.5,
          pointBackgroundColor: neto.map((v) => v >= 0 ? "#059669" : "#dc2626"),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointHoverRadius: 7,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      cursor: "pointer",
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const period = labels[elements[0].index];
        openPeriodModal(period);
      },
      plugins: {
        zeroReferencePlugin: {
          enabled: true,
          scaleId: "yNet",
          color: "rgba(15,23,42,0.32)",
          lineWidth: 1.4
        },
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { color: "#64748b", boxWidth: 12, boxHeight: 12, font: { size: 11 } }
        },
        datalabels: { display: false },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${currencyFmt.format(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: CHART_OPTS.scale.grid,
          border: CHART_OPTS.scale.border,
          ticks: CHART_OPTS.scale.ticks
        },
        yGross: {
          min: -grossLimit,
          max: grossLimit,
          beginAtZero: true,
          grid: CHART_OPTS.scale.grid,
          border: CHART_OPTS.scale.border,
          title: { display: true, text: "Ingresos / Egresos", color: "#64748b", font: { size: 11, weight: "600" } },
          ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) }
        },
        yNet: {
          min: -netLimit,
          max: netLimit,
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          border: CHART_OPTS.scale.border,
          title: { display: true, text: "Neto", color: "#2563eb", font: { size: 11, weight: "700" } },
          ticks: { ...CHART_OPTS.scale.ticks, color: "#2563eb", callback: (v) => formatCompact(v) }
        }
      }
    }
  });
}

// Grafico de cascada: impacto neto mensual y acumulado final
function renderWaterfallChart() {
  if (state.waterfallChart) { state.waterfallChart.destroy(); state.waterfallChart = null; }

  const monthlyNet = totalsByPeriod(state.filtered);
  const labels = monthlyNet.map(([period]) => period);
  const deltas = monthlyNet.map(([, total]) => total);

  if (!labels.length) {
    document.getElementById("waterfallChart").getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  const barLabels = [...labels, "Acumulado"];
  const floatingBars = [];
  const colors = [];
  const borderColors = [];
  const monthlyStart = [];
  const monthlyEnd = [];

  let running = 0;
  deltas.forEach((delta) => {
    const start = running;
    const end = running + delta;
    floatingBars.push([start, end]);
    monthlyStart.push(start);
    monthlyEnd.push(end);
    colors.push(delta >= 0 ? "rgba(5,150,105,0.68)" : "rgba(220,38,38,0.68)");
    borderColors.push(delta >= 0 ? "#059669" : "#dc2626");
    running = end;
  });

  floatingBars.push([0, running]);
  monthlyStart.push(0);
  monthlyEnd.push(running);
  colors.push("rgba(37,99,235,0.35)");
  borderColors.push("#2563eb");

  let minY = 0;
  let maxY = 0;
  for (let i = 0; i < floatingBars.length; i += 1) {
    const pair = floatingBars[i];
    minY = Math.min(minY, pair[0], pair[1]);
    maxY = Math.max(maxY, pair[0], pair[1]);
  }
  const span = Math.max(1, maxY - minY);
  const pad = span * 0.12;

  state.waterfallChart = new Chart(document.getElementById("waterfallChart"), {
    type: "bar",
    data: {
      labels: barLabels,
      datasets: [{
        label: "Variacion",
        data: floatingBars,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        categoryPercentage: 0.76,
        barPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: "nearest", intersect: true },
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (idx >= labels.length) return;
        openPeriodModal(labels[idx]);
      },
      plugins: {
        zeroReferencePlugin: {
          enabled: true,
          scaleId: "y",
          color: "rgba(15,23,42,0.32)",
          lineWidth: 1.4
        },
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            title: (items) => items?.[0]?.label || "",
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const isTotal = idx === labels.length;
              if (isTotal) {
                return ` Acumulado: ${currencyFmt.format(running)}`;
              }
              return ` Neto del mes: ${currencyFmt.format(deltas[idx])}`;
            },
            afterLabel: (ctx) => {
              const idx = ctx.dataIndex;
              if (idx === labels.length) return "";
              return ` Cierre acumulado: ${currencyFmt.format(monthlyEnd[idx])}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: "transparent" },
          border: CHART_OPTS.scale.border,
          ticks: CHART_OPTS.scale.ticks
        },
        y: {
          min: minY - pad,
          max: maxY + pad,
          grid: CHART_OPTS.scale.grid,
          border: CHART_OPTS.scale.border,
          ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) },
          title: { display: true, text: "Saldo acumulado", color: "#64748b", font: { size: 11, weight: "600" } }
        }
      }
    }
  });
}

// Top 10 rubros, clickeables para filtrar la tabla
function renderRubroChart() {
  if (state.rubroChart) { state.rubroChart.destroy(); state.rubroChart = null; }

  const rubroMap = new Map();
  state.filtered.forEach((r) => {
    const key = r["Rubro Original"] || "Sin dato";
    rubroMap.set(key, (rubroMap.get(key) || 0) + r.ImporteNum);
  });

  const entries = [...rubroMap.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 10);
  const labels  = entries.map(([name]) => name);
  const values  = entries.map(([, v]) => v);

  if (!labels.length) {
    document.getElementById("rubroChart").getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  state.rubroChart = new Chart(document.getElementById("rubroChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map((v) => v < 0 ? "rgba(220,38,38,0.70)" : "rgba(5,150,105,0.70)"),
        borderColor:     values.map((v) => v < 0 ? "#dc2626" : "#059669"),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const rubro = labels[elements[0].index];
        const sel = getMultiSelected("rubroFilter");
        if (sel.size === 1 && sel.has(rubro)) clearMultiFilter("rubroFilter");
        else setMultiSingle("rubroFilter", rubro);
        updateDependentFilters();
        applyFilters();
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          display: (ctx) => {
            const value = Math.abs(Number(ctx.dataset.data[ctx.dataIndex] || 0));
            const sum = ctx.dataset.data.reduce((acc, v) => acc + Math.abs(Number(v || 0)), 0);
            if (!sum) return false;
            return (value / sum) >= 0.08;
          },
          formatter: (value, ctx) => formatPct(Math.abs(Number(value || 0)), ctx.dataset.data.reduce((acc, v) => acc + Math.abs(Number(v || 0)), 0), 0),
          color: "#0f172a",
          font: { weight: "700", size: 10 },
          anchor: "end",
          align: "right",
          offset: 2,
          clip: true
        },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => ` ${currencyFmt.format(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          grid: CHART_OPTS.scale.grid,
          border: CHART_OPTS.scale.border,
          ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) }
        },
        y: {
          grid: { color: "transparent" },
          border: CHART_OPTS.scale.border,
          ticks: { color: "#334155", font: { family: "'Inter', sans-serif", size: 12 } }
        }
      }
    }
  });
}

const DONUT_PALETTE = [
  "#2563eb","#059669","#dc2626","#7c3aed","#d97706",
  "#0891b2","#be185d","#4f46e5","#65a30d","#c2410c"
];

// Jerarquia de campos para el drill-down del donut
const DRILL_FIELDS = ["Agrupacion Original", "Rubro Original", "Original", "Item"];

const DRILL_TITLES = [
  "Composicion por Agrupacion",
  "Composicion por Rubro",
  "Composicion por Original",
  "Composicion por Item",
];

function renderDonutBreadcrumb() {
  const drill = state.donutDrill;
  const bc    = document.getElementById("donutBreadcrumb");
  const title = document.getElementById("donutTitle");
  if (!bc) return;

  const isInflow = state.donutMode === "inflow";
  const prefix = isInflow ? "Ingresos" : "Egresos";

  if (!drill.length) {
    bc.style.display = "none";
    if (title) title.textContent = `${prefix} - ${DRILL_TITLES[0]}`;
    if (els.donutSubtitle) els.donutSubtitle.textContent = "Click en sector para desglosar";
    return;
  }

  bc.style.display = "flex";
  if (title) title.textContent = `${prefix} - ${DRILL_TITLES[Math.min(drill.length, DRILL_TITLES.length - 1)]}`;
  if (els.donutSubtitle) els.donutSubtitle.textContent = "Ruta de desagregacion activa";

  bc.innerHTML = [
    `<button class="donut-bc-btn donut-bc-root" data-level="-1">Todos</button>`,
    ...drill.map((d, i) =>
      `<span class="donut-bc-sep">&#8250;</span>
       <button class="donut-bc-btn" data-level="${i}">${escapeHtml(d.value)}</button>`
    )
  ].join("");

  bc.querySelectorAll(".donut-bc-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lvl = parseInt(btn.dataset.level);
      state.donutDrill = lvl === -1 ? [] : state.donutDrill.slice(0, lvl + 1);
      renderAgrupacionChart();
    });
  });
}

// Donut con drill-down autonomo: navega niveles sin cambiar filtros globales
function renderAgrupacionChart() {
  if (state.agrupacionChart) { state.agrupacionChart.destroy(); state.agrupacionChart = null; }

  const drill = state.donutDrill;
  const isInflow = state.donutMode === "inflow";

  // Filtrar filas por signo y luego por la ruta de drill
  let drillRows = state.filtered.filter((r) => isInflow ? r.ImporteNum > 0 : r.ImporteNum < 0);
  drill.forEach(({ field, value }) => {
    drillRows = drillRows.filter((r) => (r[field] || "Sin dato") === value);
  });

  // Campo del siguiente nivel
  const nextField = DRILL_FIELDS[drill.length] ?? null;

  renderDonutBreadcrumb();

  if (!nextField || !drillRows.length) {
    const el = document.getElementById("agrupacionChart");
    if (el) el.getContext("2d").clearRect(0, 0, 9999, 9999);
    if (els.donutSubtitle) {
      els.donutSubtitle.textContent = isInflow
        ? "Sin ingresos para los filtros actuales"
        : "Sin egresos para los filtros actuales";
    }
    return;
  }

  const map = new Map();
  drillRows.forEach((r) => {
    const key = r[nextField] || "Sin dato";
    map.set(key, (map.get(key) || 0) + Math.abs(r.ImporteNum));
  });

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const labels  = entries.map(([k]) => k);
  const values  = entries.map(([, v]) => v);
  const total   = values.reduce((s, v) => s + v, 0);

  if (!labels.length) return;

  state.agrupacionChart = new Chart(document.getElementById("agrupacionChart"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: DONUT_PALETTE.slice(0, labels.length),
        borderColor: "#ffffff",
        borderWidth: 2,
        hoverOffset: 10
      }]
    },
    options: {
      cutout: "62%",
      responsive: true,
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const value = labels[elements[0].index];
        // Si ya estamos en el ultimo nivel, no hay mas hijos
        if (drill.length < DRILL_FIELDS.length - 1) {
          state.donutDrill = [...drill, { field: nextField, value }];
          renderAgrupacionChart();
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#334155", boxWidth: 12, boxHeight: 12, font: { size: 11 }, padding: 10 }
        },
        datalabels: {
          display: (ctx) => {
            const v = Number(ctx.dataset.data[ctx.dataIndex] || 0);
            if (!total) return false;
            return (v / total) >= 0.05;
          },
          formatter: (value) => formatPct(Number(value || 0), total, 1),
          color: "#0f172a",
          backgroundColor: "rgba(255,255,255,0.9)",
          borderColor: "rgba(148,163,184,0.6)",
          borderWidth: 1,
          borderRadius: 4,
          padding: { top: 2, right: 4, bottom: 2, left: 4 },
          font: { weight: "700", size: 10 },
          anchor: "end",
          align: "end",
          offset: 6,
          clamp: true,
          clip: false
        },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              const signedValue = isInflow ? ctx.parsed : -ctx.parsed;
              return ` ${ctx.label}: ${currencyFmt.format(signedValue)} (${pct}%)`;
            },
          }
        }
      }
    }
  });
}

// Construye arbol jerarquico de 4 niveles desde las filas filtradas
function buildTree(rows) {
  const root = new Map();
  rows.forEach((r) => {
    const path = [
      r["Agrupacion Original"] || "Sin dato",
      r["Rubro Original"]      || "Sin dato",
      r.Original               || "Sin dato",
      r.Item                   || "Sin dato",
    ];
    const per = r.Periodo || "Sin periodo";
    const val = r.ImporteNum;

    const k0 = path[0];
    if (!root.has(k0)) root.set(k0, { label: path[0], key: k0, level: 0, total: 0, periods: {}, children: new Map() });
    const n0 = root.get(k0);
    n0.total += val; n0.periods[per] = (n0.periods[per] || 0) + val;

    const k1 = `${k0} » ${path[1]}`;
    if (!n0.children.has(k1)) n0.children.set(k1, { label: path[1], key: k1, level: 1, total: 0, periods: {}, children: new Map() });
    const n1 = n0.children.get(k1);
    n1.total += val; n1.periods[per] = (n1.periods[per] || 0) + val;

    const k2 = `${k1} » ${path[2]}`;
    if (!n1.children.has(k2)) n1.children.set(k2, { label: path[2], key: k2, level: 2, total: 0, periods: {}, children: new Map() });
    const n2 = n1.children.get(k2);
    n2.total += val; n2.periods[per] = (n2.periods[per] || 0) + val;

    const k3 = `${k2} » ${path[3]}`;
    if (!n2.children.has(k3)) n2.children.set(k3, { label: path[3], key: k3, level: 3, total: 0, periods: {}, children: new Map() });
    const n3 = n2.children.get(k3);
    n3.total += val; n3.periods[per] = (n3.periods[per] || 0) + val;
  });
  return root;
}

// Aplana el arbol solo mostrando nodos cuyo padre esta expandido
function flattenTree(map) {
  const rows = [];
  for (const node of map.values()) {
    rows.push({ ...node, hasChildren: node.children.size > 0 });
    if (state.expandedNodes.has(node.key) && node.children.size > 0) {
      rows.push(...flattenTree(node.children));
    }
  }
  return rows;
}

function renderPivotTable() {
  const periods = uniqueSorted(state.filtered, "Periodo");
  const tree    = buildTree(state.filtered);
  const flat    = flattenTree(tree);

  if (!flat.length) {
    els.pivotTable.innerHTML = `<tbody><tr><td colspan="${periods.length + 2}" style="text-align:center;padding:28px;color:var(--text-400)">Sin datos para los filtros seleccionados</td></tr></tbody>`;
    return;
  }

  // Max abs por periodo para escalar mini-barras (sin spread para evitar stack overflow)
  let maxAbs = 1;
  flat.forEach((r) => periods.forEach((p) => {
    const v = Math.abs(r.periods[p] || 0);
    if (v > maxAbs) maxAbs = v;
  }));

  // Total general por periodo
  const grand = {};
  let grandTotal = 0;
  state.filtered.forEach((r) => {
    const p = r.Periodo || "Sin periodo";
    grand[p] = (grand[p] || 0) + r.ImporteNum;
    grandTotal += r.ImporteNum;
  });

  // Cabecera
  const header = `<tr>
    <th class="pt-label-th">Jerarquia</th>
    ${periods.map((p) => `<th>${p}</th>`).join("")}
    <th>Total</th>
  </tr>`;

  // Filas del cuerpo
  const body = flat.map((row) => {
    const isExpanded = state.expandedNodes.has(row.key);
    const indent     = row.level * 22;
    const levelColor = ["var(--navy-900)", "var(--blue-600)", "#0d9488", "var(--text-500)"][row.level] ?? "var(--text-500)";

    const expBtn = row.hasChildren
      ? `<button class="pt-expand" data-key="${row.key.replace(/"/g, '&quot;')}" style="color:${levelColor}">
           <svg class="pt-arrow ${isExpanded ? "pt-open" : ""}" width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1.5 1l5 3-5 3V1z"/></svg>
         </button>`
      : `<span class="pt-expand-ph"></span>`;

    const tds = periods.map((p) => {
      const v   = row.periods[p] || 0;
      const cls = v < 0 ? "negative" : v > 0 ? "positive" : "";
      const bar = (Math.abs(v) / maxAbs * 100).toFixed(1);
      const bgc = v < 0 ? "rgba(220,38,38,0.10)" : "rgba(5,150,105,0.10)";
      return v !== 0
        ? `<td class="${cls}"><div class="pt-cell"><div class="pt-bar" style="width:${bar}%;background:${bgc}"></div><span>${formatCompact(v)}</span></div></td>`
        : `<td><span class="pt-zero">—</span></td>`;
    }).join("");

    const tcls = row.total < 0 ? "negative" : "positive";
    return `<tr class="pt-row pt-level-${row.level}" data-key="${row.key.replace(/"/g, '&quot;')}">
      <td class="pt-label" style="padding-left:${10 + indent}px">
        ${expBtn}
        <span class="pt-dot" style="background:${levelColor}"></span>
        <span style="font-weight:${row.level === 0 ? 700 : 400}">${escapeHtml(row.label)}</span>
      </td>
      ${tds}
      <td class="${tcls} pt-total"><strong>${formatCompact(row.total)}</strong></td>
    </tr>`;
  }).join("");

  // Fila de totales generales
  const grandTds = periods.map((p) => {
    const v   = grand[p] || 0;
    const cls = v < 0 ? "negative" : v > 0 ? "positive" : "";
    return `<td class="${cls} pt-total"><strong>${formatCompact(v)}</strong></td>`;
  }).join("");

  const grandRow = `<tr class="pt-grand-total">
    <td class="pt-label" style="padding-left:10px"><span class="pt-expand-ph"></span><span>TOTAL</span></td>
    ${grandTds}
    <td class="${grandTotal < 0 ? "negative" : "positive"} pt-total"><strong>${formatCompact(grandTotal)}</strong></td>
  </tr>`;

  els.pivotTable.innerHTML = `<thead>${header}</thead><tbody>${body}${grandRow}</tbody>`;
}

function buildMovementsTableHeader() {
  if (!els.movementsHead) return;

  const sortDir = state.movementsSort.direction;
  const sortArrow = sortDir === "desc" ? "\u2193" : "\u2191";
  const sortLabel = sortDir === "desc" ? "mas reciente primero" : "mas antigua primero";

  const titleRow = `
    <tr>
      ${movementColumns.map((c) => {
        const align = c.alignRight ? ' style="text-align:right"' : "";
        if (c.key === "Fecha") {
          return `<th${align}><button type="button" class="movements-sort-btn" data-sort-col="Fecha" aria-label="Ordenar por fecha (${sortLabel})">${escapeHtml(c.label)} ${sortArrow}</button></th>`;
        }
        return `<th${align}>${escapeHtml(c.label)}</th>`;
      }).join("")}
    </tr>`;

  const filterRow = `
    <tr class="movements-filter-row">
      ${movementColumns.map((c) => {
        const val = escapeHtml(movementColumnFilters[c.key] || "");
        return `<th>
          <input
            class="movements-col-filter"
            type="text"
            data-col="${escapeHtml(c.key)}"
            value="${val}"
            placeholder="Filtrar"
            aria-label="Filtrar por ${escapeHtml(c.label)}"
          />
        </th>`;
      }).join("")}
    </tr>`;

  els.movementsHead.innerHTML = titleRow + filterRow;

  els.movementsHead.querySelectorAll(".movements-col-filter").forEach((input) => {
    input.addEventListener("input", () => {
      movementColumnFilters[input.dataset.col] = input.value || "";
      renderMovementsTable();
    });
  });

  const sortBtn = els.movementsHead.querySelector(".movements-sort-btn");
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      state.movementsSort.direction = state.movementsSort.direction === "desc" ? "asc" : "desc";
      buildMovementsTableHeader();
      renderMovementsTable();
    });
  }
}

function renderMovementsTable() {
  if (!els.movementsBody) return;

  const filteredRows = state.filtered.filter((row) => {
    return movementColumns.every((col) => {
      const query = normalizeSearchText(movementColumnFilters[col.key]);
      if (!query) return true;
      const raw = col.key === "ImporteNum"
        ? currencyFmt.format(Number(row.ImporteNum || 0))
        : String(row[col.key] ?? "");
      return normalizeSearchText(raw).includes(query);
    });
  });

  if (!filteredRows.length) {
    els.movementsBody.innerHTML = `<tr><td colspan="${movementColumns.length}" style="text-align:center;padding:24px;color:var(--text-400)">Sin movimientos para los filtros actuales</td></tr>`;
    return;
  }

  const direction = state.movementsSort.direction === "asc" ? "asc" : "desc";
  const sorted = [...filteredRows].sort((a, b) => {
    const ta = parseDateToTimestamp(a.Fecha);
    const tb = parseDateToTimestamp(b.Fecha);
    const aValid = Number.isFinite(ta);
    const bValid = Number.isFinite(tb);

    if (aValid && bValid && ta !== tb) {
      return direction === "desc" ? tb - ta : ta - tb;
    }

    if (aValid !== bValid) {
      return aValid ? -1 : 1;
    }

    const pa = String(a.Periodo || "");
    const pb = String(b.Periodo || "");
    if (pa !== pb) {
      return direction === "desc" ? pb.localeCompare(pa) : pa.localeCompare(pb);
    }

    const byFechaText = String(a.Fecha || "").localeCompare(String(b.Fecha || ""));
    if (byFechaText !== 0) {
      return direction === "desc" ? -byFechaText : byFechaText;
    }

    return b.ImporteNum - a.ImporteNum;
  });

  els.movementsBody.innerHTML = sorted.map((row) => {
    return `<tr>
      ${movementColumns.map((col) => {
        const value = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
        const isNegative = col.key === "ImporteNum" && Number(row.ImporteNum || 0) < 0;
        const cls = [col.alignRight ? "movements-right" : "", isNegative ? "negative" : ""].filter(Boolean).join(" ");
        return `<td class="${cls}">${escapeHtml(value)}</td>`;
      }).join("")}
    </tr>`;
  }).join("");
}

// Listener delegado persistente: se enlaza una sola vez al contenedor de scroll
function _initPivotExpandListener() {
  const wrap = document.querySelector(".table-wrap");
  if (!wrap || wrap.dataset.pivotBound) return;
  wrap.dataset.pivotBound = "1";
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".pt-expand");
    if (!btn) return;
    const key = btn.dataset.key;
    if (state.expandedNodes.has(key)) state.expandedNodes.delete(key);
    else state.expandedNodes.add(key);
    renderPivotTable();
  });
}

function renderStatus(source) {
  const now = new Date();
  const src = source === "filtrado" ? (els.sourceBadge?.textContent || "sample") : source;
  els.status.textContent = `fuente: ${src} · ${now.toLocaleString("es-AR")} · ${state.filtered.length} registros`;
  if (source !== "filtrado" && els.sourceBadge) els.sourceBadge.textContent = source;
}

function renderAll(source = "") {
  renderMetrics();
  renderTrendChart();
  renderWaterfallChart();
  renderRubroChart();
  renderAgrupacionChart();
  renderPivotTable();
  renderMovementsTable();
  _initPivotExpandListener();
  renderStatus(source || "filtrado");
}

function setupFilterOptions() {
  buildMultiSelect("bankFilter",       uniqueSorted(state.rows, "Banco"));
  buildMultiSelect("agrupacionFilter", uniqueSorted(state.rows, "Agrupacion Original"));
  buildMultiSelect("rubroFilter",      uniqueSorted(state.rows, "Rubro Original"));
  buildMultiSelect("originalFilter",   uniqueSorted(state.rows, "Original"));
  buildMultiSelect("itemFilter",       uniqueSorted(state.rows, "Item"));

  const periods = uniqueSorted(state.rows, "Periodo");
  fillSelect(els.fromPeriod, periods, false);
  fillSelect(els.toPeriod, periods, false);

  if (periods.length) {
    els.fromPeriod.value = periods[0];
    els.toPeriod.value = periods[periods.length - 1];
  }

  // Auto-expandir nivel 0 al cargar datos
  state.expandedNodes = new Set(uniqueSorted(state.rows, "Agrupacion Original"));
}

function bindEvents() {
  initTabs();
  buildMovementsTableHeader();

  els.donutModeInflowBtn?.addEventListener("click", () => setDonutMode("inflow"));
  els.donutModeOutflowBtn?.addEventListener("click", () => setDonutMode("outflow"));

  // Solo los selects de periodo siguen siendo nativos
  [els.fromPeriod, els.toPeriod].forEach((el) => {
    el.addEventListener("change", () => applyFilters());
  });

  els.refreshBtn.addEventListener("click", () => loadData());
  els.uploadBtn?.addEventListener("click", () => uploadExcel());
  els.exportCsvBtn.addEventListener("click", () => exportFilteredCsv());
  els.resetUploadBtn.addEventListener("click", () => resetUploadedSource());
  els.excelFile.addEventListener("change", () => uploadExcel());

  // Expandir / colapsar todo en la tabla
  document.getElementById("expandAllBtn")?.addEventListener("click", () => {
    // Agrega recursivamente todos los nodos con hijos
    function _addAllKeys(map) {
      map.forEach((node) => {
        if (node.children.size > 0) {
          state.expandedNodes.add(node.key);
          _addAllKeys(node.children);
        }
      });
    }
    _addAllKeys(buildTree(state.filtered));
    renderPivotTable();
  });
  document.getElementById("collapseAllBtn")?.addEventListener("click", () => {
    state.expandedNodes.clear();
    renderPivotTable();
  });

  // Cierra multi-selects solo cuando el click ocurre FUERA del widget
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ms")) {
      document.querySelectorAll(".ms.ms-open").forEach((w) => w.classList.remove("ms-open"));
    }
  });

  // Modal: cerrar con botón X, click en overlay o tecla Escape
  document.getElementById("movModalClose").addEventListener("click", closePeriodModal);
  document.getElementById("movModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closePeriodModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePeriodModal();
  });
}

function escapeCsv(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportFilteredCsv() {
  if (!state.filtered.length) {
    els.status.textContent = "No hay filas para exportar con los filtros actuales.";
    return;
  }

  const columns = [
    "Banco",
    "Fecha",
    "Suc. Origen",
    "Desc. Sucursal",
    "Cod. Operativo",
    "Referencia",
    "Concepto",
    "Importe",
    "Saldo Pesos",
    "Item",
    "Original",
    "Contabilizado",
    "Conciliado",
    "Cod. OperativoReferenciaConceptoImporte",
    "Periodo",
    "Rubro ITEM",
    "Rubro Original",
    "Agrupacion Item",
    "Agrupacion Original",
    "Comentarios"
  ];

  const rows = state.filtered.map((row) =>
    columns.map((col) => escapeCsv(row[col] ?? "")).join(",")
  );

  const csv = [columns.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `cashflow_filtrado_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  els.status.textContent = `CSV exportado con ${state.filtered.length} filas.`;
}

function showBanner(msg, type) {
  els.uploadBanner.textContent = msg;
  els.uploadBanner.className = `upload-banner ${type}`;
  els.uploadBanner.style.display = "block";
}

function hideBanner() {
  els.uploadBanner.style.display = "none";
}

async function uploadExcel() {
  const file = els.excelFile.files?.[0];
  if (!file) {
    showBanner("Selecciona un archivo Excel (.xlsx o .xls) primero.", "error");
    return;
  }

  if (els.fileName) els.fileName.textContent = file.name;

  if (els.uploadBtn) { els.uploadBtn.textContent = "Procesando..."; els.uploadBtn.disabled = true; }
  hideBanner();

  try {
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch("/api/upload-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: b64 })
    });

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const cols = payload.detectedColumns?.length
        ? ` Columnas detectadas: ${payload.detectedColumns.join(", ")}`
        : "";
      const detail = payload.detail ? ` (${payload.detail})` : "";
      throw new Error((payload.message || `Error HTTP ${res.status}`) + detail + cols);
    }

    await loadData();
    showBanner(`✓ Excel importado: ${payload.count} filas cargadas.`, "ok");
  } catch (error) {
    showBanner(`Error al importar: ${String(error)}`, "error");
  } finally {
    if (els.uploadBtn) { els.uploadBtn.textContent = "\u2191 Importar Excel"; els.uploadBtn.disabled = false; }
  }
}

async function resetUploadedSource() {
  try {
    const res = await fetch("/api/reset-upload", { method: "POST" });
    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}`);
    }

    els.excelFile.value = "";
    if (els.fileName) els.fileName.textContent = "Sin archivo seleccionado";
    hideBanner();
    await loadData();
  } catch (error) {
    showBanner(`No se pudo limpiar: ${String(error)}`, "error");
  }
}

async function loadData() {
  try {
    const res = await fetch("/api/movements");
    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}`);
    }

    const payload = await res.json();
    state.rows = (payload.rows || []).map(normalizeRow);

    setupFilterOptions();
    updateDependentFilters();
    applyFilters();
    renderStatus(payload.source || "desconocida");
  } catch (error) {
    els.status.textContent = `No se pudieron cargar datos: ${String(error)}`;
  }
}

bindEvents();
loadData();
