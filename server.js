import express from "express";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
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

app.get("/api/movements", async (req, res) => {
  if (uploadedRows !== null) {
    return res.json({ source: "uploaded-excel", rows: uploadedRows });
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
