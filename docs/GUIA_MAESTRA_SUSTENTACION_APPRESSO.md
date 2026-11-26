# Índice Maestro de Estudio y Sustentación — Enciclopedia Completa Appresso (4,700+ Líneas Sin Resumir)

Esta es la puerta de entrada oficial de estudio para **César Julio Berrio**, **Julián Cardona Atehortúa** y **Juan Esteban Zapa**.

Como nos pediste una guía **desde cero, sin asumir conocimientos previos de programación y sin resumir ninguna función ni línea clave**, organizamos toda la enciclopedia en **4 Tomos Completos** dentro de la carpeta `docs/` para que puedan leerlos cómodamente en orden:

---

## Los 4 Tomos Completos de Estudio (Orden Recomendado de Lectura)

### 1. [TOMO 0 — Diccionario de Programación Desde Cero y Mapa General](./00_DICCIONARIO_DESDE_CERO_Y_FLUJO_GENERAL.md) *(Lectura obligatoria para los 3 antes de empezar)*
Explica en español cotidiano qué significa cada palabra y símbolo del código:
- `const`, `let`, `Object.freeze`, arreglos `[]` y objetos `{}`.
- Operadores `===`, `!==`, `&&`, `||`, `??`, `?.`, operador ternario `? :`, desestructuración `{ a, b }` y copia inmutable `...spread`.
- Funciones, clases (`class` / `constructor` / `this`), promesas y qué hacen **`async`**, **`await`**, **`Promise.all`** y **`try / catch / finally`**.
- Métodos `.map()`, `.filter()`, `.reduce()`, `.find()` y estructuras rápidas en memoria **`new Map()`** y **`new Set()`** ($O(1)$).
- Qué son `req.body`, `req.params`, `req.query`, `res.json()` y `next()` en Express.
- Qué son los parámetros `$1, $2`, `RETURNING *` y `COALESCE` en PostgreSQL (y cómo evitan Inyección SQL).
- Qué son `useState`, `useEffect` y `useCallback` en React.
- Mapa completo de las **4 capas de Arquitectura Limpia** y las **5 vistas unificadas** del sistema.

---

### 2. [TOMO 1 — César Julio Berrio (1,328 líneas sin resumir)](./01_GUIA_CESAR_JULIO_BERRIO_ARQUITECTURA_BD_Y_ERP.md)
**Temas que domina y expone César (Arquitectura + DB 5% + Módulos Operativos 15%):**
1. **Arranque, Configuración e Inyección de Dependencias**: `src/config/env.js`, `src/server.js`, `src/app.js` y `src/container.js` línea por línea.
2. **Eliminación de Validaciones Redundantes y Buenas Prácticas (SOLID + DRY)**: `httpValidator.js` (validación exclusiva de transporte HTTP) vs validación única de negocio en Servicios/Dominio, `asyncHandler.js`, `requestContext.js`, `httpLogger.js`, `notFound.js`, `errorHandler.js` y logs seguros con redacción de datos sensibles (`logger.js`).
3. **Base de Datos PostgreSQL y Repositorios SQL**: `connection.js`, `migrations.js` (las tablas `usuarios`, `categorias`, `items`, `orders`, `facturas`, `pagos`, `reportes_calidad`) y todos los métodos de `UserRepository.js`, `CatalogRepository.js` (`adjustStock`), `OrderRepository.js` y `BillingRepository.js`.
4. **Módulos Operativos ERP Unificados (Backend + Frontend)**: Los **24 métodos** de `OperationalService.js` (incluyendo creación, consulta paginada, cambio de estado y anulación con devolución de stock de pedidos multicanal, facturación consecutiva `FAC-XXXXXX` con IVA 19% y pagos con comprobante), `OperationalController.js`, `operational.routes.js`, `App.jsx`, `api.js` y `OperationalERP.jsx`.
5. **10 Preguntas de Profesor con respuestas exactas palabra por palabra**.

---

### 3. [TOMO 2 — Julián Cardona Atehortúa (1,620 líneas sin resumir)](./02_GUIA_JULIAN_CARDONA_CALIDAD_FRAUDE_E_INTEGRIDAD.md)
**Temas que domina y expone Julián (Calidad de Datos 10% + Integridad Hash Chain 10% + Antifraude HMAC):**
1. **Limpieza, Normalización y Reporte de Calidad de Datos**: Las 12 funciones de `src/domain/quality/dataCleaner.js` línea por línea (`toCanonicalKey` con Unicode `NFD`, `normalizeDisplayString`, `unifyCategoryName`, `parseAndCleanPrice` para precios sucios, `detectDuplicateItems`, `detectDuplicateUsers`, etc.) + `DataQualityService.js` (`getQualityReport`, `seedDirtyData` y `runAutoClean` fusionando registros en SQL).
2. **Integridad Criptográfica tipo Blockchain en Facturas, Pagos y Comprobantes**: `src/domain/integrity/hashChain.js` línea por línea (bloques génesis, `computeInvoiceChainHash`, `validatePaymentReceipt` anti-reutilización con `Set`, `computePaymentChainHash`, `verifyInvoiceChain`, `verifyPaymentChain`), simulador de alteraciones y restauración de cadena + `DataQualityAndIntegrity.jsx`.
3. **Monitoreo Antifraude de Transacciones HMAC-SHA256 + Ventana Deslizante**: `hashUtils.js` (`crypto.timingSafeEqual` contra *Timing Attacks*), `validateTransaction.js`, `validateTransactionHash.js`, `getThresholdByTime.js` (cruce de medianoche `20:00:01`–`05:00:00`), `SlidingWindow.js` (ejemplo cronometrado segundo a segundo), `detectAnomaly.js`, `TransactionService.js` (auditoría forense `HASH_INVALIDO`), `FraudReportService.js`, `ThresholdService.js` y `FraudDetection.jsx`.
4. **10 Preguntas de Profesor con respuestas exactas palabra por palabra**.

---

### 4. [TOMO 3 — Juan Esteban Zapa (1,565 líneas sin resumir)](./03_GUIA_JUAN_ESTEBAN_ZAPA_ALGORITMOS_BENCHMARK_E_IA.md)
**Temas que domina y expone Juan Esteban (Algoritmos y Benchmark 30% + Modelos de IA No LLM 30%):**
1. **Complejidad Big-O explicada desde cero**: Qué significan $O(1)$, $O(\log n)$, $O(n)$, $O(n \log n)$ y $O(n^2)$ con analogías claras y pruebas de escritorio con números pequeños (`[8, 3, 5, 1]`).
2. **Algoritmos del Sistema y Benchmark Experimental**: Las 14 funciones de `src/domain/algorithms/operationalAlgorithms.js` línea por línea (`measureExecution` con nanosegundos `hrtime.bigint()`, `linearSearchRecord` vs `binarySearchRecord`, `sumSalesLinear`, `countOrdersByCustomerQuadratic` vs `Linear`, `bubbleSortRecords` vs `mergeSortRecords`, `rankTopItemsQuadratic` vs `Optimized`, `normalizeAndUnifyStringsQuadratic` vs `Linear`, `generateSyntheticDataset` y `runExperimentalBenchmarkSuite`) + `BenchmarkService.js` + `AlgorithmBenchmark.jsx`.
3. **Inteligencia Artificial Parte A — `simple-statistics`**: Media, mediana ($Q_2$), cuartiles $Q_1/Q_3$, $IQR$, valla de Tukey ($Q_3 + 1.5 \times IQR$), Z-Score y regresión lineal ($m, b, R^2$) explicados desde cero y línea por línea en `src/domain/ai/userBehaviorStats.js`.
4. **Inteligencia Artificial Parte B — `@tensorflow/tfjs` y Keras Layers API**: Tensores, normalización Min-Max, `tf.tidy()` / `.dispose()`, *Data Augmentation*, persistencia en disco (`createFileSystemIOHandler` guardando y cargando `model.json` y `weights.bin`), Red Clasificadora de Fraude (`Dense -> Dropout -> Dense -> Sigmoid`) y Red Regresora de Demanda/Monto (`Dense -> Dense -> Linear`) línea por línea en `src/domain/ai/tfModelManager.js` + `AiService.js` + `AiAnalyticsCenter.jsx`.
5. **12 Preguntas de Profesor con respuestas exactas palabra por palabra**.

---

## Resumen de la Limpieza y Unificación Aplicada al Proyecto

1. **Un solo módulo unificado de pedidos**: Se eliminaron los **30 archivos antiguos desconectados** (pedidos clásicos sin stock, rutas de ciudades, progresión de fidelización, cola antigua y algoritmos repetidos). Ahora **Módulos Operativos (`OperationalERP.jsx`)** crea pedidos multicanal descontando stock, lista todos los pedidos con tarjetas por estado y paginación, cambia estados (`Requested` $\rightarrow$ `In Progress` $\rightarrow$ `Delivered`), emite factura directa y anula pedidos reintegrando las unidades al inventario.
2. **Cero validaciones redundantes**: `httpValidator.js` valida únicamente transporte HTTP (`:id` entero positivo y cuerpo JSON válido), mientras que cada regla de negocio vive una sola vez en Servicios/Dominio.
3. **6 Vistas limpias en el menú lateral**:
   - **Módulos Operativos**
   - **Calidad e Integridad**
   - **Algoritmos y Benchmark**
   - **Modelos de IA (Keras/TF + Simple Stats)**
   - **Monitoreo de Transacciones**
   - **Rutas (Planificador de entregas con Grafo Ponderado y Dijkstra)**
