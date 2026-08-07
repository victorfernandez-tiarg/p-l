const state = {
  rows: [],
  filtered: [],
  trendChart: null,
  rubroChart: null,
  agrupacionChart: null
};

const els = {
  bankFilter: document.getElementById("bankFilter"),
  agrupacionFilter: document.getElementById("agrupacionFilter"),
  rubroFilter: document.getElementById("rubroFilter"),
  originalFilter: document.getElementById("originalFilter"),
  itemFilter: document.getElementById("itemFilter"),
  fromPeriod: document.getElementById("fromPeriod"),
  toPeriod: document.getElementById("toPeriod"),
  rowLevel: document.getElementById("rowLevel"),
  excelFile: document.getElementById("excelFile"),
  uploadBtn: document.getElementById("uploadBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  resetUploadBtn: document.getElementById("resetUploadBtn"),
  uploadBanner: document.getElementById("uploadBanner"),
  fileName: document.getElementById("fileName"),
  sourceBadge: document.getElementById("sourceBadge"),
  metrics: document.getElementById("metrics"),
  pivotTable: document.getElementById("pivotTable"),
  status: document.getElementById("status"),
  refreshBtn: document.getElementById("refreshBtn")
};

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

function applyFilters() {
  const selectedBank = els.bankFilter.value;
  const selectedAgr = els.agrupacionFilter.value;
  const selectedRubro = els.rubroFilter.value;
  const selectedOriginal = els.originalFilter.value;
  const selectedItem = els.itemFilter.value;
  const fromPeriod = els.fromPeriod.value;
  const toPeriod = els.toPeriod.value;

  state.filtered = state.rows.filter((r) => {
    if (selectedBank !== "__ALL__" && (r.Banco || "Sin dato") !== selectedBank) return false;
    if (selectedAgr !== "__ALL__" && (r["Agrupacion Original"] || "Sin dato") !== selectedAgr) return false;
    if (selectedRubro !== "__ALL__" && (r["Rubro Original"] || "Sin dato") !== selectedRubro) return false;
    if (selectedOriginal !== "__ALL__" && (r.Original || "Sin dato") !== selectedOriginal) return false;
    if (selectedItem !== "__ALL__" && (r.Item || "Sin dato") !== selectedItem) return false;
    return periodInRange(r.Periodo, fromPeriod, toPeriod);
  });

  renderAll();
}

function updateDependentFilters() {
  const selectedAgr = els.agrupacionFilter.value;
  const selectedRubro = els.rubroFilter.value;
  const selectedOriginal = els.originalFilter.value;

  const rowsAfterAgr = state.rows.filter((r) => {
    if (selectedAgr === "__ALL__") return true;
    return (r["Agrupacion Original"] || "Sin dato") === selectedAgr;
  });

  fillSelect(els.rubroFilter, uniqueSorted(rowsAfterAgr, "Rubro Original"));

  const rowsAfterRubro = rowsAfterAgr.filter((r) => {
    if (selectedRubro === "__ALL__") return true;
    return (r["Rubro Original"] || "Sin dato") === selectedRubro;
  });

  fillSelect(els.originalFilter, uniqueSorted(rowsAfterRubro, "Original"));

  const rowsAfterOriginal = rowsAfterRubro.filter((r) => {
    if (selectedOriginal === "__ALL__") return true;
    return (r.Original || "Sin dato") === selectedOriginal;
  });

  fillSelect(els.itemFilter, uniqueSorted(rowsAfterOriginal, "Item"));
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
          order: 2
        },
        {
          type: "line",
          label: "Neto",
          data: neto,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.06)",
          fill: false,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: neto.map((v) => v >= 0 ? "#059669" : "#dc2626"),
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { color: "#64748b", boxWidth: 12, boxHeight: 12, font: { size: 11 } }
        },
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
        y: {
          grid: CHART_OPTS.scale.grid,
          border: CHART_OPTS.scale.border,
          ticks: { ...CHART_OPTS.scale.ticks, callback: (v) => formatCompact(v) }
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
        // Si ya estaba seleccionado, deselecciona
        if (els.rubroFilter.value === rubro) {
          els.rubroFilter.value = "__ALL__";
        } else {
          els.rubroFilter.value = rubro;
        }
        updateDependentFilters();
        applyFilters();
      },
      plugins: {
        legend: { display: false },
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

// Donut de composicion por Agrupacion, clickeable
function renderAgrupacionChart() {
  if (state.agrupacionChart) { state.agrupacionChart.destroy(); state.agrupacionChart = null; }

  const map = new Map();
  state.filtered.forEach((r) => {
    const key = r["Agrupacion Original"] || "Sin dato";
    map.set(key, (map.get(key) || 0) + Math.abs(r.ImporteNum));
  });

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const labels  = entries.map(([k]) => k);
  const values  = entries.map(([, v]) => v);
  const total   = values.reduce((s, v) => s + v, 0);

  if (!labels.length) {
    const el = document.getElementById("agrupacionChart");
    if (el) el.getContext("2d").clearRect(0, 0, 9999, 9999);
    return;
  }

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
        const agr = labels[elements[0].index];
        if (els.agrupacionFilter.value === agr) {
          els.agrupacionFilter.value = "__ALL__";
        } else {
          els.agrupacionFilter.value = agr;
        }
        updateDependentFilters();
        applyFilters();
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#334155", boxWidth: 12, boxHeight: 12, font: { size: 11 }, padding: 10 }
        },
        tooltip: {
          ...CHART_OPTS.tooltip,
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${formatCompact(ctx.parsed)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

function buildPivot(levelField) {
  const periods = uniqueSorted(state.filtered, "Periodo");
  const map = new Map();

  state.filtered.forEach((r) => {
    const parts = [];
    for (const field of hierarchyFields) {
      parts.push(r[field] || "Sin dato");
      if (field === levelField) break;
    }

    const key = parts.join(" > ");
    if (!map.has(key)) {
      map.set(key, { label: key, total: 0, periods: {} });
    }

    const row = map.get(key);
    row.total += r.ImporteNum;
    row.periods[r.Periodo] = (row.periods[r.Periodo] || 0) + r.ImporteNum;
  });

  const rows = [...map.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return { periods, rows };
}

function renderPivotTable() {
  const levelField = els.rowLevel.value;
  const { periods, rows } = buildPivot(levelField);

  const header = ["<tr><th>Jerarquia</th>"]
    .concat(periods.map((p) => `<th>${p}</th>`))
    .concat(["<th>Total</th></tr>"])
    .join("");

  const body = rows
    .map((r) => {
      const tds = periods
        .map((p) => {
          const value = r.periods[p] || 0;
          const cls = value < 0 ? "negative" : "positive";
          return `<td class="${cls}">${currencyFmt.format(value)}</td>`;
        })
        .join("");

      const totalCls = r.total < 0 ? "negative" : "positive";
      return `<tr><td>${escapeHtml(r.label)}</td>${tds}<td class="${totalCls}"><strong>${currencyFmt.format(r.total)}</strong></td></tr>`;
    })
    .join("");

  const emptyRow = !rows.length
    ? `<tr><td colspan="${periods.length + 2}" style="text-align:center;color:var(--muted);padding:20px">Sin datos para los filtros seleccionados</td></tr>`
    : "";

  els.pivotTable.innerHTML = `<thead>${header}</thead><tbody>${body || emptyRow}</tbody>`;
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
  renderRubroChart();
  renderAgrupacionChart();
  renderPivotTable();
  renderStatus(source || "filtrado");
}

function setupFilterOptions() {
  fillSelect(els.bankFilter, uniqueSorted(state.rows, "Banco"));
  fillSelect(els.agrupacionFilter, uniqueSorted(state.rows, "Agrupacion Original"));
  fillSelect(els.rubroFilter, uniqueSorted(state.rows, "Rubro Original"));
  fillSelect(els.originalFilter, uniqueSorted(state.rows, "Original"));
  fillSelect(els.itemFilter, uniqueSorted(state.rows, "Item"));

  const periods = uniqueSorted(state.rows, "Periodo");
  fillSelect(els.fromPeriod, periods, false);
  fillSelect(els.toPeriod, periods, false);

  if (periods.length) {
    els.fromPeriod.value = periods[0];
    els.toPeriod.value = periods[periods.length - 1];
  }
}

function bindEvents() {
  [
    els.bankFilter,
    els.agrupacionFilter,
    els.rubroFilter,
    els.originalFilter,
    els.itemFilter,
    els.fromPeriod,
    els.toPeriod,
    els.rowLevel
  ].forEach((el) => {
    el.addEventListener("change", () => {
      if (el === els.agrupacionFilter || el === els.rubroFilter || el === els.originalFilter) {
        updateDependentFilters();
      }
      applyFilters();
    });
  });

  els.refreshBtn.addEventListener("click", () => loadData());
  els.uploadBtn?.addEventListener("click", () => uploadExcel());
  els.exportCsvBtn.addEventListener("click", () => exportFilteredCsv());
  els.resetUploadBtn.addEventListener("click", () => resetUploadedSource());
  els.excelFile.addEventListener("change", () => uploadExcel());
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
