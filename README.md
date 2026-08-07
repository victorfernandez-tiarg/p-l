# Dashboard Cashflow Historico

Dashboard web para analizar movimientos bancarios unificados desde Google Sheets con foco en cashflow historico.

## Que incluye

- Filtros jerarquicos: Agrupacion Original -> Rubro Original -> Original -> Item.
- Filtro por Banco y rango de Periodo.
- KPIs: Importe neto, ingresos, egresos y cantidad de movimientos.
- Grafico de tendencia mensual por Periodo.
- Grafico de distribucion por Rubro Original.
- Tabla dinamica por periodo y nivel de jerarquia.
- Endpoint `/api/movements` para cargar datos desde Google Sheets o muestra local.

## Estructura esperada de columnas

La hoja debe contener, al menos, estas columnas:

- `Banco`
- `Fecha`
- `Concepto`
- `Importe`
- `Saldo Pesos`
- `Item`
- `Original`
- `Periodo` (formato `YYYY-MM`)
- `Rubro Original`
- `Agrupacion Original`

## Ejecutar local

```bash
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Probar local con tus datos (sin Railway)

1. Crear un archivo `.env` en la raiz del proyecto (copiando `.env.example`).
2. Elegir una sola fuente de datos:

Opcion A - Google Sheets por URL CSV:

```bash
SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/e/TU_HOJA/pub?output=csv
```

Opcion B - Archivo CSV local (recomendado para pruebas privadas):

```bash
SHEETS_LOCAL_CSV_PATH=./data/movimientos.csv
```

3. Ejecutar:

```bash
npm run dev
```

Notas:

- Si defines `SHEETS_LOCAL_CSV_PATH`, el backend usa ese archivo primero.
- Si no hay variables, el dashboard muestra los datos de ejemplo.

## Cargar Excel local desde el dashboard

Tambien puedes cargar un archivo Excel sin configurar variables:

1. Levantar la app con `npm run dev`.
2. Abrir el dashboard y usar "Cargar Excel local (.xlsx o .xls)".
3. Click en "Subir Excel".
4. El dashboard pasa a usar esa fuente (source: `uploaded-excel`) hasta reiniciar servidor o presionar "Volver a fuente base".

Requisito:

- La primera hoja del Excel debe tener los encabezados esperados (Banco, Fecha, Importe, Periodo, Rubro Original, Agrupacion Original, Original, Item, etc.).

## Conectar Google Sheets

1. Publicar la hoja como CSV o usar una URL CSV accesible.
2. Definir la variable de entorno:

```bash
SHEETS_CSV_URL="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
```

3. Reiniciar la app.

## Deploy en Railway

1. Subir este proyecto a GitHub.
2. Crear un proyecto en Railway desde el repo.
3. Variables de entorno:
   - `SHEETS_CSV_URL`: URL CSV de Google Sheets.
4. Railway detecta `npm start` automaticamente.

## Nota de seguridad

Si la hoja no puede ser publica, usar un backend con Service Account de Google y no exponer credenciales en frontend.
