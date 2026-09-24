import express from "express";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { google } from "googleapis";
import xlsx from "xlsx";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
let uploadedRows = null;

app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));

const sampleRows = [
  {
    Banco: "BAPRO",
    Fecha: "30/07/2026",
    "Suc. Origen": "",
    "Desc. Sucursal": "",
    "Cod. Operativo": "",
    Referencia: "",
    Concepto: "IMPUESTO DEBITO - LEY 25413",
    Importe: "-2,90",
    "Saldo Pesos": "330.594,11",
    Item: "Ley Debito",
    Original: "Ley Debito",
    Contabilizado: "resumen",
    Conciliado: "",
    "Cod. OperativoReferenciaConceptoImporte": "IMPUESTO DEBITO - LEY 25413-2,9",
    Periodo: "2026-07",
    "Rubro ITEM": "Impuestos",
    "Rubro Original": "Impuestos",
    "Agrupacion Item": "Operativo",
    "Agrupacion Original": "Operativo",
    Comentarios: ""
  },
  {
    Banco: "BAPRO",
    Fecha: "30/07/2026",
    "Suc. Origen": "",
    "Desc. Sucursal": "",
    "Cod. Operativo": "",
    Referencia: "",
    Concepto: "IMPUESTO DEBITO - LEY 25413",
    Importe: "-414,00",
    "Saldo Pesos": "330.597,01",
    Item: "Ley Debito",
    Original: "Ley Debito",
    Contabilizado: "resumen",
    Conciliado: "",
    "Cod. OperativoReferenciaConceptoImporte": "IMPUESTO DEBITO - LEY 25413-414",
    Periodo: "2026-07",
    "Rubro ITEM": "Impuestos",
    "Rubro Original": "Impuestos",
    "Agrupacion Item": "Operativo",
    "Agrupacion Original": "Operativo",
    Comentarios: ""
  },
  {
    Banco: "BAPRO",
    Fecha: "30/07/2026",
    "Suc. Origen": "",
    "Desc. Sucursal": "",
    "Cod. Operativo": "",
    Referencia: "",
    Concepto: "IMPUESTO I.BRUTOS - PERCEPCION",
    Importe: "-483,00",
    "Saldo Pesos": "331.011,01",
    Item: "Percepcion IVA",
    Original: "Percepcion IVA",
    Contabilizado: "resumen",
    Conciliado: "",
    "Cod. OperativoReferenciaConceptoImporte": "IMPUESTO I.BRUTOS - PERCEPCION-483",
    Periodo: "2026-07",
    "Rubro ITEM": "Impuestos",
    "Rubro Original": "Impuestos",
    "Agrupacion Item": "Operativo",
    "Agrupacion Original": "Operativo",
    Comentarios: ""
  }
];

// Limpia BOM y espacios invisibles de las claves del objeto fila
function sanitizeRowKeys(row) {
  const clean = {};
  for (const key of Object.keys(row)) {
    const cleanKey = key.replace(/^[\uFEFF\u200B\u00A0\s]+|[\uFEFF\u200B\u00A0\s]+$/g, "");
    clean[cleanKey] = row[key];
  }
  return clean;
}

// Busca una clave en el objeto ignorando mayúsculas, espacios y BOM
function findKey(row, target) {
  const t = target.toLowerCase().trim();
  return Object.keys(row).find((k) => k.toLowerCase().trim() === t) ?? null;
}

function get(row, key) {
  const found = findKey(row, key);
  return found != null ? (row[found] ?? "") : "";
}

function normalizeCsvRows(rows) {
  return rows.map((rawRow) => {
    const row = sanitizeRowKeys(rawRow);
    return {
      Banco: get(row, "Banco"),
      Fecha: get(row, "Fecha"),
      "Suc. Origen": get(row, "Suc. Origen"),
      "Desc. Sucursal": get(row, "Desc. Sucursal"),
      "Cod. Operativo": get(row, "Cod. Operativo"),
      Referencia: get(row, "Referencia"),
      Concepto: get(row, "Concepto"),
      Importe: get(row, "Importe") || "0",
      "Saldo Pesos": get(row, "Saldo Pesos") || "0",
      Item: get(row, "Item"),
      Original: get(row, "Original"),
      Contabilizado: get(row, "Contabilizado"),
      Conciliado: get(row, "Conciliado"),
      "Cod. OperativoReferenciaConceptoImporte": get(row, "Cod. OperativoReferenciaConceptoImporte"),
      Periodo: get(row, "Periodo"),
      "Rubro ITEM": get(row, "Rubro ITEM"),
      "Rubro Original": get(row, "Rubro Original"),
      "Agrupacion Item": get(row, "Agrupacion Item"),
      "Agrupacion Original": get(row, "Agrupacion Original"),
      Comentarios: get(row, "Comentarios")
    };
  });
}

function parseExcelBuffer(buffer) {
  const workbook = xlsx.read(buffer, { type: "buffer", codepage: 65001 });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("El archivo Excel no tiene hojas.");
  }

  const sheet = workbook.Sheets[sheetName];
  const jsonRows = xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
    dateNF: "dd/mm/yyyy"
  });

  const detectedColumns = jsonRows.length > 0
    ? Object.keys(sanitizeRowKeys(jsonRows[0]))
    : [];

  const normalized = normalizeCsvRows(jsonRows);
  return { rows: normalized, detectedColumns };
}

app.post("/api/upload-excel", (req, res) => {
  const b64 = req.body?.file;
  if (!b64) {
    return res.status(400).json({ message: "No se recibio archivo." });
  }

  try {
    const buffer = Buffer.from(b64, "base64");
    const { rows, detectedColumns } = parseExcelBuffer(buffer);
    uploadedRows = rows;

    if (rows.length === 0) {
      uploadedRows = [];
      return res.status(400).json({
        source: "uploaded-excel",
        count: 0,
        detectedColumns,
        message: "El Excel se leyo pero no tiene filas de datos. Columnas detectadas: " + detectedColumns.join(", ")
      });
    }

    return res.json({
      source: "uploaded-excel",
      count: rows.length,
      detectedColumns,
      message: "Excel cargado correctamente"
    });
  } catch (error) {
    return res.status(400).json({
      source: "error",
      message: "No se pudo leer el Excel.",
      detail: String(error)
    });
  }
});

app.post("/api/reset-upload", (req, res) => {
  uploadedRows = null;
  return res.json({ source: "reset", message: "Fuente subida limpiada." });
});

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
  const requestedModel = process.env.GROQ_MODEL;
  const model = requestedModel && !["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"].includes(requestedModel)
    ? requestedModel
    : "openai/gpt-oss-20b";
  const toNumber = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const text = String(value ?? "").replace(/[^\d,.-]/g, "").trim();
    if (!text) return 0;
    const normalized = text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : text;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  };
  const amountOf = (row) => toNumber(row.ImporteNum ?? row.Importe);
  const monthNumbers = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };
  const rowMatchesTerm = (row, term) => {
    if (term === "ingresos") return amountOf(row) >= 0;
    if (term === "egresos") return amountOf(row) < 0;
    if (monthNumbers[term]) return String(row.Periodo || "").endsWith(`-${monthNumbers[term]}`);
    return Object.values(row).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term);
  };
  const summarizeRows = (sourceRows) => {
    const byPeriod = new Map();
    let total = 0;
    let inflow = 0;
    let outflow = 0;
    sourceRows.forEach((row) => {
      const amount = amountOf(row);
      const period = row.Periodo || "Sin periodo";
      const current = byPeriod.get(period) || { ingresos: 0, egresos: 0, neto: 0, movimientos: 0 };
      if (amount >= 0) current.ingresos += amount;
      else current.egresos += amount;
      current.neto += amount;
      current.movimientos += 1;
      byPeriod.set(period, current);
      total += amount;
      if (amount >= 0) inflow += amount;
      else outflow += amount;
    });
    return {
      filas: sourceRows.length,
      importeNeto: total,
      ingresos: inflow,
      egresos: outflow,
      porPeriodo: Object.fromEntries([...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)))
    };
  };
  const calculatedData = summarizeRows(rows);
  const stopWords = new Set(["para", "sobre", "entre", "hubo", "tiene", "como", "que", "los", "las", "por", "del", "una", "unos", "unas", "con", "sin", "desde", "hasta", "este", "esta", "estos", "estas"]);
  const terms = question.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]{3,}/g)
    ?.filter((term) => !stopWords.has(term)) || [];
  const scoredRows = rows.map((row, index) => {
    const score = terms.reduce((total, term) => total + (rowMatchesTerm(row, term) ? 1 : 0), 0);
    return { row, index, score };
  });
  const matchingRows = scoredRows.filter((item) => item.score > 0);
  const relevantRows = matchingRows.length ? matchingRows.map((item) => item.row) : rows;
  const relevantData = summarizeRows(relevantRows);
  const selectedRows = (matchingRows.length ? matchingRows : scoredRows)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row);

  const compactRows = selectedRows.map((row) => ({
    fecha: row.Fecha || "",
    periodo: row.Periodo || "",
    banco: row.Banco || "",
    concepto: row.Concepto || "",
    agrupacion: row["Agrupacion Original"] || "",
    rubro: row["Rubro Original"] || "",
    original: row.Original || "",
    item: row.Item || "",
    importe: row.Importe || row.ImporteNum || "",
    comentarios: row.Comentarios || ""
  }));
  const context = [];
  let contextChars = 0;
  const maxContextChars = 8000;
  for (const row of compactRows) {
    const rowChars = JSON.stringify(row).length + 1;
    if (context.length && contextChars + rowChars > maxContextChars) break;
    context.push(row);
    contextChars += rowChars;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 450,
        reasoning_effort: "low",
        messages: [
          {
            role: "system",
            content: "Eres un analista de tesoreria. Responde en espanol usando exclusivamente los datos calculados y movimientos recibidos. Los datos calculados son la fuente exacta y ya fueron sumados por el sistema: no vuelvas a sumar una muestra ni estimes totales. No inventes datos. Si no hay evidencia suficiente, dilo. Para importes, respeta el signo y escribe formato argentino, por ejemplo $10.778.167,92. Responde de forma breve y concreta."
          },
          {
            role: "user",
            content: `Pregunta: ${question}\n\nDatos calculados por el dashboard (usar como fuente exacta):\n${JSON.stringify(calculatedData)}\n\nDatos calculados de coincidencias con la pregunta (usar si la pregunta pide ese concepto):\n${JSON.stringify(relevantData)}\n\nMovimientos de apoyo (${context.length} de ${rows.length} filtrados):\n${JSON.stringify(context)}`
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
      ? content.map((part) => typeof part === "string" ? part : part?.text || "").join("").trim()
      : (typeof content === "string" ? content.trim() : "");
    const fallback = typeof message.reasoning_content === "string"
      ? message.reasoning_content.trim()
      : (typeof payload.output_text === "string" ? payload.output_text.trim() : "");

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

// Lee la primera hoja del spreadsheet usando Service Account (sin OAuth, sin expiración)
async function readFromServiceAccount() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      // dotenv guarda los \n como literal; hay que convertirlos a saltos reales
      private_key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  // Obtiene el nombre de la primera pestaña (o usa la variable GOOGLE_SHEETS_SHEET_NAME si está seteada)
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || await (async () => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
    return meta.data.sheets?.[0]?.properties?.title ?? "Sheet1";
  })();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
    valueRenderOption: "FORMATTED_VALUE", // devuelve strings con el formato del cell, no seriales
  });

  const [headers, ...dataRows] = response.data.values ?? [];
  if (!headers?.length) return [];

  const jsonRows = dataRows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[String(h).trim()] = row[i] ?? ""; });
    return obj;
  });

  return normalizeCsvRows(jsonRows);
}

app.get("/api/movements", async (req, res) => {
  if (uploadedRows !== null) {
    return res.json({ source: "uploaded-excel", rows: uploadedRows });
  }

  // Service Account tiene prioridad sobre CSV público y archivo local
  if (process.env.GOOGLE_SHEETS_CLIENT_EMAIL && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    try {
      const rows = await readFromServiceAccount();
      return res.json({ source: "google-sheets-api", rows });
    } catch (error) {
      return res.status(500).json({
        source: "error",
        message: "Error leyendo Google Sheets via Service Account.",
        detail: String(error),
      });
    }
  }

  const localCsvPath = process.env.SHEETS_LOCAL_CSV_PATH;
  const csvUrl = process.env.SHEETS_CSV_URL;

  if (localCsvPath) {
    try {
      const csvText = await readFile(localCsvPath, "utf8");
      const parsed = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
      });

      return res.json({ source: "local-csv", rows: normalizeCsvRows(parsed) });
    } catch (error) {
      return res.status(500).json({
        source: "error",
        message: "Error leyendo CSV local. Revisar SHEETS_LOCAL_CSV_PATH.",
        detail: String(error)
      });
    }
  }

  if (!csvUrl) {
    return res.json({ source: "sample", rows: sampleRows });
  }

  try {
    const response = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error(`No se pudo descargar el CSV (${response.status})`);
    }

    const csvText = await response.text();
    const parsed = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });

    return res.json({ source: "google-sheets", rows: normalizeCsvRows(parsed) });
  } catch (error) {
    return res.status(500).json({
      source: "error",
      message: "Error leyendo Google Sheets. Revisar SHEETS_CSV_URL.",
      detail: String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`Dashboard disponible en http://localhost:${port}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[ERROR] El puerto ${port} ya está en uso.`);
    console.error(`  → Ejecutá en PowerShell para liberar el puerto:`);
    console.error(`    netstat -ano | findstr ":${port} " | Select-String "LISTENING" | ForEach-Object { $_.ToString().Trim().Split()[-1] } | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }\n`);
  } else {
    throw err;
  }
  process.exit(1);
});
