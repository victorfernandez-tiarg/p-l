import express from "express";
import dotenv from "dotenv";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";
import xlsx from "xlsx";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const DEFAULT_XLSX = process.env.PYL_LOCAL_XLSX_PATH || path.resolve("data", "pyl.xlsx");
let uploadedRows = null;

app.use(express.json({ limit: "80mb" }));
app.use(express.static("public"));

// ── Normalizacion ────────────────────────────────────────────────
// El Mayor de P&L trae Debe/Haber. El criterio del dashboard es:
// Importe = Haber - Debe  →  ingresos positivos, egresos negativos.

function sanitizeRowKeys(row) {
  const clean = {};
  for (const key of Object.keys(row)) {
    const cleanKey = String(key).replace(/^[\uFEFF\u200B\u00A0\s]+|[\uFEFF\u200B\u00A0\s]+$/g, "");
    clean[cleanKey] = row[key];
  }
  return clean;
}

// Busca una clave ignorando mayusculas, acentos, espacios y BOM
function findKey(row, target) {
  const norm = (s) => String(s).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const t = norm(target);
  return Object.keys(row).find((k) => norm(k) === t) ?? null;
}

function get(row, ...candidates) {
  for (const candidate of candidates) {
    const found = findKey(row, candidate);
    if (found != null) return row[found] ?? "";
  }
  return "";
}

function toNumber(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const s = String(value).trim().replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return 0;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let normalized;

  if (dots > 1) normalized = s.replace(/\./g, "").replace(",", ".");
  else if (commas > 1) normalized = s.replace(/,/g, "");
  else if (dots === 1 && commas === 1) {
    normalized = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(".", "").replace(",", ".")
      : s.replace(",", "");
  } else if (commas === 1) normalized = s.replace(",", ".");
  else normalized = s;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function excelSerialToDmy(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

function normalizeFecha(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    return `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear()}`;
  }
  if (typeof value === "number" && value > 1000 && value < 100000) {
    return excelSerialToDmy(value);
  }
  return String(value).trim();
}

// Devuelve YYYY-MM a partir de "Año - mes" o, si falta, de la fecha
function normalizePeriodo(periodo, fecha) {
  const p = String(periodo ?? "").trim();
  if (/^\d{4}-\d{1,2}$/.test(p)) {
    const [y, m] = p.split("-");
    return `${y}-${m.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(p)) return p.slice(0, 7);

  const f = String(fecha ?? "").trim();
  const dmy = f.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}`;

  const iso = f.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  return p || "Sin periodo";
}

// Agrupa cada cuenta contable en una linea del Estado de Resultados
const PL_BUCKETS = [
  { test: /^1\.1/, id: "ingresos_venta", label: "Ingresos por Venta", section: "ingresos" },
  { test: /^1\.2/, id: "ingresos_diferidos", label: "Ingresos Diferidos", section: "ingresos" },
  { test: /otros ingresos/i, id: "otros_ingresos", label: "Otros Ingresos", section: "ingresos" },
  { test: /^2\.1/, id: "rrhh", label: "Recursos Humanos", section: "costos" },
  { test: /^2\.2/, id: "costos_directos", label: "Costos Directos", section: "costos" },
  { test: /costo de ventas/i, id: "costos_directos", label: "Costos Directos", section: "costos" },
  { test: /^2\.3/, id: "estructura", label: "Gastos de Estructura", section: "operativos" },
  { test: /^2\.4/, id: "comercializacion", label: "Gastos de Comercializacion", section: "operativos" },
  { test: /^2\.5/, id: "impuestos", label: "Impuestos", section: "otros" },
  { test: /^2\.7/, id: "one_time", label: "One Time Costs", section: "otros" },
  { test: /^2\.8/, id: "no_operativos", label: "No Operativos - Provisiones", section: "otros" },
  { test: /^3\./, id: "financieros", label: "Resultados Financieros", section: "otros" }
];

function classifyPl(rubro, categoria) {
  const bucket = PL_BUCKETS.find((b) => b.test.test(String(rubro || ""))) ||
    PL_BUCKETS.find((b) => b.test.test(String(categoria || "")));
  return bucket
    ? { id: bucket.id, label: bucket.label, section: bucket.section }
    : { id: "no_clasificado", label: "No Clasificado", section: "otros" };
}

function normalizeRows(jsonRows, rawRows = []) {
  return jsonRows.map((rawRow, index) => {
    const row = sanitizeRowKeys(rawRow);
    const raw = rawRows[index] ? sanitizeRowKeys(rawRows[index]) : null;

    // Los importes se leen del valor nativo de la celda cuando esta disponible
    const debe = toNumber(raw ? get(raw, "Debe") : get(row, "Debe"));
    const haber = toNumber(raw ? get(raw, "Haber") : get(row, "Haber"));
    const saldo = toNumber(raw ? get(raw, "Saldo mon. principal") : get(row, "Saldo mon. principal"));

    const fecha = normalizeFecha(raw ? (get(raw, "Fecha") || get(row, "Fecha")) : get(row, "Fecha"));
    const periodo = normalizePeriodo(get(row, "Año - mes", "Ano - mes", "Periodo"), fecha);
    const categoria = String(get(row, "Cuentarama2") || "Sin categoria").trim();
    const rubro = String(get(row, "Cuentarama3") || "Sin rubro").trim();
    const pl = classifyPl(rubro, categoria);

    return {
      Fecha: fecha,
      FechaComprobante: normalizeFecha(get(row, "Fecha comprobante")),
      Periodo: periodo,
      Documento: String(get(row, "Documento")).trim(),
      TipoDocumento: String(get(row, "Tipo de documento") || "Sin tipo").trim(),
      Comprobante: String(get(row, "Comprobante")).trim(),
      Empresa: String(get(row, "Empresa") || "Sin empresa").trim(),
      Moneda: String(get(row, "Moneda") || "Sin moneda").trim(),
      CodigoCuenta: String(get(row, "Codigo cuenta")).trim(),
      Cuenta: String(get(row, "Cuenta") || "Sin cuenta").trim(),
      Producto: String(get(row, "Producto") || "Sin producto").trim(),
      Dimension: String(get(row, "Dimensión valor", "Dimension valor") || "Sin dimension").trim(),
      UnidadNegocio: String(get(row, "Nivel1Dimension") || "Sin unidad").trim(),
      Descripcion: String(get(row, "Descripción", "Descripcion")).trim(),
      Detalle: String(get(row, "Detalle")).trim(),
      Grupo: String(get(row, "Cuentarama1") || "Sin grupo").trim(),
      Categoria: categoria,
      Rubro: rubro,
      LineaPL: pl.label,
      LineaPLId: pl.id,
      SeccionPL: pl.section,
      Debe: debe,
      Haber: haber,
      Saldo: saldo,
      ImporteNum: haber - debe
    };
  });
}

function parseWorkbook(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", codepage: 65001, cellDates: true });
  const sheetName = process.env.PYL_SHEET_NAME && workbook.SheetNames.includes(process.env.PYL_SHEET_NAME)
    ? process.env.PYL_SHEET_NAME
    : workbook.SheetNames[0];

  if (!sheetName) throw new Error("El archivo Excel no tiene hojas.");

  const sheet = workbook.Sheets[sheetName];
  const textRows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: true });

  const detectedColumns = textRows.length ? Object.keys(sanitizeRowKeys(textRows[0])) : [];
  return { rows: normalizeRows(textRows, rawRows), detectedColumns, sheetName };
}

// ── Endpoints de datos ───────────────────────────────────────────

app.post("/api/upload-excel", (req, res) => {
  const b64 = req.body?.file;
  if (!b64) return res.status(400).json({ message: "No se recibio archivo." });

  try {
    const { rows, detectedColumns, sheetName } = parseWorkbook(Buffer.from(b64, "base64"));
    uploadedRows = rows;

    if (rows.length === 0) {
      return res.status(400).json({
        source: "excel-subido",
        count: 0,
        detectedColumns,
        message: `La hoja "${sheetName}" se leyo pero no tiene filas. Columnas detectadas: ${detectedColumns.join(", ")}`
      });
    }

    return res.json({
      source: "excel-subido",
      count: rows.length,
      detectedColumns,
      message: `Excel cargado correctamente (hoja ${sheetName})`
    });
  } catch (error) {
    return res.status(400).json({ source: "error", message: "No se pudo leer el Excel.", detail: String(error) });
  }
});

app.post("/api/reset-upload", (_req, res) => {
  uploadedRows = null;
  return res.json({ source: "reset", message: "Fuente subida limpiada." });
});

async function readFromServiceAccount() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || await (async () => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    return meta.data.sheets?.[0]?.properties?.title ?? "Sheet1";
  })();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
    valueRenderOption: "FORMATTED_VALUE"
  });

  const [headers, ...dataRows] = response.data.values ?? [];
  if (!headers?.length) return [];

  const jsonRows = dataRows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[String(h).trim()] = row[i] ?? ""; });
    return obj;
  });

  return normalizeRows(jsonRows);
}

app.get("/api/movements", async (_req, res) => {
  if (uploadedRows !== null) {
    return res.json({ source: "excel-subido", rows: uploadedRows });
  }

  // Prioridad: Excel local del mayor de P&L
  try {
    await access(DEFAULT_XLSX);
    const buffer = await readFile(DEFAULT_XLSX);
    const { rows } = parseWorkbook(buffer);
    return res.json({ source: `excel-local (${path.basename(DEFAULT_XLSX)})`, rows });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return res.status(500).json({ source: "error", message: "Error leyendo el Excel local.", detail: String(error) });
    }
  }

  if (process.env.PYL_GOOGLE_SHEETS === "1" && process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    try {
      const rows = await readFromServiceAccount();
      return res.json({ source: "google-sheets-api", rows });
    } catch (error) {
      return res.status(500).json({ source: "error", message: "Error leyendo Google Sheets.", detail: String(error) });
    }
  }

  return res.json({ source: "sin-datos", rows: [] });
});

// ── Consulta IA ──────────────────────────────────────────────────

function buildPlSummary(rows) {
  const byLine = new Map();
  const byPeriod = new Map();
  let ingresos = 0;
  let costos = 0;
  let operativos = 0;
  let otros = 0;

  rows.forEach((row) => {
    const amount = Number(row.ImporteNum || 0);
    const line = row.LineaPL || "Sin linea";
    byLine.set(line, (byLine.get(line) || 0) + amount);

    const period = row.Periodo || "Sin periodo";
    const acc = byPeriod.get(period) || { ingresos: 0, egresos: 0, resultado: 0 };
    if (amount >= 0) acc.ingresos += amount; else acc.egresos += amount;
    acc.resultado += amount;
    byPeriod.set(period, acc);

    if (row.SeccionPL === "ingresos") ingresos += amount;
    else if (row.SeccionPL === "costos") costos += amount;
    else if (row.SeccionPL === "operativos") operativos += amount;
    else otros += amount;
  });

  const margenBruto = ingresos + costos;
  const resultadoOperativo = margenBruto + operativos;
  const resultadoNeto = resultadoOperativo + otros;

  return {
    filas: rows.length,
    ingresosTotales: ingresos,
    costoDeServicios: costos,
    margenBruto,
    margenBrutoPct: ingresos ? (margenBruto / ingresos) * 100 : 0,
    gastosOperativos: operativos,
    resultadoOperativo,
    resultadoOperativoPct: ingresos ? (resultadoOperativo / ingresos) * 100 : 0,
    otrosResultados: otros,
    resultadoNeto,
    resultadoNetoPct: ingresos ? (resultadoNeto / ingresos) * 100 : 0,
    porLinea: Object.fromEntries([...byLine.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))),
    porPeriodo: Object.fromEntries([...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
}

app.post("/api/ask", async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY;
  const question = String(req.body?.question || "").trim();
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

  if (!apiKey) {
    return res.status(503).json({ message: "La consulta IA no esta configurada. Define GROQ_API_KEY en .env." });
  }
  if (!question || question.length > 500) {
    return res.status(400).json({ message: "La pregunta es obligatoria y no puede superar 500 caracteres." });
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
  const monthNumbers = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };

  const rowMatchesTerm = (row, term) => {
    if (term === "ingresos" || term === "ventas") return Number(row.ImporteNum || 0) >= 0;
    if (term === "egresos" || term === "gastos") return Number(row.ImporteNum || 0) < 0;
    if (monthNumbers[term]) return String(row.Periodo || "").endsWith(`-${monthNumbers[term]}`);
    return Object.values(row).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
  };

  const stopWords = new Set(["para", "sobre", "entre", "hubo", "tiene", "como", "que", "los", "las", "por", "del", "una", "unos", "unas", "con", "sin", "desde", "hasta", "este", "esta", "estos", "estas", "cual", "cuanto"]);
  const terms = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]{3,}/g)?.filter((t) => !stopWords.has(t)) || [];

  const scored = rows.map((row, index) => ({
    row,
    index,
    score: terms.reduce((total, term) => total + (rowMatchesTerm(row, term) ? 1 : 0), 0)
  }));
  const matching = scored.filter((item) => item.score > 0);
  const globalSummary = buildPlSummary(rows);
  const relevantSummary = buildPlSummary(matching.length ? matching.map((i) => i.row) : rows);

  const compact = (matching.length ? matching : scored)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ row }) => ({
      fecha: row.Fecha || "",
      periodo: row.Periodo || "",
      linea: row.LineaPL || "",
      rubro: row.Rubro || "",
      cuenta: row.Cuenta || "",
      unidad: row.UnidadNegocio || "",
      dimension: row.Dimension || "",
      producto: row.Producto || "",
      detalle: row.Descripcion || row.Detalle || "",
      importe: Number(row.ImporteNum || 0)
    }));

  const context = [];
  let chars = 0;
  for (const row of compact) {
    const size = JSON.stringify(row).length + 1;
    if (context.length && chars + size > 8000) break;
    context.push(row);
    chars += size;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 500,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: "Eres un analista de control de gestion especializado en Estados de Resultados (P&L). Respondes en espanol usando exclusivamente los datos calculados y los asientos recibidos. Los totales ya fueron calculados por el sistema: no vuelvas a sumar la muestra ni estimes. Criterio de signo: importe = Haber - Debe, por lo tanto ingresos positivos y egresos negativos. No inventes datos; si no hay evidencia, dilo. Importes en formato argentino, por ejemplo $10.778.167,92. Responde breve y concreto."
          },
          {
            role: "user",
            content: `Pregunta: ${question}\n\nP&L calculado sobre los datos filtrados (fuente exacta):\n${JSON.stringify(globalSummary)}\n\nP&L de las coincidencias con la pregunta:\n${JSON.stringify(relevantSummary)}\n\nAsientos de apoyo (${context.length} de ${rows.length}):\n${JSON.stringify(context)}`
          }
        ]
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: payload.error?.message || "Groq rechazo la consulta." });
    }

    const message = payload.choices?.[0]?.message || {};
    const content = message.content;
    const answer = Array.isArray(content)
      ? content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("").trim()
      : (typeof content === "string" ? content.trim() : "");
    const fallback = typeof message.reasoning_content === "string" ? message.reasoning_content.trim() : "";

    if (!answer && !fallback) {
      return res.status(502).json({
        message: "Groq respondio correctamente, pero no envio texto.",
        detail: `finish_reason=${payload.choices?.[0]?.finish_reason || "desconocido"}`
      });
    }

    return res.json({ answer: answer || fallback });
  } catch (error) {
    return res.status(502).json({ message: "No se pudo conectar con Groq.", detail: error.message || String(error) });
  }
});

app.listen(port, () => {
  console.log(`Dashboard P&L disponible en http://localhost:${port}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[ERROR] El puerto ${port} ya esta en uso.`);
    console.error(`  -> Liberalo con: netstat -ano | findstr ":${port} "`);
  } else {
    throw err;
  }
  process.exit(1);
});
