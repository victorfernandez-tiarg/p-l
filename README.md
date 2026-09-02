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

## Consultar movimientos con Groq

La pestaña "Detalle de movimientos" incluye una consulta opcional con Groq. La clave se usa únicamente en el backend y nunca se envía al navegador.

1. Crear una cuenta en Groq y generar una API key desde su consola.
2. Agregar estas variables al archivo `.env`:

```bash
GROQ_API_KEY=tu_clave_de_groq
GROQ_MODEL=llama-3.1-8b-instant
```

3. Reiniciar la app y aplicar los filtros del dashboard antes de preguntar.

La consulta busca primero coincidencias en los movimientos que quedan en los filtros activos y envía a Groq ese contexto relevante. Si no encuentra coincidencias, usa los movimientos filtrados. No se recomienda usar esta función con datos sensibles sin revisar la política de privacidad de Groq. El acceso gratuito está sujeto a límites y disponibilidad de Groq; no es un servicio ilimitado.

## Deploy en Railway

1. Subir este proyecto a GitHub.
2. Crear un proyecto en Railway desde el repo.
3. En Railway, abrir **Variables** y agregar:
   - `SHEETS_CSV_URL`: URL CSV de Google Sheets, si esa es la fuente usada.
   - `GROQ_API_KEY`: API key de Groq para habilitar las consultas.
   - `GROQ_MODEL`: opcional; por defecto `llama-3.1-8b-instant`.
4. Railway detecta `npm start` automaticamente y asigna el puerto mediante `PORT`.
5. Hacer un nuevo deploy o reiniciar el servicio después de guardar las variables.

No subas `.env` a GitHub. En Railway las variables se configuran desde **Variables** y la clave no queda expuesta en el frontend.

## Nota de seguridad

Si la hoja no puede ser publica, usar un backend con Service Account de Google y no exponer credenciales en frontend.
