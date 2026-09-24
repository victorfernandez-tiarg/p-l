# Dashboard P&L (Estado de Resultados)

Dashboard web para analizar el mayor contable de resultados con foco en P&L: margen bruto, resultado operativo y resultado neto por periodo, unidad de negocio, dimension y cuenta.

## Criterio de calculo

- `Importe = Haber - Debe`. Los **ingresos quedan positivos** y los **egresos negativos**.
- Cada cuenta se clasifica en una linea del Estado de Resultados usando `Cuentarama3` (y `Cuentarama2` como respaldo):

| Prefijo | Linea del P&L | Seccion |
|---|---|---|
| `1.1` | Ingresos por Venta | Ingresos |
| `1.2` | Ingresos Diferidos | Ingresos |
| `Otros Ingresos` | Otros Ingresos | Ingresos |
| `2.1` | Recursos Humanos | Costo de Servicios |
| `2.2` / `Costo de Ventas` | Costos Directos | Costo de Servicios |
| `2.3` | Gastos de Estructura | Gastos Operativos |
| `2.4` | Gastos de Comercializacion | Gastos Operativos |
| `2.5` | Impuestos | Otros Resultados |
| `2.7` | One Time Costs | Otros Resultados |
| `2.8` | No Operativos - Provisiones | Otros Resultados |
| `3.x` | Resultados Financieros | Otros Resultados |

Subtotales: `Margen Bruto = Ingresos + Costo de Servicios`, `Resultado Operativo = Margen Bruto + Gastos Operativos`, `Resultado Neto = Resultado Operativo + Otros Resultados`.

## Que incluye

- **KPIs**: ingresos, costo de servicios, margen bruto, gastos operativos, resultado operativo y resultado neto (con % sobre ingresos).
- **Estado de Resultados por periodo**: vista mensual o acumulada (YTD), opcion de mostrar % sobre ingresos y desglose por cuenta contable de cada linea.
- **Puente de resultado** (waterfall) desde ingresos hasta resultado neto.
- **Evolucion mensual**: ingresos vs egresos con la linea de resultado neto; click en un mes abre el detalle de asientos de ese periodo.
- **Margenes %** mensuales (bruto, operativo, neto).
- **Analisis**: composicion configurable (rubro, linea de P&L, cuenta, unidad de negocio, dimension, producto, tipo de documento), resultado por unidad de negocio, top cuentas e ingresos por dimension apilados.
- **Tabla dinamica** con jerarquia reordenable.
- **Detalle de asientos** con filtro por columna y exportacion a CSV.
- **Consulta IA** opcional sobre los asientos filtrados (Groq).

## Columnas esperadas del Excel

Hoja del mayor de P&L (por defecto la primera hoja del archivo):

`Fecha`, `Documento`, `Tipo de documento`, `Producto`, `Codigo cuenta`, `Cuenta`, `Dimensión valor`, `Descripción`, `Detalle`, `Empresa`, `Comprobante`, `Moneda`, `Debe`, `Haber`, `Saldo mon. principal`, `Año - mes`, `Fecha comprobante`, `Cuentarama1`, `Cuentarama2`, `Cuentarama3`, `Nivel1Dimension`

## Fuentes de datos

Prioridad de carga en `/api/movements`:

1. Excel subido desde la UI (boton **Importar Excel**).
2. Excel local: `data/pyl.xlsx` (configurable con `PYL_LOCAL_XLSX_PATH`).
3. Google Sheets via Service Account, solo si `PYL_GOOGLE_SHEETS=1`.

## Ejecutar local

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Variables de entorno

```bash
PORT=3000
PYL_LOCAL_XLSX_PATH=./data/pyl.xlsx   # opcional
PYL_SHEET_NAME=hoja1                  # opcional, por defecto la primera hoja

# Consulta IA (opcional)
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-20b

# Google Sheets (opcional, requiere PYL_GOOGLE_SHEETS=1)
PYL_GOOGLE_SHEETS=1
GOOGLE_SHEETS_CLIENT_EMAIL=...
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SHEETS_SHEET_NAME=...
```

## Notas

- `_backup_cashflow/` conserva el codigo del dashboard de cashflow del que se partio.
- `.env` esta en `.gitignore`: nunca subas credenciales al repositorio.
