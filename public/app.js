// ── ESTADO ───────────────────────────────────────────────────────
const state = {
  rows: [],
  filtered: [],
  charts: {},
  expandedNodes: new Set(),
  expandedPlLines: new Set(),
  composition: { groupBy: "Rubro", metric: "net", topN: 12 },
  pivotHierarchy: ["Categoria", "Rubro", "Cuenta", "Dimension"],
  plView: { mode: "monthly", showPct: false },
  activeTab: "plTab",
  movementsSort: { key: "Fecha", direction: "desc" },
  queryFilterTerms: []
};

const els = {
  fromPeriod: document.getElementById("fromPeriod"),
  toPeriod: document.getElementById("toPeriod"),
  excelFile: document.getElementById("excelFile"),
  uploadBtn: document.getElementById("uploadBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  resetUploadBtn: document.getElementById("resetUploadBtn"),
  uploadBanner: document.getElementById("uploadBanner"),
  fileName: document.getElementById("fileName"),
  sourceBadge: document.getElementById("sourceBadge"),
  metrics: document.getElementById("metrics"),
  plTable: document.getElementById("plTable"),
  plViewMode: document.getElementById("plViewMode"),
  plShowPct: document.getElementById("plShowPct"),
  pivotTable: document.getElementById("pivotTable"),
  status: document.getElementById("status"),
  refreshBtn: document.getElementById("refreshBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  filterSummary: document.getElementById("filterSummary"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanes: Array.from(document.querySelectorAll(".tab-pane")),
  movementsHead: document.getElementById("movementsHead"),
  movementsBody: document.getElementById("movementsBody"),
  pivotHierarchyCards: document.getElementById("pivotHierarchyCards"),
  pivotOrderHint: document.getElementById("pivotOrderHint"),
  compositionTitle: document.getElementById("compositionTitle"),
  compositionSubtitle: document.getElementById("compositionSubtitle"),
  compositionGroupBy: document.getElementById("compositionGroupBy"),
  compositionMetric: document.getElementById("compositionMetric"),
  compositionTopN: document.getElementById("compositionTopN"),
  movModalChartWrap: document.getElementById("movModalChartWrap"),
  movModalChartTitle: document.getElementById("movModalChartTitle"),
  movementQuestion: document.getElementById("movementQuestion"),
  askMovementBtn: document.getElementById("askMovementBtn"),
  movementAnswer: document.getElementById("movementAnswer"),
  movementAskFab: document.getElementById("movementAskFab"),
  movementAskPanel: document.getElementById("movementAskPanel"),
  movementAskClose: document.getElementById("movementAskClose"),
  movementAskScope: document.getElementById("movementAskScope"),
  clearMovementQueryBtn: document.getElementById("clearMovementQueryBtn")
};

// ── CONFIGURACION DE DOMINIO ─────────────────────────────────────

// id del multiselect -> campo de la fila
const FILTERS = {
  empresaFilter: "Empresa",
  categoriaFilter: "Categoria",
  rubroFilter: "Rubro",
  cuentaFilter: "Cuenta",
  unidadFilter: "UnidadNegocio",
  dimensionFilter: "Dimension",
  productoFilter: "Producto",
  tipoDocFilter: "TipoDocumento"
};

const FIELD_LABELS = {
  Empresa: "Empresa",
  Categoria: "Categoria",
  Rubro: "Rubro",
  Cuenta: "Cuenta",
  UnidadNegocio: "Unidad de Negocio",
  Dimension: "Dimension",
  Producto: "Producto",
  TipoDocumento: "Tipo de documento",
  LineaPL: "Linea de P&L"
};

// Estructura del Estado de Resultados. Las lineas se alimentan de LineaPLId
// y los subtotales acumulan lineas previas ya calculadas.
const PL_LAYOUT = [
  { type: "header", label: "Ingresos" },
  { type: "line", id: "ingresos_venta", label: "Ingresos por Venta" },
  { type: "line", id: "ingresos_diferidos", label: "Ingresos Diferidos" },
  { type: "line", id: "otros_ingresos", label: "Otros Ingresos" },
  { type: "subtotal", id: "total_ingresos", label: "Total Ingresos", sum: ["ingresos_venta", "ingresos_diferidos", "otros_ingresos"] },

  { type: "header", label: "Costo de Servicios" },
  { type: "line", id: "rrhh", label: "Recursos Humanos" },
  { type: "line", id: "costos_directos", label: "Costos Directos" },
  { type: "subtotal", id: "margen_bruto", label: "Margen Bruto", sum: ["total_ingresos", "rrhh", "costos_directos"], strong: true },

  { type: "header", label: "Gastos Operativos" },
  { type: "line", id: "estructura", label: "Gastos de Estructura" },
  { type: "line", id: "comercializacion", label: "Gastos de Comercializacion" },
  { type: "subtotal", id: "resultado_operativo", label: "Resultado Operativo", sum: ["margen_bruto", "estructura", "comercializacion"], strong: true },

  { type: "header", label: "Otros Resultados" },
  { type: "line", id: "impuestos", label: "Impuestos" },
  { type: "line", id: "one_time", label: "One Time Costs" },
  { type: "line", id: "no_operativos", label: "No Operativos - Provisiones" },
  { type: "line", id: "financieros", label: "Resultados Financieros" },
  { type: "line", id: "no_clasificado", label: "No Clasificado" },
  { type: "subtotal", id: "resultado_neto", label: "Resultado Neto", sum: ["resultado_operativo", "impuestos", "one_time", "no_operativos", "financieros", "no_clasificado"], strong: true }
];

const PL_LINE_IDS = PL_LAYOUT.filter((r) => r.type === "line").map((r) => r.id);

// Pasos del puente de resultado (desde ingresos hasta resultado neto)
const BRIDGE_STEPS = [
  { id: "total_ingresos", label: "Ingresos" },
  { id: "rrhh", label: "RRHH" },
  { id: "costos_directos", label: "Costos Directos" },
  { id: "estructura", label: "Estructura" },
  { id: "comercializacion", label: "Comercializacion" },
  { id: "impuestos", label: "Impuestos" },
  { id: "one_time", label: "One Time" },
  { id: "no_operativos", label: "No Operativos" },
  { id: "financieros", label: "Financieros" },
  { id: "no_clasificado", label: "No Clasificado" }
];

const movementColumns = [
  { key: "Fecha", label: "Fecha" },
  { key: "Periodo", label: "Periodo" },
  { key: "Documento", label: "Documento" },
  { key: "Cuenta", label: "Cuenta" },
  { key: "Rubro", label: "Rubro" },
  { key: "UnidadNegocio", label: "Unidad" },
  { key: "Dimension", label: "Dimension" },
  { key: "Producto", label: "Producto" },
  { key: "Descripcion", label: "Descripcion" },
  { key: "Debe", label: "Debe", alignRight: true, format: (v) => (Number(v) ? currencyFmt.format(Number(v)) : "—") },
  { key: "Haber", label: "Haber", alignRight: true, format: (v) => (Number(v) ? currencyFmt.format(Number(v)) : "—") },
  { key: "ImporteNum", label: "Importe", alignRight: true, format: (v) => currencyFmt.format(Number(v || 0)) }
];

const movementColumnFilters = Object.fromEntries(movementColumns.map((c) => [c.key, ""]));

const currencyFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

// ── HELPERS ──────────────────────────────────────────────────────

function formatCompact(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return currencyFmt.format(value);
}

function formatPctOf(value, base, decimals = 1) {
  if (!base) return "—";
  return `${((value / base) * 100).toFixed(decimals)}%`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeSearchText(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderAssistantAnswer(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(?:<li>.*<\/li>\n?)+/g, (list) => `<ul>${list}</ul>`)
    .replace(/\n/g, "<br>");
}

function parseDateToTimestamp(value) {
  const s = String(value ?? "").trim();
  if (!s) return Number.NaN;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }
  const fallback = Date.parse(s);
  return Number.isFinite(fallback) ? fallback : Number.NaN;
}

function uniqueSorted(rows, key) {
  return [...new Set(rows.map((r) => r[key] || "Sin dato"))].sort((a, b) => String(a).localeCompare(String(b)));
}

function fillSelect(select, values) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

function periodInRange(period, from, to) {
  if (!period) return false;
  if (from && period < from) return false;
  if (to && period > to) return false;
  return true;
}

// ── CHART.JS SETUP ───────────────────────────────────────────────
Chart.defaults.color = "#64748b";
Chart.defaults.borderColor = "#e2e8f0";
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;
if (window.ChartDataLabels) Chart.register(window.ChartDataLabels);

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
    grid: { color: "#f1f5f9" },
    border: { color: "#e2e8f0" },
    ticks: { color: "#64748b" }
  }
};

const zeroReferencePlugin = {
  id: "zeroReferencePlugin",
  beforeDatasetsDraw(chart, _args, opts) {
    if (!opts?.enabled) return;
    const yScale = chart.scales[opts.scaleId || "y"];
    if (!yScale) return;
    const y = yScale.getPixelForValue(0);
    if (!Number.isFinite(y) || y < chart.chartArea.top || y > chart.chartArea.bottom) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = opts.color || "rgba(15,23,42,0.32)";
    ctx.lineWidth = opts.lineWidth || 1.4;
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.restore();
  }
};
Chart.register(zeroReferencePlugin);

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

// ── MULTI-SELECT WIDGET ──────────────────────────────────────────
const _msSel = new Map();

function buildMultiSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = _msSel.get(id) ?? new Set();
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
            <input type="checkbox" class="ms-item-cb" value="${escapeHtml(v)}"
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
  const el = document.getElementById(id);
  if (!el) return;
  const items = [...el.querySelectorAll(".ms-item-cb")];
  const allCb = el.querySelector(".ms-all-cb");
  const lbl = el.querySelector(".ms-lbl");
  const clearBtn = el.querySelector(".ms-clear");
  const chk = items.filter((c) => c.checked);

  if (chk.length === items.length) {
    lbl.textContent = "Todos";
    if (allCb) { allCb.checked = true; allCb.indeterminate = false; }
    _msSel.set(id, new Set());
    if (clearBtn) clearBtn.style.display = "none";
  } else if (chk.length === 0) {
    lbl.textContent = "Ninguno";
    if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    _msSel.set(id, new Set());
    if (clearBtn) clearBtn.style.display = "flex";
  } else {
    if (chk.length === 1) lbl.textContent = chk[0].value;
    else if (chk.length === 2) lbl.textContent = `${chk[0].value}, ${chk[1].value}`;
    else lbl.textContent = `${chk.length} seleccionados`;
    if (allCb) { allCb.checked = false; allCb.indeterminate = true; }
    _msSel.set(id, new Set(chk.map((c) => c.value)));
    if (clearBtn) clearBtn.style.display = "flex";
  }
}

function _bindMsEvents(id) {
  const el = document.getElementById(id);
  if (!el) return;
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
  el.querySelector(".ms-clear")?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearMultiFilter(id);
    _onMsChange(id);
  });
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
  searchInput?.addEventListener("input", () => _filterMsOpts(el));
  searchInput?.addEventListener("click", (e) => e.stopPropagation());
  searchInput?.addEventListener("keydown", (e) => { if (e.key === "Escape") el.classList.remove("ms-open"); });
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

function _onMsChange(skipId) {
  updateDependentFilters(skipId);
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

// ── FILTRADO ─────────────────────────────────────────────────────

function rowPassesFilters(row, skipId = null) {
  for (const [id, field] of Object.entries(FILTERS)) {
    if (id === skipId) continue;
    const selected = getMultiSelected(id);
    if (selected.size && !selected.has(row[field] || "Sin dato")) return false;
  }
  return true;
}

function applyFilters() {
  const from = els.fromPeriod.value;
  const to = els.toPeriod.value;

  state.filtered = state.rows.filter((r) => {
    if (!rowPassesFilters(r)) return false;
    if (state.queryFilterTerms.length && !rowMatchesQuery(r, state.queryFilterTerms)) return false;
    return periodInRange(r.Periodo, from, to);
  });

  renderFilterSummary();
  renderAll();
}

function renderFilterSummary() {
  if (!els.filterSummary) return;
  const active = Object.entries(FILTERS)
    .filter(([id]) => getMultiSelected(id).size)
    .map(([id, field]) => `${FIELD_LABELS[field]} (${getMultiSelected(id).size})`);
  els.filterSummary.textContent = active.length
    ? `Filtros activos: ${active.join(" · ")} · ${state.filtered.length} asientos`
    : `Sin filtros de dimension · ${state.filtered.length} asientos`;
}

function updateDependentFilters(skipId = null) {
  for (const [id, field] of Object.entries(FILTERS)) {
    if (id === skipId) continue;
    const values = uniqueSorted(state.rows.filter((r) => rowPassesFilters(r, id)), field);
    buildMultiSelect(id, values);
  }
}

function getQueryTerms(question) {
  const ignored = new Set(["para", "sobre", "entre", "hubo", "tiene", "como", "que", "los", "las", "por", "del", "una", "unos", "unas", "con", "sin", "desde", "hasta", "este", "esta", "estos", "estas", "cual", "cuanto"]);
  return (normalizeSearchText(question).match(/[a-z0-9]{3,}/g) || []).filter((t) => !ignored.has(t));
}

const MONTH_NUMBERS = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };

function rowMatchesQuery(row, terms) {
  const searchable = normalizeSearchText(Object.values(row).join(" "));
  return terms.some((term) => {
    if (term === "ingresos" || term === "ventas") return Number(row.ImporteNum || 0) >= 0;
    if (term === "egresos" || term === "gastos") return Number(row.ImporteNum || 0) < 0;
    if (MONTH_NUMBERS[term]) return String(row.Periodo || "").endsWith(`-${MONTH_NUMBERS[term]}`);
    return searchable.includes(term);
  });
}

// ── CALCULO DEL P&L ──────────────────────────────────────────────

// Devuelve { periods, byLine: {lineId: {periodo: valor, __total}}, subtotals }
function computePl(rows) {
  const periods = uniqueSorted(rows, "Periodo").filter((p) => p !== "Sin dato");
  const byLine = {};

  PL_LINE_IDS.forEach((id) => { byLine[id] = { __total: 0 }; });

  rows.forEach((row) => {
    const id = row.LineaPLId || "no_clasificado";
    if (!byLine[id]) byLine[id] = { __total: 0 };
    const p = row.Periodo || "Sin periodo";
    byLine[id][p] = (byLine[id][p] || 0) + row.ImporteNum;
    byLine[id].__total += row.ImporteNum;
  });

  const values = { ...byLine };
  PL_LAYOUT.filter((r) => r.type === "subtotal").forEach((sub) => {
    const acc = { __total: 0 };
    periods.forEach((p) => {
      acc[p] = sub.sum.reduce((total, id) => total + (values[id]?.[p] || 0), 0);
    });
    acc.__total = sub.sum.reduce((total, id) => total + (values[id]?.__total || 0), 0);
    values[sub.id] = acc;
  });

  return { periods, values };
}

function plTotals(rows) {
  const acc = { ingresos: 0, costos: 0, operativos: 0, otros: 0 };
  rows.forEach((r) => {
    const section = r.SeccionPL || "otros";
    acc[section] = (acc[section] || 0) + r.ImporteNum;
  });
  const margenBruto = acc.ingresos + acc.costos;
  const resultadoOperativo = margenBruto + acc.operativos;
  const resultadoNeto = resultadoOperativo + acc.otros;
  return { ...acc, margenBruto, resultadoOperativo, resultadoNeto };
}

// ── KPIs ─────────────────────────────────────────────────────────

function renderMetrics() {
  const t = plTotals(state.filtered);
  const base = t.ingresos;

  const cards = [
    { title: "Ingresos", value: t.ingresos, accent: "var(--green)", cls: "positive" },
    { title: "Costo de Servicios", value: t.costos, accent: "var(--red)", cls: "negative" },
    { title: "Margen Bruto", value: t.margenBruto, accent: "#0d9488", sub: formatPctOf(t.margenBruto, base) },
    { title: "Gastos Operativos", value: t.operativos, accent: "var(--red)", cls: "negative" },
    { title: "Resultado Operativo", value: t.resultadoOperativo, accent: "var(--blue-600)", sub: formatPctOf(t.resultadoOperativo, base) },
    { title: "Resultado Neto", value: t.resultadoNeto, accent: t.resultadoNeto >= 0 ? "var(--green)" : "var(--red)", sub: formatPctOf(t.resultadoNeto, base) }
  ];

  els.metrics.innerHTML = cards.map((c) => {
    const cls = c.cls || (c.value >= 0 ? "positive" : "negative");
    return `
      <article class="metric-card" style="--card-accent:${c.accent}">
        <p class="metric-title">${escapeHtml(c.title)}</p>
        <p class="metric-value ${cls}">${currencyFmt.format(c.value)}</p>
        ${c.sub ? `<p class="metric-sub">${escapeHtml(c.sub)} s/ ingresos</p>` : ""}
      </article>`;
  }).join("");
}

// ── TABLA DEL ESTADO DE RESULTADOS ───────────────────────────────

function renderPlTable() {
  const { periods, values } = computePl(state.filtered);

  if (!periods.length) {
    els.plTable.innerHTML = `<tbody><tr><td style="text-align:center;padding:28px;color:var(--text-400)">Sin datos para los filtros seleccionados</td></tr></tbody>`;
    return;
  }

  const ytd = state.plView.mode === "ytd";
  const showPct = state.plView.showPct;

  // Acumula por periodo cuando la vista es YTD
  const valueAt = (lineId, periodIndex) => {
    const line = values[lineId] || {};
    if (!ytd) return line[periods[periodIndex]] || 0;
    let acc = 0;
    for (let i = 0; i <= periodIndex; i++) acc += line[periods[i]] || 0;
    return acc;
  };

  const cell = (value, base, extraClass = "") => {
    if (!value) return `<td class="${extraClass}"><span class="pt-zero">—</span></td>`;
    const cls = value < 0 ? "negative" : "positive";
    const pct = showPct ? `<span class="pl-pct">${formatPctOf(value, base)}</span>` : "";
    return `<td class="${cls} ${extraClass}"><span class="pl-amount">${formatCompact(value)}</span>${pct}</td>`;
  };

  const header = `<tr>
    <th class="pt-label-th">Concepto</th>
    ${periods.map((p) => `<th>${escapeHtml(p)}</th>`).join("")}
    <th>Total</th>
  </tr>`;

  const rowsHtml = [];

  PL_LAYOUT.forEach((item) => {
    if (item.type === "header") {
      rowsHtml.push(`<tr class="pl-section-row"><td class="pt-label" colspan="${periods.length + 2}">${escapeHtml(item.label)}</td></tr>`);
      return;
    }

    const line = values[item.id] || {};
    const total = ytd ? valueAt(item.id, periods.length - 1) : (line.__total || 0);
    if (item.type === "line" && !total && !periods.some((p) => line[p])) return;

    const isSub = item.type === "subtotal";
    const rowClass = isSub ? (item.strong ? "pl-row pl-subtotal pl-subtotal-strong" : "pl-row pl-subtotal") : "pl-row";
    const expandable = !isSub;
    const isExpanded = state.expandedPlLines.has(item.id);

    const expBtn = expandable
      ? `<button class="pt-expand" data-pl-line="${escapeHtml(item.id)}" aria-label="Desglosar ${escapeHtml(item.label)}">
           <svg class="pt-arrow ${isExpanded ? "pt-open" : ""}" width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1.5 1l5 3-5 3V1z"/></svg>
         </button>`
      : `<span class="pt-expand-ph"></span>`;

    const tds = periods.map((_, idx) => {
      const base = valueAt("total_ingresos", idx);
      return cell(valueAt(item.id, idx), base);
    }).join("");

    const totalBase = ytd ? valueAt("total_ingresos", periods.length - 1) : (values.total_ingresos?.__total || 0);

    rowsHtml.push(`<tr class="${rowClass}">
      <td class="pt-label">${expBtn}<span>${escapeHtml(item.label)}</span></td>
      ${tds}
      ${cell(total, totalBase, "pt-total")}
    </tr>`);

    if (expandable && isExpanded) {
      rowsHtml.push(...renderPlLineDetail(item.id, periods, ytd, showPct));
    }
  });

  els.plTable.innerHTML = `<thead>${header}</thead><tbody>${rowsHtml.join("")}</tbody>`;
}

// Desglose de una linea del P&L a nivel cuenta contable
function renderPlLineDetail(lineId, periods, ytd, showPct) {
  const rows = state.filtered.filter((r) => (r.LineaPLId || "no_clasificado") === lineId);
  const byAccount = new Map();

  rows.forEach((r) => {
    const key = r.Cuenta || "Sin cuenta";
    if (!byAccount.has(key)) byAccount.set(key, { __total: 0 });
    const acc = byAccount.get(key);
    acc[r.Periodo] = (acc[r.Periodo] || 0) + r.ImporteNum;
    acc.__total += r.ImporteNum;
  });

  const sorted = [...byAccount.entries()].sort((a, b) => Math.abs(b[1].__total) - Math.abs(a[1].__total));

  return sorted.map(([name, acc]) => {
    const tds = periods.map((_, idx) => {
      let value;
      if (ytd) {
        value = 0;
        for (let i = 0; i <= idx; i++) value += acc[periods[i]] || 0;
      } else {
        value = acc[periods[idx]] || 0;
      }
      if (!value) return `<td><span class="pt-zero">—</span></td>`;
      const cls = value < 0 ? "negative" : "positive";
      const pct = showPct ? `<span class="pl-pct">${formatPctOf(value, acc.__total)}</span>` : "";
      return `<td class="${cls}"><span class="pl-amount">${formatCompact(value)}</span>${pct}</td>`;
    }).join("");

    const cls = acc.__total < 0 ? "negative" : "positive";
    return `<tr class="pl-row pl-detail-row">
      <td class="pt-label" style="padding-left:34px"><span class="pt-dot" style="background:var(--text-400)"></span><span>${escapeHtml(name)}</span></td>
      ${tds}
      <td class="${cls} pt-total"><strong>${formatCompact(acc.__total)}</strong></td>
    </tr>`;
  });
}

// ── PUENTE DE RESULTADO ──────────────────────────────────────────

function renderBridgeChart() {
  destroyChart("bridge");
  const canvas = document.getElementById("bridgeChart");
  if (!canvas) return;

  const { values } = computePl(state.filtered);
  const steps = BRIDGE_STEPS
    .map((s) => ({ label: s.label, value: values[s.id]?.__total || 0 }))
    .filter((s, idx) => idx === 0 || s.value !== 0);

  if (!steps.length || steps.every((s) => !s.value)) {
    canvas.getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  const labels = [...steps.map((s) => s.label), "Resultado Neto"];
  const bars = [];
  const colors = [];
  const borders = [];
  let running = 0;
  const runningAfter = [];

  steps.forEach((step) => {
    const start = running;
    running += step.value;
    bars.push([start, running]);
    colors.push(step.value >= 0 ? "rgba(5,150,105,0.68)" : "rgba(220,38,38,0.68)");
    borders.push(step.value >= 0 ? "#059669" : "#dc2626");
    runningAfter.push(running);
  });

  bars.push([0, running]);
  colors.push(running >= 0 ? "rgba(37,99,235,0.40)" : "rgba(220,38,38,0.40)");
  borders.push(running >= 0 ? "#2563eb" : "#dc2626");

  let minY = 0;
  let maxY = 0;
  bars.forEach(([a, b]) => {
    minY = Math.min(minY, a, b);
    maxY = Math.max(maxY, a, b);
  });
  const pad = Math.max(1, maxY - minY) * 0.12;

  state.charts.bridge = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Aporte",
        data: bars,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        categoryPercentage: 0.82,
        barPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        zeroReferencePlugin: { enabled: true, scaleId: "y" },
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              if (idx === steps.length) return ` Resultado Neto: ${currencyFmt.format(running)}`;
              return ` ${labels[idx]}: ${currencyFmt.format(steps[idx].value)}`;
            },
            afterBody: (items) => {
              const idx = items?.[0]?.dataIndex;
              if (idx == null || idx >= steps.length) return "";
              return `Acumulado: ${currencyFmt.format(runningAfter[idx])}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: "transparent" }, border: CHART_OPTS.scale.border, ticks: { color: "#334155", autoSkip: false, maxRotation: 32, minRotation: 20 } },
        y: { min: minY - pad, max: maxY + pad, grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) } }
      }
    }
  });
}

// ── EVOLUCION MENSUAL ────────────────────────────────────────────

function renderTrendChart() {
  destroyChart("trend");
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  const byPeriod = new Map();
  state.filtered.forEach((r) => {
    const p = r.Periodo || "Sin periodo";
    const acc = byPeriod.get(p) || { ingresos: 0, egresos: 0 };
    if (r.SeccionPL === "ingresos") acc.ingresos += r.ImporteNum;
    else acc.egresos += r.ImporteNum;
    byPeriod.set(p, acc);
  });

  const sorted = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b));
  const labels = sorted.map(([p]) => p);
  if (!labels.length) {
    canvas.getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  const ingresos = sorted.map(([, v]) => v.ingresos);
  const egresos = sorted.map(([, v]) => v.egresos);
  const resultado = sorted.map(([, v]) => v.ingresos + v.egresos);

  state.charts.trend = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Ingresos", data: ingresos, backgroundColor: "rgba(5,150,105,0.65)", borderColor: "#059669", borderWidth: 1, borderRadius: 3, yAxisID: "y", order: 3 },
        { label: "Egresos", data: egresos, backgroundColor: "rgba(220,38,38,0.55)", borderColor: "#dc2626", borderWidth: 1, borderRadius: 3, yAxisID: "y", order: 3 },
        {
          type: "line",
          label: "Resultado Neto",
          data: resultado,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.16)",
          borderWidth: 3,
          tension: 0.32,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: resultado.map((v) => (v >= 0 ? "#059669" : "#dc2626")),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          yAxisID: "y",
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      onClick: (_e, elements) => {
        if (!elements.length) return;
        openPeriodModal(labels[elements[0].index]);
      },
      plugins: {
        zeroReferencePlugin: { enabled: true, scaleId: "y" },
        legend: { display: true, position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12 } },
        datalabels: { display: false },
        tooltip: { ...CHART_OPTS.tooltip, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${currencyFmt.format(ctx.parsed.y)}` } }
      },
      scales: {
        x: { grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: CHART_OPTS.scale.ticks },
        y: { grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) } }
      }
    }
  });
}

// ── MARGENES % ───────────────────────────────────────────────────

function renderMarginChart() {
  destroyChart("margin");
  const canvas = document.getElementById("marginChart");
  if (!canvas) return;

  const byPeriod = new Map();
  state.filtered.forEach((r) => {
    const p = r.Periodo || "Sin periodo";
    const acc = byPeriod.get(p) || { ingresos: 0, costos: 0, operativos: 0, otros: 0 };
    acc[r.SeccionPL || "otros"] += r.ImporteNum;
    byPeriod.set(p, acc);
  });

  const sorted = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b));
  const labels = sorted.map(([p]) => p);
  if (!labels.length) {
    canvas.getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  const pct = (value, base) => (base ? (value / base) * 100 : null);
  const bruto = sorted.map(([, v]) => pct(v.ingresos + v.costos, v.ingresos));
  const operativo = sorted.map(([, v]) => pct(v.ingresos + v.costos + v.operativos, v.ingresos));
  const neto = sorted.map(([, v]) => pct(v.ingresos + v.costos + v.operativos + v.otros, v.ingresos));

  const line = (label, data, color) => ({
    label, data, borderColor: color, backgroundColor: `${color}22`,
    borderWidth: 2.4, tension: 0.32, pointRadius: 3, pointHoverRadius: 6, spanGaps: true
  });

  state.charts.margin = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        line("Margen Bruto %", bruto, "#0d9488"),
        line("Resultado Operativo %", operativo, "#2563eb"),
        line("Resultado Neto %", neto, "#7c3aed")
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        zeroReferencePlugin: { enabled: true, scaleId: "y" },
        legend: { display: true, position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12 } },
        datalabels: { display: false },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y == null ? "—" : `${ctx.parsed.y.toFixed(1)}%`}` }
        }
      },
      scales: {
        x: { grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: CHART_OPTS.scale.ticks },
        y: { grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => `${v}%` } }
      }
    }
  });
}

// ── COMPOSICION CONFIGURABLE ─────────────────────────────────────

function computeMetricValue(stat, metric) {
  const inflow = Number(stat.inflow || 0);
  const outflowAbs = Math.abs(Number(stat.outflow || 0));
  if (metric === "inflow") return inflow;
  if (metric === "outflow") return outflowAbs;
  if (metric === "turnover") return inflow + outflowAbs;
  return inflow + Number(stat.outflow || 0);
}

function renderCompositionChart() {
  destroyChart("composition");
  const canvas = document.getElementById("compositionChart");
  if (!canvas) return;

  const { groupBy, metric } = state.composition;
  const topN = Number(state.composition.topN || 0);

  if (els.compositionTitle) els.compositionTitle.textContent = `Composicion por ${FIELD_LABELS[groupBy] || groupBy}`;

  if (!state.filtered.length) {
    canvas.getContext("2d").clearRect(0, 0, 9999, 9999);
    if (els.compositionSubtitle) els.compositionSubtitle.textContent = "Sin datos para los filtros actuales";
    return;
  }

  const map = new Map();
  state.filtered.forEach((r) => {
    const key = r[groupBy] || "Sin dato";
    if (!map.has(key)) map.set(key, { inflow: 0, outflow: 0 });
    const acc = map.get(key);
    if (r.ImporteNum >= 0) acc.inflow += r.ImporteNum;
    else acc.outflow += r.ImporteNum;
  });

  let entries = [...map.entries()].map(([label, stat]) => ({
    label,
    net: stat.inflow + stat.outflow,
    metricValue: computeMetricValue(stat, metric)
  })).filter((e) => e.metricValue !== 0 || e.net !== 0);

  entries.sort((a, b) => Math.abs(b.metricValue) - Math.abs(a.metricValue));

  let ranked = topN > 0 ? entries.slice(0, topN) : entries;
  const rest = topN > 0 ? entries.slice(topN) : [];
  if (rest.length) {
    ranked = [...ranked, {
      label: "Otros",
      net: rest.reduce((t, e) => t + e.net, 0),
      metricValue: rest.reduce((t, e) => t + e.metricValue, 0)
    }];
  }

  const labels = ranked.map((r) => r.label);
  const deltas = ranked.map((r) => r.net);
  if (!labels.length) return;

  if (els.compositionSubtitle) {
    const metricLabel = { net: "neto", turnover: "volumen", inflow: "ingresos", outflow: "egresos" }[metric] || metric;
    els.compositionSubtitle.textContent = `${labels.length} categorias visibles - orden por ${metricLabel}`;
  }

  const bars = [];
  const colors = [];
  const borders = [];
  const runningAfter = [];
  let running = 0;

  deltas.forEach((delta) => {
    const start = running;
    running += delta;
    bars.push([start, running]);
    colors.push(delta >= 0 ? "rgba(5,150,105,0.68)" : "rgba(220,38,38,0.68)");
    borders.push(delta >= 0 ? "#059669" : "#dc2626");
    runningAfter.push(running);
  });

  bars.push([0, running]);
  colors.push("rgba(37,99,235,0.34)");
  borders.push("#2563eb");

  let minY = 0;
  let maxY = 0;
  bars.forEach(([a, b]) => { minY = Math.min(minY, a, b); maxY = Math.max(maxY, a, b); });
  const pad = Math.max(1, maxY - minY) * 0.12;

  state.charts.composition = new Chart(canvas, {
    type: "bar",
    data: {
      labels: [...labels, "Total filtrado"],
      datasets: [{
        label: "Aporte neto",
        data: bars,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        categoryPercentage: 0.82,
        barPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_e, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        if (idx >= labels.length) return;
        applyGroupFilter(groupBy, labels[idx]);
      },
      plugins: {
        zeroReferencePlugin: { enabled: true, scaleId: "y" },
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              if (idx === labels.length) return ` Total filtrado: ${currencyFmt.format(running)}`;
              return ` ${labels[idx]}: ${currencyFmt.format(deltas[idx])}`;
            },
            afterBody: (items) => {
              const idx = items?.[0]?.dataIndex;
              if (idx == null || idx >= labels.length) return "";
              return `Acumulado: ${currencyFmt.format(runningAfter[idx])}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: "transparent" }, border: CHART_OPTS.scale.border, ticks: { color: "#334155", autoSkip: false, maxRotation: 34, minRotation: 20 } },
        y: { min: minY - pad, max: maxY + pad, grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) } }
      }
    }
  });
}

function applyGroupFilter(field, value) {
  if (value === "Otros" || value === "Sin dato") return;
  const entry = Object.entries(FILTERS).find(([, f]) => f === field);
  if (!entry) return;
  const [id] = entry;
  const current = getMultiSelected(id);
  if (current.size === 1 && current.has(value)) clearMultiFilter(id);
  else setMultiSingle(id, value);
  _onMsChange(id);
}

// ── BARRAS HORIZONTALES (unidad de negocio / cuentas) ────────────

function renderHorizontalBar(chartName, canvasId, field, limit) {
  destroyChart(chartName);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const map = new Map();
  state.filtered.forEach((r) => {
    const key = r[field] || "Sin dato";
    map.set(key, (map.get(key) || 0) + r.ImporteNum);
  });

  const entries = [...map.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, limit);
  const labels = entries.map(([name]) => name);
  const valuesArr = entries.map(([, v]) => v);

  if (!labels.length) {
    canvas.getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  state.charts[chartName] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: valuesArr,
        backgroundColor: valuesArr.map((v) => (v < 0 ? "rgba(220,38,38,0.70)" : "rgba(5,150,105,0.70)")),
        borderColor: valuesArr.map((v) => (v < 0 ? "#dc2626" : "#059669")),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      onClick: (_e, elements) => {
        if (!elements.length) return;
        applyGroupFilter(field, labels[elements[0].index]);
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          display: (ctx) => {
            const sum = ctx.dataset.data.reduce((acc, v) => acc + Math.abs(Number(v || 0)), 0);
            if (!sum) return false;
            return Math.abs(Number(ctx.dataset.data[ctx.dataIndex] || 0)) / sum >= 0.08;
          },
          formatter: (value, ctx) => {
            const sum = ctx.dataset.data.reduce((acc, v) => acc + Math.abs(Number(v || 0)), 0);
            return sum ? `${((Math.abs(Number(value || 0)) / sum) * 100).toFixed(0)}%` : "";
          },
          color: "#0f172a",
          font: { weight: "700", size: 10 },
          anchor: "end",
          align: "right",
          offset: 2,
          clip: true
        },
        tooltip: { ...CHART_OPTS.tooltip, callbacks: { label: (ctx) => ` ${currencyFmt.format(ctx.parsed.x)}` } }
      },
      scales: {
        x: { grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) } },
        y: { grid: { color: "transparent" }, border: CHART_OPTS.scale.border, ticks: { color: "#334155", font: { size: 12 } } }
      }
    }
  });
}

// ── INGRESOS POR DIMENSION (apilado) ─────────────────────────────

const STACK_COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#f59e0b", "#db2777", "#0891b2", "#64748b"];

function renderDimensionTrendChart() {
  destroyChart("dimensionTrend");
  const canvas = document.getElementById("dimensionTrendChart");
  if (!canvas) return;

  const incomeRows = state.filtered.filter((r) => r.SeccionPL === "ingresos");
  const periods = uniqueSorted(incomeRows, "Periodo");

  if (!periods.length) {
    canvas.getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

  const totalsByDim = new Map();
  incomeRows.forEach((r) => {
    const key = r.Dimension || "Sin dimension";
    totalsByDim.set(key, (totalsByDim.get(key) || 0) + r.ImporteNum);
  });

  const top = [...totalsByDim.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const topSet = new Set(top);
  const groups = [...top, "Otras"];

  const matrix = new Map(groups.map((g) => [g, new Map()]));
  incomeRows.forEach((r) => {
    const key = topSet.has(r.Dimension) ? r.Dimension : "Otras";
    const bucket = matrix.get(key);
    bucket.set(r.Periodo, (bucket.get(r.Periodo) || 0) + r.ImporteNum);
  });

  const datasets = groups.map((g, i) => ({
    label: g,
    data: periods.map((p) => matrix.get(g).get(p) || 0),
    backgroundColor: STACK_COLORS[i % STACK_COLORS.length],
    borderWidth: 0,
    borderRadius: 2
  })).filter((d) => d.data.some((v) => v !== 0));

  state.charts.dimensionTrend = new Chart(canvas, {
    type: "bar",
    data: { labels: periods, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top", align: "end", labels: { boxWidth: 12, boxHeight: 12 } },
        datalabels: { display: false },
        tooltip: { ...CHART_OPTS.tooltip, callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${currencyFmt.format(ctx.parsed.y)}` } }
      },
      scales: {
        x: { stacked: true, grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: CHART_OPTS.scale.ticks },
        y: { stacked: true, grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) } }
      }
    }
  });
}

// ── MODAL DE PERIODO ─────────────────────────────────────────────

function renderModalWaterfall(rows, title) {
  destroyChart("modalWaterfall");
  const canvas = document.getElementById("movModalWaterfall");
  if (!canvas) return;

  if (els.movModalChartTitle) els.movModalChartTitle.textContent = `Aportes por Cuenta - ${title}`;

  const byAccount = new Map();
  rows.forEach((r) => {
    const key = r.Cuenta || "Sin cuenta";
    byAccount.set(key, (byAccount.get(key) || 0) + r.ImporteNum);
  });

  let items = [...byAccount.entries()].filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (items.length > 10) {
    const visible = items.slice(0, 10);
    const others = items.slice(10).reduce((sum, [, v]) => sum + v, 0);
    if (others !== 0) visible.push(["Otras cuentas", others]);
    items = visible;
  }

  const labels = items.map(([name]) => name);
  const deltas = items.map(([, v]) => v);

  if (!labels.length) {
    if (els.movModalChartWrap) els.movModalChartWrap.style.display = "none";
    return;
  }
  if (els.movModalChartWrap) els.movModalChartWrap.style.display = "block";

  const bars = [];
  const colors = [];
  const borders = [];
  let running = 0;
  deltas.forEach((delta) => {
    const start = running;
    running += delta;
    bars.push([start, running]);
    colors.push(delta >= 0 ? "rgba(5,150,105,0.68)" : "rgba(220,38,38,0.68)");
    borders.push(delta >= 0 ? "#059669" : "#dc2626");
  });
  bars.push([0, running]);
  colors.push("rgba(37,99,235,0.34)");
  borders.push("#2563eb");

  let minY = 0;
  let maxY = 0;
  bars.forEach(([a, b]) => { minY = Math.min(minY, a, b); maxY = Math.max(maxY, a, b); });
  const pad = Math.max(1, maxY - minY) * 0.14;

  state.charts.modalWaterfall = new Chart(canvas, {
    type: "bar",
    data: {
      labels: [...labels, "Resultado"],
      datasets: [{
        data: bars,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        categoryPercentage: 0.82,
        barPercentage: 0.92
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        zeroReferencePlugin: { enabled: true, scaleId: "y" },
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              if (idx === labels.length) return ` Resultado: ${currencyFmt.format(running)}`;
              return ` ${labels[idx]}: ${currencyFmt.format(deltas[idx])}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: "transparent" }, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, maxRotation: 40 } },
        y: { min: minY - pad, max: maxY + pad, grid: CHART_OPTS.scale.grid, border: CHART_OPTS.scale.border, ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) } }
      }
    }
  });
}

function openPeriodModal(period) {
  const rows = state.filtered.filter((r) => r.Periodo === period);
  if (!rows.length) return;

  const t = plTotals(rows);

  document.getElementById("movModalTitle").textContent = `P&L de ${period}`;
  document.getElementById("movModalSubtitle").textContent = `${rows.length} asientos`;

  document.getElementById("movModalSummary").innerHTML = [
    { label: "Ingresos", value: t.ingresos, cls: "positive" },
    { label: "Costo de Servicios", value: t.costos, cls: "negative" },
    { label: "Margen Bruto", value: t.margenBruto, cls: t.margenBruto >= 0 ? "positive" : "negative" },
    { label: "Resultado Operativo", value: t.resultadoOperativo, cls: t.resultadoOperativo >= 0 ? "positive" : "negative" },
    { label: "Resultado Neto", value: t.resultadoNeto, cls: t.resultadoNeto >= 0 ? "positive" : "negative" }
  ].map((c) => `
    <div class="mov-summary-chip">
      <span>${c.label}</span>
      <span class="${c.cls}">${currencyFmt.format(c.value)}</span>
    </div>`).join("");

  const sorted = [...rows].sort((a, b) => (parseDateToTimestamp(a.Fecha) - parseDateToTimestamp(b.Fecha)) || (b.ImporteNum - a.ImporteNum));

  document.getElementById("movModalBody").innerHTML = sorted.map((r) => `
    <tr>
      <td>${escapeHtml(r.Fecha)}</td>
      <td>${escapeHtml(r.Documento)}</td>
      <td>${escapeHtml(r.Cuenta)}</td>
      <td>${escapeHtml(r.Dimension)}</td>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.Descripcion || r.Detalle)}</td>
      <td class="importe ${r.ImporteNum < 0 ? "negative" : "positive"}">${currencyFmt.format(r.ImporteNum)}</td>
    </tr>`).join("");

  renderModalWaterfall(rows, period);

  document.getElementById("movModal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closePeriodModal() {
  destroyChart("modalWaterfall");
  document.getElementById("movModal").style.display = "none";
  document.body.style.overflow = "";
}

// ── TABLA DINAMICA ───────────────────────────────────────────────

function buildTree(rows) {
  const root = new Map();
  const order = state.pivotHierarchy;

  rows.forEach((r) => {
    const path = order.map((field) => r[field] || "Sin dato");
    const per = r.Periodo || "Sin periodo";
    let current = root;
    let keyPath = "";

    path.forEach((label, level) => {
      keyPath = keyPath ? `${keyPath} » ${label}` : label;
      if (!current.has(keyPath)) {
        current.set(keyPath, { label, key: keyPath, level, total: 0, periods: {}, children: new Map() });
      }
      const node = current.get(keyPath);
      node.total += r.ImporteNum;
      node.periods[per] = (node.periods[per] || 0) + r.ImporteNum;
      current = node.children;
    });
  });

  return root;
}

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

function renderPivotOrderHint() {
  if (!els.pivotOrderHint) return;
  const orderTxt = state.pivotHierarchy.map((f) => FIELD_LABELS[f] || f).join(" -> ");
  els.pivotOrderHint.textContent = `Click en > para desglosar - Orden actual: ${orderTxt}`;
}

function movePivotHierarchyField(index, direction) {
  const next = index + direction;
  if (next < 0 || next >= state.pivotHierarchy.length) return;
  const arr = [...state.pivotHierarchy];
  [arr[index], arr[next]] = [arr[next], arr[index]];
  state.pivotHierarchy = arr;
  state.expandedNodes.clear();
  renderPivotHierarchyControls();
  renderPivotOrderHint();
  renderPivotTable();
}

function renderPivotHierarchyControls() {
  if (!els.pivotHierarchyCards) return;
  els.pivotHierarchyCards.innerHTML = state.pivotHierarchy.map((field, idx) => {
    const label = FIELD_LABELS[field] || field;
    return `
      <div class="pivot-order-card" data-field="${escapeHtml(field)}">
        <span class="pivot-order-card-name">${escapeHtml(label)}</span>
        <div class="pivot-order-actions">
          <button type="button" class="pivot-order-btn" data-move="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} aria-label="Subir ${escapeHtml(label)}">&#8593;</button>
          <button type="button" class="pivot-order-btn" data-move="down" data-idx="${idx}" ${idx === state.pivotHierarchy.length - 1 ? "disabled" : ""} aria-label="Bajar ${escapeHtml(label)}">&#8595;</button>
        </div>
      </div>`;
  }).join("");

  els.pivotHierarchyCards.querySelectorAll(".pivot-order-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      movePivotHierarchyField(Number(btn.dataset.idx), btn.dataset.move === "up" ? -1 : 1);
    });
  });
}

function renderPivotTable() {
  const periods = uniqueSorted(state.filtered, "Periodo");
  const flat = flattenTree(buildTree(state.filtered));

  if (!flat.length) {
    els.pivotTable.innerHTML = `<tbody><tr><td colspan="${periods.length + 2}" style="text-align:center;padding:28px;color:var(--text-400)">Sin datos para los filtros seleccionados</td></tr></tbody>`;
    return;
  }

  let maxAbs = 1;
  flat.forEach((r) => periods.forEach((p) => {
    const v = Math.abs(r.periods[p] || 0);
    if (v > maxAbs) maxAbs = v;
  }));

  const grand = {};
  let grandTotal = 0;
  state.filtered.forEach((r) => {
    const p = r.Periodo || "Sin periodo";
    grand[p] = (grand[p] || 0) + r.ImporteNum;
    grandTotal += r.ImporteNum;
  });

  const header = `<tr>
    <th class="pt-label-th">Jerarquia</th>
    ${periods.map((p) => `<th>${escapeHtml(p)}</th>`).join("")}
    <th>Total</th>
  </tr>`;

  const body = flat.map((row) => {
    const isExpanded = state.expandedNodes.has(row.key);
    const indent = row.level * 22;
    const levelColor = ["var(--navy-900)", "var(--blue-600)", "#0d9488", "var(--text-500)"][row.level] ?? "var(--text-500)";

    const expBtn = row.hasChildren
      ? `<button class="pt-expand" data-key="${escapeHtml(row.key)}" style="color:${levelColor}">
           <svg class="pt-arrow ${isExpanded ? "pt-open" : ""}" width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1.5 1l5 3-5 3V1z"/></svg>
         </button>`
      : `<span class="pt-expand-ph"></span>`;

    const tds = periods.map((p) => {
      const v = row.periods[p] || 0;
      if (!v) return `<td><span class="pt-zero">—</span></td>`;
      const cls = v < 0 ? "negative" : "positive";
      const bar = ((Math.abs(v) / maxAbs) * 100).toFixed(1);
      const bgc = v < 0 ? "rgba(220,38,38,0.10)" : "rgba(5,150,105,0.10)";
      return `<td class="${cls}"><div class="pt-cell"><div class="pt-bar" style="width:${bar}%;background:${bgc}"></div><span>${formatCompact(v)}</span></div></td>`;
    }).join("");

    return `<tr class="pt-row pt-level-${row.level}" data-key="${escapeHtml(row.key)}">
      <td class="pt-label" style="padding-left:${10 + indent}px">
        ${expBtn}
        <span class="pt-dot" style="background:${levelColor}"></span>
        <span style="font-weight:${row.level === 0 ? 700 : 400}">${escapeHtml(row.label)}</span>
      </td>
      ${tds}
      <td class="${row.total < 0 ? "negative" : "positive"} pt-total"><strong>${formatCompact(row.total)}</strong></td>
    </tr>`;
  }).join("");

  const grandTds = periods.map((p) => {
    const v = grand[p] || 0;
    return `<td class="${v < 0 ? "negative" : "positive"} pt-total"><strong>${formatCompact(v)}</strong></td>`;
  }).join("");

  const grandRow = `<tr class="pt-grand-total">
    <td class="pt-label" style="padding-left:10px"><span class="pt-expand-ph"></span><span>TOTAL</span></td>
    ${grandTds}
    <td class="${grandTotal < 0 ? "negative" : "positive"} pt-total"><strong>${formatCompact(grandTotal)}</strong></td>
  </tr>`;

  els.pivotTable.innerHTML = `<thead>${header}</thead><tbody>${body}${grandRow}</tbody>`;
}

// ── TABLA DE ASIENTOS ────────────────────────────────────────────

function buildMovementsTableHeader() {
  if (!els.movementsHead) return;

  const sortArrow = state.movementsSort.direction === "desc" ? "\u2193" : "\u2191";

  const titleRow = `<tr>${movementColumns.map((c) => {
    const align = c.alignRight ? ' style="text-align:right"' : "";
    if (c.key === "Fecha") {
      return `<th${align}><button type="button" class="movements-sort-btn" data-sort-col="Fecha">${escapeHtml(c.label)} ${sortArrow}</button></th>`;
    }
    return `<th${align}>${escapeHtml(c.label)}</th>`;
  }).join("")}</tr>`;

  const filterRow = `<tr class="movements-filter-row">${movementColumns.map((c) => `
    <th><input class="movements-col-filter" type="text" data-col="${escapeHtml(c.key)}"
      value="${escapeHtml(movementColumnFilters[c.key] || "")}" placeholder="Filtrar"
      aria-label="Filtrar por ${escapeHtml(c.label)}" /></th>`).join("")}</tr>`;

  els.movementsHead.innerHTML = titleRow + filterRow;

  els.movementsHead.querySelectorAll(".movements-col-filter").forEach((input) => {
    input.addEventListener("input", () => {
      movementColumnFilters[input.dataset.col] = input.value || "";
      renderMovementsTable();
    });
  });

  els.movementsHead.querySelector(".movements-sort-btn")?.addEventListener("click", () => {
    state.movementsSort.direction = state.movementsSort.direction === "desc" ? "asc" : "desc";
    buildMovementsTableHeader();
    renderMovementsTable();
  });
}

function getMovementFilteredRows() {
  return state.filtered.filter((row) => movementColumns.every((col) => {
    const query = normalizeSearchText(movementColumnFilters[col.key]);
    if (!query) return true;
    const raw = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
    return normalizeSearchText(raw).includes(query);
  }));
}

const MAX_MOVEMENT_ROWS = 3000;

function renderMovementsTable() {
  if (!els.movementsBody) return;

  const filteredRows = getMovementFilteredRows();
  const activeColumnFilters = movementColumns
    .filter((c) => movementColumnFilters[c.key])
    .map((c) => `${c.label}: "${movementColumnFilters[c.key]}"`);
  if (state.queryFilterTerms.length) activeColumnFilters.push(`Consulta: "${state.queryFilterTerms.join(" ")}"`);

  if (els.movementAskScope) {
    els.movementAskScope.textContent = activeColumnFilters.length
      ? `Filtros activos: ${activeColumnFilters.join(" · ")}`
      : "Busca en todos los asientos que cumplen los filtros activos.";
  }

  if (!filteredRows.length) {
    els.movementsBody.innerHTML = `<tr><td colspan="${movementColumns.length}" style="text-align:center;padding:24px;color:var(--text-400)">Sin asientos para los filtros actuales</td></tr>`;
    return;
  }

  const dir = state.movementsSort.direction === "asc" ? 1 : -1;
  const sorted = [...filteredRows].sort((a, b) => {
    const ta = parseDateToTimestamp(a.Fecha);
    const tb = parseDateToTimestamp(b.Fecha);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return (ta - tb) * dir;
    return String(a.Periodo).localeCompare(String(b.Periodo)) * dir || b.ImporteNum - a.ImporteNum;
  });

  const visible = sorted.slice(0, MAX_MOVEMENT_ROWS);

  const body = visible.map((row) => `<tr>${movementColumns.map((col) => {
    const value = col.format ? col.format(row[col.key]) : String(row[col.key] ?? "");
    const isNegative = col.key === "ImporteNum" && Number(row.ImporteNum || 0) < 0;
    const cls = [col.alignRight ? "movements-right" : "", isNegative ? "negative" : ""].filter(Boolean).join(" ");
    return `<td class="${cls}">${escapeHtml(value)}</td>`;
  }).join("")}</tr>`).join("");

  const truncated = sorted.length > visible.length
    ? `<tr><td colspan="${movementColumns.length}" style="text-align:center;padding:14px;color:var(--text-400)">Mostrando ${visible.length} de ${sorted.length} asientos. Afina los filtros para ver el resto.</td></tr>`
    : "";

  els.movementsBody.innerHTML = body + truncated;
}

// ── CONSULTA IA ──────────────────────────────────────────────────

async function askAboutPl() {
  const question = els.movementQuestion?.value.trim();
  if (!question || !els.askMovementBtn || !els.movementAnswer) return;

  els.askMovementBtn.disabled = true;
  els.movementAnswer.textContent = "Consultando...";

  try {
    const rows = getMovementFilteredRows();
    const terms = getQueryTerms(question);
    const candidates = rows.filter((row) => rowMatchesQuery(row, terms));

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, rows: candidates.length ? candidates : rows })
    });
    const payload = await res.json();
    if (!res.ok) {
      const wait = res.status === 429 ? " Espera unos segundos antes de volver a consultar." : "";
      throw new Error(([payload.message, payload.detail].filter(Boolean).join(" ") || `Error HTTP ${res.status}`) + wait);
    }

    els.movementAnswer.innerHTML = renderAssistantAnswer(payload.answer);
    state.queryFilterTerms = terms;
    applyFilters();
    if (els.clearMovementQueryBtn) els.clearMovementQueryBtn.hidden = !terms.length;
  } catch (error) {
    els.movementAnswer.textContent = `No se pudo realizar la consulta: ${String(error.message || error)}`;
  } finally {
    window.setTimeout(() => { els.askMovementBtn.disabled = false; }, 3000);
  }
}

function toggleMovementAsk(open) {
  if (!els.movementAskPanel || !els.movementAskFab) return;
  els.movementAskPanel.hidden = !open;
  els.movementAskFab.setAttribute("aria-expanded", String(open));
  if (open) els.movementQuestion?.focus();
}

// ── EXPORTACION ──────────────────────────────────────────────────

function escapeCsv(value) {
  const str = value == null ? "" : String(value);
  return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function exportFilteredCsv() {
  if (!state.filtered.length) {
    els.status.textContent = "No hay filas para exportar con los filtros actuales.";
    return;
  }

  const columns = ["Fecha", "Periodo", "Documento", "TipoDocumento", "Empresa", "CodigoCuenta", "Cuenta", "Categoria", "Rubro", "LineaPL", "UnidadNegocio", "Dimension", "Producto", "Descripcion", "Detalle", "Debe", "Haber", "ImporteNum"];
  const csv = [
    columns.join(";"),
    ...state.filtered.map((row) => columns.map((col) => escapeCsv(row[col] ?? "")).join(";"))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  const a = document.createElement("a");
  a.href = url;
  a.download = `pyl_filtrado_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  els.status.textContent = `CSV exportado con ${state.filtered.length} filas.`;
}

// ── CARGA DE ARCHIVOS ────────────────────────────────────────────

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
  els.uploadBtn.textContent = "Procesando...";
  els.uploadBtn.disabled = true;
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
      const cols = payload.detectedColumns?.length ? ` Columnas detectadas: ${payload.detectedColumns.join(", ")}` : "";
      const detail = payload.detail ? ` (${payload.detail})` : "";
      throw new Error((payload.message || `Error HTTP ${res.status}`) + detail + cols);
    }

    await loadData();
    showBanner(`✓ Excel importado: ${payload.count} filas cargadas.`, "ok");
  } catch (error) {
    showBanner(`Error al importar: ${String(error)}`, "error");
  } finally {
    els.uploadBtn.textContent = "\u2191 Importar Excel";
    els.uploadBtn.disabled = false;
  }
}

async function resetUploadedSource() {
  try {
    const res = await fetch("/api/reset-upload", { method: "POST" });
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    els.excelFile.value = "";
    if (els.fileName) els.fileName.textContent = "Sin archivo seleccionado";
    hideBanner();
    await loadData();
  } catch (error) {
    showBanner(`No se pudo limpiar: ${String(error)}`, "error");
  }
}

// ── RENDER GLOBAL ────────────────────────────────────────────────

function renderStatus(source) {
  const now = new Date();
  const src = source === "filtrado" ? (els.sourceBadge?.textContent || "sin-datos") : source;
  els.status.textContent = `fuente: ${src} · ${now.toLocaleString("es-AR")} · ${state.filtered.length} asientos`;
  if (source !== "filtrado" && els.sourceBadge) els.sourceBadge.textContent = source;
}

function renderAll(source = "") {
  renderMetrics();
  renderPlTable();
  renderBridgeChart();
  renderTrendChart();
  renderMarginChart();
  renderCompositionChart();
  renderHorizontalBar("unidad", "unidadChart", "UnidadNegocio", 12);
  renderHorizontalBar("cuenta", "cuentaChart", "Cuenta", 12);
  renderDimensionTrendChart();
  renderPivotTable();
  renderMovementsTable();
  renderStatus(source || "filtrado");
}

function setupFilterOptions() {
  for (const [id, field] of Object.entries(FILTERS)) {
    buildMultiSelect(id, uniqueSorted(state.rows, field));
  }

  const periods = uniqueSorted(state.rows, "Periodo");
  fillSelect(els.fromPeriod, periods);
  fillSelect(els.toPeriod, periods);
  if (periods.length) {
    els.fromPeriod.value = periods[0];
    els.toPeriod.value = periods[periods.length - 1];
  }

  state.expandedNodes = new Set(uniqueSorted(state.rows, state.pivotHierarchy[0]));
}

// ── TABS ─────────────────────────────────────────────────────────

function setActiveTab(tabId) {
  state.activeTab = tabId;
  els.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("tab-btn-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  els.tabPanes.forEach((pane) => pane.classList.toggle("tab-pane-active", pane.id === tabId));
}

// ── EVENTOS ──────────────────────────────────────────────────────

function bindEvents() {
  els.tabButtons.forEach((btn) => btn.addEventListener("click", () => setActiveTab(btn.dataset.tab)));
  setActiveTab(state.activeTab);

  buildMovementsTableHeader();
  renderPivotHierarchyControls();
  renderPivotOrderHint();

  if (els.compositionGroupBy) els.compositionGroupBy.value = state.composition.groupBy;
  if (els.compositionMetric) els.compositionMetric.value = state.composition.metric;
  if (els.compositionTopN) els.compositionTopN.value = String(state.composition.topN);

  els.compositionGroupBy?.addEventListener("change", (e) => {
    state.composition.groupBy = e.target.value;
    renderCompositionChart();
  });
  els.compositionMetric?.addEventListener("change", (e) => {
    state.composition.metric = e.target.value;
    renderCompositionChart();
  });
  els.compositionTopN?.addEventListener("change", (e) => {
    state.composition.topN = Number(e.target.value || 0);
    renderCompositionChart();
  });

  els.plViewMode?.addEventListener("change", (e) => {
    state.plView.mode = e.target.value;
    renderPlTable();
  });
  els.plShowPct?.addEventListener("change", (e) => {
    state.plView.showPct = e.target.checked;
    renderPlTable();
  });

  [els.fromPeriod, els.toPeriod].forEach((el) => el?.addEventListener("change", applyFilters));

  els.refreshBtn?.addEventListener("click", () => loadData());
  els.clearFiltersBtn?.addEventListener("click", () => {
    Object.keys(FILTERS).forEach((id) => clearMultiFilter(id));
    state.queryFilterTerms = [];
    if (els.clearMovementQueryBtn) els.clearMovementQueryBtn.hidden = true;
    updateDependentFilters();
    applyFilters();
  });

  els.askMovementBtn?.addEventListener("click", askAboutPl);
  els.movementAskFab?.addEventListener("click", () => toggleMovementAsk(true));
  els.movementAskClose?.addEventListener("click", () => toggleMovementAsk(false));
  els.clearMovementQueryBtn?.addEventListener("click", () => {
    state.queryFilterTerms = [];
    els.clearMovementQueryBtn.hidden = true;
    applyFilters();
  });
  els.movementQuestion?.addEventListener("keydown", (e) => { if (e.key === "Enter") askAboutPl(); });

  els.uploadBtn?.addEventListener("click", () => uploadExcel());
  els.exportCsvBtn?.addEventListener("click", () => exportFilteredCsv());
  els.resetUploadBtn?.addEventListener("click", () => resetUploadedSource());
  els.excelFile?.addEventListener("change", () => uploadExcel());

  document.getElementById("expandAllBtn")?.addEventListener("click", () => {
    const addAll = (map) => map.forEach((node) => {
      if (node.children.size > 0) {
        state.expandedNodes.add(node.key);
        addAll(node.children);
      }
    });
    addAll(buildTree(state.filtered));
    renderPivotTable();
  });
  document.getElementById("collapseAllBtn")?.addEventListener("click", () => {
    state.expandedNodes.clear();
    renderPivotTable();
  });

  // Delegacion: expandir lineas del P&L
  els.plTable?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pl-line]");
    if (!btn) return;
    const id = btn.dataset.plLine;
    if (state.expandedPlLines.has(id)) state.expandedPlLines.delete(id);
    else state.expandedPlLines.add(id);
    renderPlTable();
  });

  // Delegacion: expandir nodos de la tabla dinamica
  els.pivotTable?.addEventListener("click", (e) => {
    const btn = e.target.closest(".pt-expand[data-key]");
    if (!btn) return;
    const key = btn.dataset.key;
    if (state.expandedNodes.has(key)) state.expandedNodes.delete(key);
    else state.expandedNodes.add(key);
    renderPivotTable();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ms")) {
      document.querySelectorAll(".ms.ms-open").forEach((w) => w.classList.remove("ms-open"));
    }
  });

  document.getElementById("movModalClose")?.addEventListener("click", closePeriodModal);
  document.getElementById("movModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closePeriodModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePeriodModal(); });
}

// ── CARGA ────────────────────────────────────────────────────────

async function loadData() {
  try {
    const res = await fetch("/api/movements");
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);

    const payload = await res.json();
    state.queryFilterTerms = [];
    if (els.clearMovementQueryBtn) els.clearMovementQueryBtn.hidden = true;
    state.rows = payload.rows || [];

    setupFilterOptions();
    applyFilters();
    renderStatus(payload.source || "desconocida");
  } catch (error) {
    els.status.textContent = `No se pudieron cargar datos: ${String(error)}`;
  }
}

bindEvents();
loadData();
