# TOMO 3 — Guía Maestra de Estudio para Juan Esteban Zapa: Algoritmos (Big-O), Benchmark Experimental e Inteligencia Artificial No-LLM

> **Destinatario principal:** Juan Esteban Zapa (y todo el equipo de sustentación de **Appresso**).
> **Enfoque pedagógico:** Explicado **desde cero absoluto**, en español sencillo, sin asumir conocimientos previos de programación avanzada ni matemáticas universitarias. Cada concepto tiene primero una **analogía de la vida real**, luego un **ejemplo chiquito con números reales** y finalmente la **explicación línea por línea del código exacto** de nuestro proyecto, indicando en qué archivo vive, qué ruta HTTP o botón lo dispara y qué responder si el profesor señala cualquier renglón.
> **Peso en la nota:** Este tomo cubre el **30% de Algoritmos y Complejidad Big-O** + el bloque completo de **Inteligencia Artificial No-LLM (`simple-statistics` + Redes Neuronales con `@tensorflow/tfjs` / Keras)**.

---

## Mapa Rápido de Ubicación: ¿Dónde está cada archivo que vas a defender?

Antes de entrar en materia, memoriza este mapa de 8 archivos. El profesor suele abrir el proyecto y preguntar: *"Juan Esteban, ¿en qué carpeta están los algoritmos y en cuál está la IA?"*.

| # | Archivo real en el proyecto | Capa de Arquitectura | ¿Qué hace en una frase sencilla? | ¿Cuándo se dispara? |
| :- | :--- | :--- | :--- | :--- |
| 1 | [operationalAlgorithms.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/algorithms/operationalAlgorithms.js) | **Dominio Puro** (`src/domain/algorithms/`) | Contiene las **14 funciones** de algoritmos lentos vs rápidos (búsqueda, suma, conteo, ordenamiento, ranking y limpieza) y el cronómetro en nanosegundos. | Cuando `BenchmarkService` o el comando `npm run benchmark` lo llaman. |
| 2 | [BenchmarkService.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/application/analytics/BenchmarkService.js) | **Aplicación / Casos de Uso** (`src/application/analytics/`) | Trae los datos reales de las 5 tablas de PostgreSQL al mismo tiempo y pone a competir los algoritmos lentos contra los rápidos. | Cuando llega la petición `GET /operational/benchmarks`. |
| 3 | [runBenchmark.js](file:///Users/cesarjulioberrio/Documents/Appresso/scripts/benchmark/runBenchmark.js) | **Script de Consola CLI** (`scripts/benchmark/`) | Ejecuta en la terminal las pruebas con $100$, $500$, $1.000$ y $2.500$ datos e imprime dos tablas comparativas. | Al correr `npm run benchmark` en la terminal. |
| 4 | [AlgorithmBenchmark.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/components/AlgorithmBenchmark.jsx) | **Frontend React** (`frontend/src/components/`) | Pantalla **"Algoritmos y Benchmark"** con selectores de tabla, tarjetas comparativas en vivo y tabla de escalabilidad. | Al abrir la pestaña `"Algoritmos y Benchmark"` o pulsar **"Ejecutar Comparación"**. |
| 5 | [userBehaviorStats.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/ai/userBehaviorStats.js) | **Dominio IA** (`src/domain/ai/`) | Motor estadístico puro con `simple-statistics`: cuartiles ($Q_1, Q_2, Q_3$), $IQR$, Z-Score, perfiles de sospecha, regresión lineal y patrones horarios. | Llamado por `AiService` en `/ai/user-profiles`, `/ai/predict-demand`, `/ai/patterns` y `/operational/summary`. |
| 6 | [tfModelManager.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/ai/tfModelManager.js) | **Dominio IA** (`src/domain/ai/`) | Motor de **Redes Neuronales Keras / TensorFlow.js**: normaliza tensores, hace *Data Augmentation*, entrena, guarda/carga en disco (`model.json` + `weights.bin`), clasifica fraudes y predice demanda. | Llamado por `AiService` en `/ai/status`, `/ai/train`, `/ai/classify`, `/ai/classify-recent`, `/ai/predict-demand` y al crear facturas/pagos. |
| 7 | [AiService.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/application/ai/AiService.js) | **Aplicación / Casos de Uso** (`src/application/ai/`) | Director de orquesta de IA: saca los datos reales de PostgreSQL y se los entrega a `userBehaviorStats.js` y a `TfModelManager`. | En todos los endpoints `/ai/*` y también en vivo desde `OperationalService` al facturar o pagar. |
| 8 | [AiAnalyticsCenter.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/components/AiAnalyticsCenter.jsx) | **Frontend React** (`frontend/src/components/`) | Pantalla **"Modelos de IA"**: botón de reentrenar en disco, simulador de fraude en vivo, tabla de cuartiles por usuario, predictor de demanda y patrones. | Al abrir la pestaña `"Modelos de IA"` en el navegador. |

---

# PARTE 1: Introducción desde Cero a Complejidad Algorítmica Big-O

## 1.1 ¿Qué es un algoritmo y qué demonios significa la letra "Big-O" ($O$)?

Imagina que trabajas en la barra de la cafetería **Appresso** y tienes una caja llena de comandas de papel.
- Un **algoritmo** no es nada misterioso: es simplemente la **receta de pasos exactos** que sigues para resolver una tarea (por ejemplo, buscar la factura `#2500` o acomodar las facturas de la más reciente a la más vieja).
- Ahora bien: si solo tienes **5 facturas**, casi cualquier método funciona rápido. Pero ¿qué pasa cuando la cafetería crece y tienes **$n = 2.500$** o **$n = 1.000.000$** de facturas?
- Aquí entra **Big-O** (se lee *"Gran O"*):
  - La letra **$n$** representa **cuántos datos entran** (por ejemplo, $n = 1.000$ pedidos).
  - **Big-O** NO mide cuántos segundos tarda tu computador en particular (porque un computador gamer corre más rápido que un portátil viejo). **Big-O mide cómo crece la cantidad de pasos (operaciones) que tiene que hacer el computador a medida que $n$ se hace grande**.

> **Nota clave para el profesor:** Existe **complejidad temporal** (cuántos pasos o comparaciones tarda el algoritmo) y **complejidad espacial** (cuánta memoria RAM extra gasta para guardar listas o mapas auxiliares). En nuestro código documentamos **ambas**.

---

## 1.2 Las 5 complejidades de Appresso explicadas con ejemplos de la vida real

### 1. $O(1)$ — Tiempo Constante ("Ir directo al casillero con etiqueta")
- **¿Qué significa?** Sin importar si tienes $10$ datos o $10$ millones de datos, **siempre tardas exactamente 1 paso**.
- **Analogía de la vida real:** Imagina el casillero de un hotel donde cada llave cuelga en un gancho con su nombre o número exacto, o buscar a `"Juan"` en los contactos del celular usando un diccionario interno (**Tabla Hash** o `Map` en JavaScript). No miras todos los contactos: vas directo a la casilla de `"Juan"`.
- **Dónde lo usamos en Appresso:**
  - Leer o guardar un cliente en un `Map` (`customerMap.get(customer)` y `customerMap.set(...)`).
  - Extraer la fecha o monto de un solo registro en `extractSortValue(record, sortBy)`.
  - Medir el reloj antes y después de una función en `measureExecution(fn)`.

### 2. $O(\log n)$ — Tiempo Logarítmico ("Abrir la guía telefónica siempre por la mitad")
- **¿Qué significa el logaritmo base 2 ($\log_2 n$)?** Sin asustarte con matemáticas: $\log_2(n)$ simplemente responde a la pregunta: ***"¿Cuántas veces tengo que partir $n$ por la mitad hasta quedarme con 1 solo elemento?"***.
  - Si tienes $8$ páginas: $8 \to 4 \to 2 \to 1$ (**3 cortes**).
  - Si tienes $1.000$ páginas: $1000 \to 500 \to 250 \to 125 \to 62 \to 31 \to 15 \to 7 \to 3 \to 1$ (**¡apenas 10 cortes!**).
  - Si tienes $2.500$ facturas: **¡apenas 12 pasos!** (mientras que leer una por una tomaría $2.500$ pasos).
- **Analogía de la vida real:** Buscar la página 740 de un libro de 1.000 páginas **que ya está numerado en orden**. Abres exactamente en la mitad (página 500). Como 500 es menor que 740, arrancas de tu mente toda la mitad izquierda (500 páginas descartadas de un golpe) y ahora abres la mitad de lo que queda (entre 501 y 1.000, o sea 750). ¡En poquísimos intentos llegas!
- **Condición obligatoria (¡pregunta fija de examen!):** La búsqueda binaria $O(\log n)$ **SOLO funciona si la lista ya está ordenada de menor a mayor**. Si está desordenada, no puedes saber hacia qué mitad ir.
- **Dónde lo usamos en Appresso:** `binarySearchRecord(sortedRecords, targetId)`.

### 3. $O(n)$ — Tiempo Lineal ("Leer la lista hoja por hoja una sola vez")
- **¿Qué significa?** El número de pasos crece **en proporción directa** al número de datos. Si hay $100$ facturas haces $100$ pasos; si hay $2.500$ facturas haces $2.500$ pasos.
- **Analogía de la vida real:** El cajero al final del turno toma el fajo de recibos del día y pasa **una sola vez** por cada recibo sumando su valor en la calculadora. Para saber cuánto se vendió en total, es imposible no mirar cada recibo al menos una vez.
- **Dónde lo usamos en Appresso:**
  - `linearSearchRecord` (buscar en una lista revisando uno por uno desde el principio).
  - `sumSalesLinear` (sumar ventas totales y ventas por canal en una sola pasada).
  - `countOrdersByCustomerLinear` (recorrer los pedidos una vez e ir anotando en un `Map`).
  - `normalizeAndUnifyStringsLinear` (limpiar nombres de productos en una sola pasada usando `Map` y `Set`).

### 4. $O(n \log n)$ — Tiempo Linealítmico ("Divide y vencerás para ordenar rápido")
- **¿Qué significa?** Haces $\log_2(n)$ niveles de división por la mitad, y en cada nivel acomodas los $n$ elementos una vez ($n \times \log_2 n$). Es el **estándar de oro** para ordenar listas grandes por comparación.
- **Analogía de la vida real:** Tienes $1.000$ exámenes desordenados en una mesa. En vez de pelearte con los $1.000$ juntos, divides el montón por la mitad una y otra vez hasta tener puros montoncitos de 1 hoja. Luego vas juntando de dos en dos montoncitos ya ordenados mirando solo la hoja de encima de cada pila.
- **Con números:** Para $n = 2.500$, mientras un algoritmo lento $O(n^2)$ hace más de **3 millones** de comparaciones, $O(n \log n)$ hace unas **$28.000$ operaciones** (¡más de 100 veces menos trabajo!).
- **Dónde lo usamos en Appresso:** `mergeSortRecords` y la fase de ordenamiento de `rankTopItemsOptimized` ($O(n + k \log k)$).

### 5. $O(n^2)$ — Tiempo Cuadrático ("Comparar a cada persona del salón contra todas las demás")
- **¿Qué significa?** Tienes **un ciclo `for` metido adentro de otro ciclo `for`**. Por cada uno de los $n$ elementos, vuelves a recorrer los $n$ elementos: $n \times n = n^2$.
- **Analogía de la vida real:** En un salón de $30$ personas, el profesor le pide al estudiante #1 que le pregunte su nombre a los $30$; luego al estudiante #2 que le vuelva a preguntar a los $30$, y así sucesivamente ($30 \times 30 = 900$ preguntas). Con $30$ personas apenas se nota, pero en un estadio de $2.500$ personas serían $2.500 \times 2.500 = 6.250.000$ interacciones: ¡el sistema se congela!
- **¿Por qué tenemos funciones $O(n^2)$ en Appresso?** Las programamos a propósito como **"versión ingenua / antes de optimizar"** (`countOrdersByCustomerQuadratic`, `bubbleSortRecords`, `rankTopItemsQuadratic`, `normalizeAndUnifyStringsQuadratic`) para enfrentarlas en vivo contra nuestras versiones optimizadas y **demostrar con números y milisegundos reales** por qué la optimización importa.

### Tabla Resumen de Crecimiento (Memorízala para deslumbrar al jurado)

| Tamaño de datos ($n$) | $O(1)$ Constante | $O(\log_2 n)$ Binaria | $O(n)$ Lineal | $O(n \log_2 n)$ Merge Sort | $O(n^2)$ Cuadrático |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **$n = 10$** | $1$ op | $\approx 4$ ops | $10$ ops | $\approx 33$ ops | $100$ ops |
| **$n = 100$** | $1$ op | $\approx 7$ ops | $100$ ops | $\approx 664$ ops | $10.000$ ops |
| **$n = 1.000$** | $1$ op | $\approx 10$ ops | $1.000$ ops | $\approx 9.966$ ops | $1.000.000$ ops |
| **$n = 2.500$** *(nuestro benchmark)* | $1$ op | **$12$ ops** | **$2.500$ ops** | **$\approx 28.200$ ops** | **$\approx 3.123.750$ a $6.250.000$ ops** |
| **$n = 1.000.000$** | $1$ op | $\approx 20$ ops | $1.000.000$ ops | $\approx 20.000.000$ ops | $1.000.000.000.000$ (¡1 billón!) |

---

# PARTE 2: Algoritmos del Sistema y Benchmark Experimental (30% de la Rúbrica)

## 2.1 Archivo 1: `src/domain/algorithms/operationalAlgorithms.js` (Explicación Completa Función por Función y Línea por Línea)

- **Ubicación exacta:** [operationalAlgorithms.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/algorithms/operationalAlgorithms.js) (921 líneas).
- **Capa:** Dominio Puro (`src/domain/algorithms/`). **Cero dependencias de Express, HTTP ni SQL**. Lo único que importa en la línea 32 es:
  ```js
  const { toCanonicalKey, normalizeDisplayString } = require('../quality/dataCleaner');
  ```
  - `toCanonicalKey(texto)`: limpia tildes, mayúsculas, símbolos y espacios dobles usando descomposición Unicode `NFD` (ej. `'  Café   AMERICANO! '` $\to$ `'cafe americano'`).
  - `normalizeDisplayString(texto)`: lo deja bonito para mostrar en pantalla estilo *Title Case* (ej. `'Café Americano'`).

Vamos a desglosar **las 14 funciones del archivo, sin saltarnos ni una sola**.

---

### Función 1: `measureExecution(fn)` — El Cronómetro Atómico en Nanosegundos (Líneas 43–57)

#### ¿Para qué sirve y qué analogía tiene?
Imagina a un entrenador de atletismo con un cronómetro láser olímpico. Recibe a un corredor (`fn`), oprime *Start* justo antes de que salga, deja que corra, oprime *Stop* apenas cruza la meta y anota cuántas milésimas tardó junto con el resultado de la carrera.

#### Código real y explicación línea por línea:
```js
function measureExecution(fn) {
  const start = process.hrtime.bigint();
  const output = fn();
  const end = process.hrtime.bigint();
  const timeMs = Number(end - start) / 1_000_000;
  return {
    ...output,
    timeMs: Number(timeMs.toFixed(4)),
  };
}
```
- **Línea 43 (`function measureExecution(fn)`):** Recibe como parámetro `fn`, que es una función flecha con el algoritmo que queremos cronometrar (por ejemplo `() => bubbleSortRecords(...)`). Su complejidad propia de envoltorio es **$O(1)$**.
- **Línea 45 (`const start = process.hrtime.bigint();`):** Toma la foto del reloj de alta resolución de Node.js en **nanosegundos** (milmillonésimas de segundo) como un entero gigante (`BigInt`).
  - *¿Por qué NO usamos `Date.now()`?* Porque `Date.now()` solo mide milisegundos enteros (muchos algoritmos rápidos darían `0 ms`) y además puede saltar hacia atrás o adelante si Windows/Mac sincroniza la hora por internet (NTP). En cambio `process.hrtime.bigint()` es un **reloj monotónico** (nunca retrocede y mide nanosegundos exactos).
- **Línea 47 (`const output = fn();`):** Ejecuta el algoritmo y guarda el objeto que devolvió (por ejemplo `{ sorted, operationsCount, complexity }`).
- **Línea 49 (`const end = process.hrtime.bigint();`):** Toma la foto del reloj inmediatamente al terminar.
- **Línea 51 (`const timeMs = Number(end - start) / 1_000_000;`):** Resta `end - start` (nanosegundos transcurridos), lo convierte de `BigInt` a `Number` normal y lo **divide entre `1_000_000`** (en JS los guiones bajos `1_000_000` son solo separadores visuales para leer un millón fácilmente), porque **$1\text{ milisegundo} = 1.000.000\text{ nanosegundos}$**.
  - *Ejemplo numérico:* Si tardó `450.000` nanosegundos $\to 450000 / 1000000 = 0.45\text{ ms}$.
- **Líneas 53–56 (`return { ...output, timeMs: Number(timeMs.toFixed(4)) };`):** El operador `...output` (*spread*) copia todas las propiedades originales que devolvió el algoritmo y le pega al lado `timeMs` redondeado a 4 decimales (`toFixed(4)` devuelve texto y `Number(...)` lo vuelve número otra vez).

---

### Función 2 y Función 3: `linearSearchRecord` ($O(n)$) vs `binarySearchRecord` ($O(\log n)$) (Líneas 68–161)

#### Ejemplo chiquito con números reales antes de ver el código
Supongamos que tenemos 8 pedidos ordenados por ID:
`sortedRecords = [{id: 10}, {id: 20}, {id: 30}, {id: 40}, {id: 50}, {id: 60}, {id: 70}, {id: 80}]` (índices `0` al `7`) y buscamos `targetId = 70`:
- **Con Búsqueda Lineal (`linearSearchRecord`):**
  Mira pos `0` (`10` no) $\to$ pos `1` (`20` no) $\to$ pos `2` (`30` no) $\to$ pos `3` (`40` no) $\to$ pos `4` (`50` no) $\to$ pos `5` (`60` no) $\to$ pos `6` (`70` ¡SÍ!). **Total: 7 operaciones**.
- **Con Búsqueda Binaria (`binarySearchRecord`):**
  1. **Intento 1:** `left = 0`, `right = 7`. Mitad `mid = Math.floor((0 + 7) / 2) = 3`. Mira pos `3`: es `40`. Como `40 < 70`, descarta del `0` al `3` moviendo `left = mid + 1 = 4`.
  2. **Intento 2:** `left = 4`, `right = 7`. Mitad `mid = Math.floor((4 + 7) / 2) = 5`. Mira pos `5`: es `60`. Como `60 < 70`, descarta `4` y `5` moviendo `left = mid + 1 = 6`.
  3. **Intento 3:** `left = 6`, `right = 7`. Mitad `mid = Math.floor((6 + 7) / 2) = 6`. Mira pos `6`: es `70` ¡BINGO! **Total: 3 operaciones**.

#### A) `linearSearchRecord(records = [], targetId, idField = 'id')` — Líneas 68–103 ($O(n)$ tiempo, $O(1)$ espacio)
```js
function linearSearchRecord(records = [], targetId, idField = 'id') {
  let operationsCount = 0;
  const targetStr = String(targetId).trim();
  const targetNum = Number(targetId);

  for (let i = 0; i < records.length; i++) {
    operationsCount++;
    const rec = records[i];
    const val = rec[idField] ?? rec.id ?? rec.id_txn ?? rec.numero_consecutivo;
    if (val === targetNum || String(val) === targetStr) {
      return {
        found: rec,
        index: i,
        operationsCount,
        complexity: 'O(n)',
      };
    }
  }

  return {
    found: null,
    index: -1,
    operationsCount,
    complexity: 'O(n)',
  };
}
```
- **Línea 70:** `operationsCount = 0` cuenta cuántas cajitas tuvimos que abrir.
- **Líneas 72–74:** Prepara el ID buscado tanto en texto limpio (`targetStr`, útil si buscas una factura `'FAC-0005'`) como en número (`targetNum`, útil si buscas el pedido `2500`) **fuera del ciclo** para no recalcularlo miles de veces.
- **Línea 77 (`for (let i = 0; i < records.length; i++)`):** Recorre posición por posición desde `0` hasta el final.
- **Línea 79:** Suma `1` al contador de operaciones por cada elemento revisado.
- **Línea 83 (`const val = rec[idField] ?? rec.id ?? rec.id_txn ?? rec.numero_consecutivo;`):** El operador `??` (*nullish coalescing*) significa *"si el primero no existe, prueba el siguiente"*. Así una sola función sirve para buscar pedidos (`id`), transacciones (`id_txn`) o facturas (`numero_consecutivo`).
- **Líneas 85–93:** Si coincide como número o como texto, hace **corte temprano (`return`)** devolviendo el objeto encontrado (`found: rec`), en qué casilla estaba (`index: i`), cuántos pasos dio (`operationsCount`) y la etiqueta `'O(n)'`.
- **Líneas 97–102:** Si terminó todo el `for` y nunca lo encontró, devuelve `found: null` e `index: -1` habiendo gastado exactamente `records.length` operaciones (peor caso).

#### B) `binarySearchRecord(sortedRecords = [], targetId, idField = 'id')` — Líneas 114–161 ($O(\log n)$ tiempo, $O(1)$ espacio)
```js
function binarySearchRecord(sortedRecords = [], targetId, idField = 'id') {
  let operationsCount = 0;
  let left = 0;
  let right = sortedRecords.length - 1;
  const targetNum = Number(targetId);

  while (left <= right) {
    operationsCount++;
    const mid = Math.floor((left + right) / 2);
    const current = sortedRecords[mid];
    const currentId = Number(current[idField] ?? current.id ?? current.id_txn ?? 0);

    if (currentId === targetNum) {
      return {
        found: current,
        index: mid,
        operationsCount,
        complexity: 'O(log n)',
      };
    }

    if (currentId < targetNum) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return {
    found: null,
    index: -1,
    operationsCount,
    complexity: 'O(log n)',
  };
}
```
- **Líneas 118–120:** Coloca dos dedos separadores: `left = 0` (primera casilla) y `right = sortedRecords.length - 1` (última casilla).
- **Línea 125 (`while (left <= right)`):** Mientras el dedo izquierdo no haya cruzado al derecho, todavía quedan candidatos en el medio. (Usamos `<=` y no `<` porque cuando `left === right` queda **1 último elemento** por verificar).
- **Línea 129 (`const mid = Math.floor((left + right) / 2);`):** Suma ambos extremos, divide entre 2 y `Math.floor` redondea hacia abajo para obtener una posición entera válida del arreglo (ej. `3.5` baja a `3`).
- **Líneas 130–133:** Toma el elemento del centro (`current`) y saca su ID numérico (`currentId`).
- **Líneas 136–143:** Si `currentId === targetNum`, ¡lo encontramos en el centro! Retorna de inmediato.
- **Líneas 146–147 (`if (currentId < targetNum) { left = mid + 1; }`):** Si el número del centro es **más chiquito** que el que busco, entonces ni el centro ni nada a su izquierda me sirve; muevo el borde izquierdo a `mid + 1` (mitad derecha).
- **Líneas 148–151 (`else { right = mid - 1; }`):** Si el número del centro es **más grande** que el que busco, muevo el borde derecho a `mid - 1` (mitad izquierda).
- **Líneas 155–160:** Si `left` supera a `right`, el ID no existe en la tabla y retorna `found: null` tras apenas $\approx \log_2(n)$ comparaciones.

---

### Función 4: `sumSalesLinear(records = [])` — Suma Financiera en 1 Sola Pasada (Líneas 170–220)

#### ¿Qué hace y por qué es $O(n)$?
Recorre todas las facturas o pedidos **una sola vez** y en ese mismo viaje calcula **4 cosas al tiempo**: (1) suma total de dinero, (2) cuántas ventas válidas hubo, (3) ticket promedio y (4) cuánto se vendió por cada canal (`presencial`, `web`, `app`, `domicilio`), saltándose las ventas anuladas para no inflar la contabilidad.

#### Código real y explicación línea por línea:
```js
function sumSalesLinear(records = []) {
  let operationsCount = 0;
  let totalSales = 0;
  let validCount = 0;
  const byChannel = {};

  for (let i = 0; i < records.length; i++) {
    operationsCount++;
    const r = records[i];
    if (r.estado === 'Anulada' || r.status === 'Cancelled') continue;

    let amount = Number(r.total ?? r.valor ?? r.monto ?? 0);
    if (!amount && typeof r.totalAmount === 'function') {
      amount = Number(r.totalAmount());
    } else if (!amount && Array.isArray(r.products)) {
      for (const p of r.products) {
        operationsCount++;
        amount += Number(p.price || p.precio || 0) * Number(p.quantity || p.cantidad || 1);
      }
    }

    totalSales += amount;
    validCount++;
    const channel = r.canal || r.metodo_pago || 'presencial';
    byChannel[channel] = (byChannel[channel] || 0) + amount;
  }

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    validCount,
    averageTicket: validCount > 0 ? Math.round((totalSales / validCount) * 100) / 100 : 0,
    byChannel,
    operationsCount,
    complexity: 'O(n)',
  };
}
```
- **Líneas 174–178:** Inicializa acumuladores: `totalSales = 0`, `validCount = 0` y el objeto diccionario `byChannel = {}` (acceso $O(1)$ por nombre de canal).
- **Línea 186 (`if (r.estado === 'Anulada' || r.status === 'Cancelled') continue;`):** ¡Regla contable vital! Si una factura está `'Anulada'` o un pedido está `'Cancelled'`, la palabra `continue` salta inmediatamente al siguiente recibo sin sumarlo ni contarlo en el promedio.
- **Líneas 189–199:** Obtiene el dinero del registro adaptándose a cualquier tabla:
  1. Primero intenta leer la columna directa `r.total`, `r.valor` o `r.monto`.
  2. Si vale `0` y el objeto es una entidad de dominio `Order` con método `r.totalAmount()`, lo ejecuta.
  3. Si tampoco, pero trae un arreglo `r.products`, suma `precio * cantidad` de cada producto.
- **Líneas 202–207:** Suma al gran total (`totalSales += amount`), cuenta 1 venta válida (`validCount++`) y acumula en el diccionario `byChannel[channel] = (byChannel[channel] || 0) + amount` (si ese canal aún no existía en el objeto, `undefined || 0` arranca en `0` y le suma `amount` en $O(1)$).
- **Líneas 212–215:** `Math.round(x * 100) / 100` redondea limpiamente a 2 decimales, y en `averageTicket` verifica `validCount > 0 ? ... : 0` para **jamás dividir entre cero** (`0 / 0 = NaN`) si la tabla estuviera vacía.

---

### Función 5 y Función 6: Conteo de Pedidos por Cliente — `countOrdersByCustomerQuadratic` ($O(n^2)$) vs `countOrdersByCustomerLinear` ($O(n)$) (Líneas 229–335)

#### Ejemplo chiquito con 4 pedidos
Imagina `orders = [{customer: 'Ana', total: 10}, {customer: 'Luis', total: 20}, {customer: 'Ana', total: 15}, {customer: 'Luis', total: 5}]`:
- **Versión Cuadrática $O(n^2)$:**
  - En `i = 0` (`Ana`), recorre `j = 0, 1, 2, 3` comparando contra todos; encuentra a `Ana` en `0` y `2`, y anota en una libreta `visitedIndices = [true, false, true, false]` para no volver a contar a `Ana` cuando `i` llegue a `2`.
  - En `i = 1` (`Luis`), recorre `j = 1, 2, 3` comparando contra los restantes; encuentra a `Luis` en `1` y `3`, marca `visitedIndices[1] = true, visitedIndices[3] = true`.
  - En `i = 2` y `i = 3`, ve que `visitedIndices` ya es `true` y los salta con `continue`. Si hubiera muchos clientes distintos, hace $\approx \frac{n(n+1)}{2}$ pasos $\implies O(n^2)$.
- **Versión Lineal con `Map` $O(n)$:**
  - Pasa **una sola vez** (`i = 0, 1, 2, 3`) con una caja de fichas (`new Map()`). Mira `'Ana'` $\to$ crea ficha `{orderCount: 1, totalSpent: 10}`. Mira `'Luis'` $\to$ crea ficha `{1, 20}`. Mira `'Ana'` $\to$ abre su ficha en $O(1)$ y la sube a `{2, 25}`. Mira `'Luis'` $\to$ la sube a `{2, 25}`. **Solo 4 pasos exactos**.

#### A) `countOrdersByCustomerQuadratic(orders = [])` — Líneas 229–282 ($O(n^2)$)
```js
function countOrdersByCustomerQuadratic(orders = []) {
  let operationsCount = 0;
  const results = [];
  const visitedIndices = new Array(orders.length).fill(false);

  for (let i = 0; i < orders.length; i++) {
    operationsCount++;
    if (visitedIndices[i]) continue;

    const customerA = String(
      orders[i].customer ?? orders[i].cliente ?? orders[i].email ?? orders[i].usuario_id ?? 'Anónimo'
    ).trim();
    let count = 0;
    let totalSpent = 0;

    for (let j = i; j < orders.length; j++) {
      operationsCount++;
      const customerB = String(
        orders[j].customer ?? orders[j].cliente ?? orders[j].email ?? orders[j].usuario_id ?? 'Anónimo'
      ).trim();

      if (customerA === customerB) {
        visitedIndices[j] = true;
        count++;
        const amount =
          typeof orders[j].totalAmount === 'function'
            ? orders[j].totalAmount()
            : Number(orders[j].total ?? orders[j].valor ?? 0);
        totalSpent += amount;
      }
    }

    results.push({ customer: customerA, orderCount: count, totalSpent });
  }

  return {
    customers: results,
    uniqueCustomers: results.length,
    operationsCount,
    complexity: 'O(n²)',
  };
}
```
- **Línea 235 (`const visitedIndices = new Array(orders.length).fill(false);`):** Crea un arreglo de banderitas `[false, false, ...]` del mismo tamaño que `orders` ($O(n)$ memoria). Sirve para recordar qué pedidos ya fueron sumados y no meter al mismo cliente dos veces en `results`.
- **Líneas 238–240:** Ciclo externo `i`. Si `visitedIndices[i]` ya es `true`, lo salta con `continue`.
- **Líneas 252–269:** **Ciclo interno `j = i` hasta `orders.length`**: aquí nace el costo cuadrático $O(n^2)$, porque por cada cliente nuevo tiene que barrer todo el resto del arreglo buscando pedidos con el mismo nombre (`customerA === customerB`). Cuando coincide, marca `visitedIndices[j] = true`, suma `count++` y acumula `totalSpent`.

#### B) `countOrdersByCustomerLinear(orders = [])` — Líneas 291–335 ($O(n)$)
```js
function countOrdersByCustomerLinear(orders = []) {
  let operationsCount = 0;
  const customerMap = new Map();

  for (let i = 0; i < orders.length; i++) {
    operationsCount++;
    const order = orders[i];
    const customer = String(
      order.customer ?? order.cliente ?? order.email ?? order.usuario_id ?? 'Anónimo'
    ).trim();
    const amount =
      typeof order.totalAmount === 'function'
        ? order.totalAmount()
        : Number(order.total ?? order.valor ?? 0);

    const existing = customerMap.get(customer);
    if (existing) {
      existing.orderCount += 1;
      existing.totalSpent += amount;
    } else {
      customerMap.set(customer, {
        customer,
        orderCount: 1,
        totalSpent: amount,
      });
    }
  }

  const customers = Array.from(customerMap.values());
  return {
    customers,
    uniqueCustomers: customers.length,
    operationsCount,
    complexity: 'O(n)',
  };
}
```
- **Línea 295 (`const customerMap = new Map();`):** Crea una **Tabla Hash** nativa de JavaScript.
- **Línea 298:** Un **único ciclo `for`**. `operationsCount` al final valdrá exactamente `orders.length`.
- **Líneas 312–324:** `customerMap.get(customer)` busca en **$O(1)$** si el cliente ya tiene ficha. Si existe (`if (existing)`), incrementa en sitio `existing.orderCount += 1` y `existing.totalSpent += amount`. Si no existe (`else`), `customerMap.set(customer, ...)` crea su ficha en **$O(1)$**.
- **Línea 328 (`Array.from(customerMap.values())`):** Al terminar, saca todas las fichas del `Map` y las convierte en un arreglo normal para devolverlo en JSON.

---

### Función 7: `extractSortValue(record, sortBy = 'date')` — Extractor $O(1)$ de Clave de Ordenamiento (Líneas 344–363)

```js
function extractSortValue(record, sortBy = 'date') {
  if (sortBy === 'date' || sortBy === 'fecha') {
    const rawDate =
      record.fecha_txn ??
      record.created_at ??
      record.createdAt ??
      record.fecha_pago ??
      record.date ??
      0;
    return rawDate instanceof Date ? rawDate.getTime() : new Date(rawDate).getTime() || 0;
  }
  if (sortBy === 'amount' || sortBy === 'monto' || sortBy === 'total') {
    if (typeof record.totalAmount === 'function') return record.totalAmount();
    return Number(record.total ?? record.valor ?? record.monto ?? record.precio ?? 0);
  }
  return Number(record.id ?? record.id_txn ?? 0);
}
```
- **¿Por qué existe esta función auxiliar?** Porque tanto `bubbleSortRecords` como `mergeSortRecords` necesitan comparar dos registros con `<` y `>`, pero una fecha viene como texto `'2026-05-10T14:30:00Z'` y un monto puede llamarse `total`, `valor` o `monto`.
- **Líneas 346–355 (Modo Fecha):** Busca la fecha en cualquiera de los 5 nombres posibles y ejecuta `.getTime()`, que convierte una fecha en el **Timestamp UNIX** (cantidad de milisegundos transcurridos desde el 1 de enero de 1970). Así, una fecha más reciente es simplemente un número entero más grande, comparable en **$O(1)$**.
- **Líneas 357–360 (Modo Monto):** Devuelve el dinero como número en **$O(1)$**.
- **Línea 362 (Modo por defecto ID):** Devuelve `id` o `id_txn` como número en **$O(1)$**.

---

### Función 8 y Función 9: Ordenamiento — `bubbleSortRecords` ($O(n^2)$) vs `mergeSortRecords` ($O(n \log n)$) (Líneas 374–495)

#### Traza Paso a Paso con Números Reales: Ordenar `[8, 3, 5, 1]` de menor a mayor (`asc`)

¡Si el profesor te pide hacer una prueba de escritorio en el tablero con `[8, 3, 5, 1]`, haz exactamente esto!

1. **Cómo ordena `[8, 3, 5, 1]` el Bubble Sort (Burbuja $O(n^2)$):**
   Compara parejas vecinas pegadas (`j` con `j+1`) y si el de la izquierda es mayor, los intercambia haciendo que el número más pesado "burbujee" hasta el fondo:
   - **Pasada `i = 0`** (`j` va de `0` a `2`):
     - Compara `8` y `3` $\to$ intercambia $\to$ `[3, 8, 5, 1]` (`swapped = true`).
     - Compara `8` y `5` $\to$ intercambia $\to$ `[3, 5, 8, 1]`.
     - Compara `8` y `1` $\to$ intercambia $\to$ `[3, 5, 1, 8]` *(el `8` ya llegó a su sitio final al fondo)*.
   - **Pasada `i = 1`** (`j` va de `0` a `1`, ya no toca el `8`):
     - Compara `3` y `5` $\to$ bien, no toca $\to$ `[3, 5, 1, 8]`.
     - Compara `5` y `1` $\to$ intercambia $\to$ `[3, 1, 5, 8]` *(el `5` ya llegó a su sitio final)*.
   - **Pasada `i = 2`** (`j` solo vale `0`):
     - Compara `3` y `1` $\to$ intercambia $\to$ **`[1, 3, 5, 8]`** ¡Ordenado en $3 + 2 + 1 = 6$ comparaciones!

2. **Cómo ordena `[8, 3, 5, 1]` el Merge Sort (Divide y Vencerás $O(n \log n)$):**
   - **Fase `divide` (partir por la mitad con `slice` hasta dejar 1 solo número):**
     - Parte `[8, 3, 5, 1]` en `mid = 2` $\to$ izquierda `[8, 3]` y derecha `[5, 1]`.
     - Parte `[8, 3]` en `mid = 1` $\to$ `[8]` y `[3]` *(caso base: tamaño 1, ya están ordenados)*.
     - Parte `[5, 1]` en `mid = 1` $\to$ `[5]` y `[1]` *(caso base: tamaño 1)*.
   - **Fase `merge` (juntar mitades ya ordenadas usando dos dedos `i` y `j`):**
     - `merge([8], [3])`: dedo `i=0` apunta a `8`, dedo `j=0` apunta a `3`. ¿Menor? `3` $\to$ mete `3`, avanza `j`. Sobró `8` $\to$ mete `8`. Resultado: **`[3, 8]`**.
     - `merge([5], [1])`: compara `5` vs `1` $\to$ mete `1`, luego sobró `5` $\to$ mete `5`. Resultado: **`[1, 5]`**.
     - **Gran `merge([3, 8], [1, 5])`:**
       - `i=0` (`3`) vs `j=0` (`1`) $\to$ gana `1` $\to$ `result = [1]`, `j` sube a `1`.
       - `i=0` (`3`) vs `j=1` (`5`) $\to$ gana `3` $\to$ `result = [1, 3]`, `i` sube a `1`.
       - `i=1` (`8`) vs `j=1` (`5`) $\to$ gana `5` $\to$ `result = [1, 3, 5]`, `j` sube a `2` (se acabó la mitad derecha).
       - Copia lo que sobró en la izquierda (`8`) $\to$ **`result = [1, 3, 5, 8]`**!

#### A) `bubbleSortRecords(records = [], sortBy = 'date', direction = 'desc')` — Líneas 374–415 ($O(n^2)$)
```js
function bubbleSortRecords(records = [], sortBy = 'date', direction = 'desc') {
  const arr = [...records];
  const n = arr.length;
  let operationsCount = 0;
  const isAsc = direction === 'asc';

  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      operationsCount++;
      const valA = extractSortValue(arr[j], sortBy);
      const valB = extractSortValue(arr[j + 1], sortBy);

      const shouldSwap = isAsc ? valA > valB : valA < valB;
      if (shouldSwap) {
        const temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
        swapped = true;
      }
    }
    if (!swapped) break;
  }

  return {
    sorted: arr,
    operationsCount,
    complexity: 'O(n²)',
    algorithm: 'Bubble Sort',
  };
}
```
- **Línea 376 (`const arr = [...records];`):** Hace una copia superficial (*inmutabilidad*) para no desordenar ni dañar el arreglo original que nos pasaron.
- **Línea 384 (`for (let i = 0; i < n - 1; i++)`):** Controla las `n - 1` pasadas.
- **Línea 386 (`let swapped = false;`):** Bandera detectora: antes de empezar cada pasada asumimos que no habrá ningún intercambio.
- **Línea 388 (`for (let j = 0; j < n - 1 - i; j++)`):** ¿Por qué resta `- i`? Porque después de `i` pasadas, los últimos `i` elementos del fondo **ya son los definitivos** y sería desperdiciar CPU volverlos a comparar.
- **Líneas 394–403:** Decide si están al revés (`shouldSwap`). Si sí, usa el **vaso auxiliar `temp`** para intercambiarlos sin perder ninguno: guarda `arr[j]` en `temp`, pone `arr[j + 1]` en `arr[j]` y pone `temp` en `arr[j + 1]`, activando `swapped = true`.
- **Línea 406 (`if (!swapped) break;`):** Optimización de mejor caso: si en toda una pasada nadie se intercambió con nadie, ¡la lista ya quedó 100% ordenada! Rompe el ciclo y ahorra tiempo (convirtiendo el mejor caso ya ordenado en $O(n)$, aunque en datos desordenados sigue siendo $O(n^2)$).

#### B) `mergeSortRecords(records = [], sortBy = 'date', direction = 'desc')` — Líneas 426–495 ($O(n \log n)$)
```js
function mergeSortRecords(records = [], sortBy = 'date', direction = 'desc') {
  let operationsCount = 0;
  const isAsc = direction === 'asc';

  function merge(left, right) {
    const result = [];
    let i = 0;
    let j = 0;

    while (i < left.length && j < right.length) {
      operationsCount++;
      const valLeft = extractSortValue(left[i], sortBy);
      const valRight = extractSortValue(right[j], sortBy);

      const pickLeft = isAsc ? valLeft <= valRight : valLeft >= valRight;
      if (pickLeft) {
        result.push(left[i++]);
      } else {
        result.push(right[j++]);
      }
    }

    while (i < left.length) {
      operationsCount++;
      result.push(left[i++]);
    }
    while (j < right.length) {
      operationsCount++;
      result.push(right[j++]);
    }

    return result;
  }

  function divide(array) {
    if (array.length <= 1) return array;
    const mid = Math.floor(array.length / 2);
    const left = divide(array.slice(0, mid));
    const right = divide(array.slice(mid));
    return merge(left, right);
  }

  const sorted = divide([...records]);
  return {
    sorted,
    operationsCount,
    complexity: 'O(n log n)',
    algorithm: 'Merge Sort',
  };
}
```
- **Líneas 474–485 (`function divide(array)`):**
  - **Línea 476 (`if (array.length <= 1) return array;`):** **Caso base de la recursión** (¡sin esta línea la función se llamaría a sí misma infinitamente!). Una lista de 0 o 1 elemento ya está ordenada.
  - **Líneas 478–480:** Calcula la mitad `mid`, corta la mitad izquierda con `array.slice(0, mid)` y la derecha con `array.slice(mid)`, y se llama recursivamente (`divide`) en cada mitad.
  - **Línea 484:** Cuando ambas mitades regresan ordenadas, llama a `merge(left, right)` para coserlas en orden.
- **Líneas 435–469 (`function merge(left, right)`):**
  - **Líneas 438–440:** Dos punteros (`i = 0` para `left`, `j = 0` para `right`).
  - **Línea 443 (`while (i < left.length && j < right.length)`):** Mientras queden cartas en ambas pilas, mira solo la carta de arriba de cada pila.
  - **Línea 449 (`const pickLeft = isAsc ? valLeft <= valRight : valLeft >= valRight;`):** ¡Detalle de oro para el profesor! Usamos `<=` y `>=` (con el signo igual) prefiriendo `left[i]`. Eso hace que nuestro Merge Sort sea **ESTABLE**: si dos pedidos empatan en el mismo monto o fecha, el que venía primero originalmente sigue quedando primero.
  - **Líneas 458–465 (Los dos `while` finales):** Cuando una de las dos mitades se vacía, la otra mitad todavía tiene elementos (que ya están ordenados entre sí), así que estos dos `while` empujan todo lo que sobró al final de `result`.

---

### Función 10 y Función 11: Ranking Top Productos — `rankTopItemsQuadratic` ($O(n^2)$) vs `rankTopItemsOptimized` ($O(n + k \log k)$) (Líneas 505–632)

#### ¿Qué problema de negocio resuelven?
Saber cuáles son los **Top 10 productos más vendidos** de la cafetería sumando todas las unidades (`totalQuantity`) e ingresos (`totalRevenue`) a través de miles de pedidos, incluso si algunos cajeros escribieron `'Café Americano'` y otros `'  cafe   americano '`.

#### A) `rankTopItemsQuadratic(orders = [], topN = 10)` — Líneas 505–565 ($O(n^2)$)
- **Líneas 508–544:** Usa un arreglo común `const accumulator = []`. Por cada producto dentro de cada pedido, hace un **tercer ciclo interno `for (let k = 0; k < accumulator.length; k++)`** buscando linealmente si ese nombre ya estaba en `accumulator` (y solo hace `.toLowerCase()`, por lo que `'Café Americano'` con tilde y `'cafe americano'` sin tilde ni siquiera se unifican bien).
- **Líneas 547–556:** Después de agrupar, ordena `accumulator` con un **Bubble Sort manual** de doble ciclo `i` y `j` ($O(k^2)$).
- **Línea 560:** Recorta los primeros `topN` con `accumulator.slice(0, topN)`.

#### B) `rankTopItemsOptimized(orders = [], topN = 10)` — Líneas 576–632 ($O(n + k \log k)$)
```js
function rankTopItemsOptimized(orders = [], topN = 10) {
  let operationsCount = 0;
  const itemMap = new Map();

  for (let i = 0; i < orders.length; i++) {
    const products = orders[i].products || orders[i].items || [];
    for (let p = 0; p < products.length; p++) {
      operationsCount++;
      const prod = products[p];
      const rawName = prod.name || prod.nombre || 'Producto';
      const canonical = toCanonicalKey(rawName) || 'producto';
      const qty = Number(prod.quantity ?? prod.cantidad ?? 1);
      const price = Number(prod.price ?? prod.precio ?? 0);

      const existing = itemMap.get(canonical);
      if (existing) {
        existing.totalQuantity += qty;
        existing.totalRevenue += qty * price;
        existing.orderAppearances += 1;
      } else {
        itemMap.set(canonical, {
          canonicalKey: canonical,
          name: normalizeDisplayString(rawName),
          totalQuantity: qty,
          totalRevenue: qty * price,
          orderAppearances: 1,
        });
      }
    }
  }

  const uniqueItems = Array.from(itemMap.values());
  const mergeResult = mergeSortRecords(
    uniqueItems.map((it) => ({ ...it, total: it.totalQuantity })),
    'amount',
    'desc'
  );
  operationsCount += mergeResult.operationsCount;

  return {
    ranking: mergeResult.sorted.slice(0, topN).map(({ total, ...rest }, idx) => ({
      rank: idx + 1,
      ...rest,
    })),
    totalUniqueItems: uniqueItems.length,
    operationsCount,
    complexity: 'O(n + k log k)',
  };
}
```
- **¿Por qué su complejidad se escribe $O(n + k \log k)$? (¡Pregunta top de sustentación!):**
  - Aquí **$n$** es el número total de líneas de productos vendidas en todos los pedidos (por ejemplo $5.000$ ventas), mientras que **$k$** es el número de **productos únicos distintos** en la carta de la cafetería (por ejemplo solo $k = 8$ o $k = 30$ productos).
  - **Fase 1 ($O(n)$, líneas 582–609):** Recorre las $n$ líneas una sola vez, convierte el nombre en clave canónica limpia con `toCanonicalKey(rawName)` (así `'Café Americano'` y `'  cafe   americano '` dan ambos `'cafe americano'`) y acumula en `itemMap` en **$O(1)$**.
  - **Fase 2 ($O(k \log k)$, líneas 612–620):** Saca solo los $k$ productos únicos (`uniqueItems`), les copia temporalmente `total: it.totalQuantity` para reutilizar nuestra función `mergeSortRecords(..., 'amount', 'desc')` y suma sus operaciones a `operationsCount`. Como $k$ es chiquitico comparado con $n$, ordenar $k$ elementos es casi instantáneo.
  - **Líneas 624–627:** Toma el Top `topN`, quita la propiedad temporal `total` con desestructuración `({ total, ...rest }, idx)` y le numera el puesto `rank: idx + 1` (`#1`, `#2`, etc.).

---

### Función 12 y Función 13: Normalización y Deduplicación de Textos — `normalizeAndUnifyStringsQuadratic` ($O(n^2)$) vs `normalizeAndUnifyStringsLinear` ($O(n)$) (Líneas 640–732)

#### A) `normalizeAndUnifyStringsQuadratic(rawStrings = [])` — Líneas 640–681 ($O(n^2)$)
- Por cada texto crudo `rawStrings[i]`, calcula `key = toCanonicalKey(rawStrings[i])` y `display = normalizeDisplayString(rawStrings[i])`.
- Luego hace un **bucle lineal `for (let g = 0; g < groups.length; g++)`** revisando todos los grupos anteriores para ver si esa `canonicalKey` ya había salido. Si entran $n$ cadenas distintas, hace $1 + 2 + \dots + n \approx \frac{n^2}{2}$ comparaciones $\implies O(n^2)$.

#### B) `normalizeAndUnifyStringsLinear(rawStrings = [])` — Líneas 690–732 ($O(n)$)
```js
function normalizeAndUnifyStringsLinear(rawStrings = []) {
  let operationsCount = 0;
  const map = new Map();

  for (let i = 0; i < rawStrings.length; i++) {
    operationsCount++;
    const raw = rawStrings[i];
    const key = toCanonicalKey(raw);
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.variants.add(String(raw));
    } else {
      map.set(key, {
        canonicalKey: key,
        unifiedDisplay: normalizeDisplayString(raw),
        count: 1,
        variants: new Set([String(raw)]),
      });
    }
  }

  const groups = Array.from(map.values()).map((g) => ({
    canonicalKey: g.canonicalKey,
    unifiedDisplay: g.unifiedDisplay,
    count: g.count,
    variants: Array.from(g.variants),
  }));

  return {
    unifiedCount: groups.length,
    duplicatesRemoved: rawStrings.length - groups.length,
    groups,
    operationsCount,
    complexity: 'O(n)',
  };
}
```
- **¿Qué hacen juntos `Map` y `Set` aquí?**
  - `map` (`new Map()`) agrupa en **$O(1)$** todas las palabras que significan lo mismo bajo la misma `key` canónica (ej. `'cappuccino artesanal'`).
  - Adentro de cada grupo, `variants: new Set([String(raw)])` es un **Conjunto matemático (`Set`)** que guarda todas las formas distintas en que la gente lo escribió (ej. `'Cappuccino Artesanal'` y `'CAPPUCCINO ARTESANAL'`) también en **$O(1)$** y sin repetir textos idénticos.
- **Línea 726 (`duplicatesRemoved: rawStrings.length - groups.length`):** Si entraron $500$ nombres de productos y después de unificar quedaron $8$ grupos únicos, ¡acabamos de fusionar $492$ duplicados en una sola pasada $O(n)$!

---

### Función 14 y Función 15 (Cierre de `operationalAlgorithms.js`): `generateSyntheticDataset(size)` y `runExperimentalBenchmarkSuite(sizes)` (Líneas 742–903)

#### A) `generateSyntheticDataset(size = 1000)` — Líneas 742–790 ($O(n)$)
```js
function generateSyntheticDataset(size = 1000) {
  const channels = ['presencial', 'web', 'app', 'domicilio'];
  const productCatalog = [
    { name: 'Café Americano', price: 5500 },
    { name: '  cafe   americano ', price: 5500 },
    { name: 'Cappuccino Artesanal', price: 7800 },
    { name: 'CAPPUCCINO ARTESANAL', price: 7800 },
    // ... 6 productos más ...
  ];

  const records = [];
  const baseTime = Date.now() - size * 60000;

  for (let i = 1; i <= size; i++) {
    const prod1 = productCatalog[i % productCatalog.length];
    const prod2 = productCatalog[(i * 3) % productCatalog.length];
    const qty1 = (i % 3) + 1;
    const qty2 = (i % 2) + 1;
    const total = prod1.price * qty1 + prod2.price * qty2;
    const pseudoRandomOffset = (((i * 2654435761) >>> 0) % size) * 60000;

    records.push({
      id: i,
      customer: `Cliente_${(i * 17) % Math.max(10, Math.floor(size / 5))}`,
      canal: channels[i % channels.length],
      total,
      valor: total,
      created_at: new Date(baseTime + pseudoRandomOffset).toISOString(),
      products: [
        { name: prod1.name, quantity: qty1, price: prod1.price },
        { name: prod2.name, quantity: qty2, price: prod2.price },
      ],
    });
  }

  return records;
}
```
- **¡Pregunta estrella de código! ¿Qué hace la línea 772 `const pseudoRandomOffset = (((i * 2654435761) >>> 0) % size) * 60000;` y por qué NO usamos `Math.random()`?**
  1. **Si dejáramos las fechas en orden (`i * 60000`):** El arreglo ya saldría ordenado de fábrica, y recuerda que `bubbleSortRecords` tiene la bandera `if (!swapped) break;`, ¡así que terminaría en 1 sola pasada haciendo trampa y no mediríamos su verdadero costo $O(n^2)$! Necesitamos que las fechas estén **bien revueltas**.
  2. **¿Por qué no `Math.random()`?** Porque en ciencia experimental y en los tests automatizados (`jest`), un experimento debe ser **reproducible (determinista)**: si hoy corres el benchmark con $n = 1.000$ y mañana el profesor lo corre, el número exacto de comparaciones (`ops`) debe dar idéntico.
  3. **¿De dónde sale `2654435761` y `>>> 0`?** Es el **Hash Multiplicativo de Donald Knuth** (una variante de generador congruencial lineal / LCG sin semilla aleatoria): $2654435761$ es aproximadamente $2^{32}$ dividido entre la proporción áurea $\varphi \approx 1.6180339887$. Al multiplicar `i * 2654435761`, los bits se dispersan caóticamente; el operador `>>> 0` obliga a JavaScript a tratar el resultado como un **entero positivo de 32 bits sin signo** (evitando números negativos por desbordamiento), `% size` lo aterriza entre `0` y `size - 1`, y `* 60000` lo convierte en minutos en milisegundos. ¡Así las fechas quedan totalmente desordenadas pero 100% reproducibles!

#### B) `runExperimentalBenchmarkSuite(sizes = [100, 500, 1000, 2500])` — Líneas 799–903
- **Línea 803 (`for (const n of sizes)`):** Repite toda la pista de pruebas para $n = 100$, luego $n = 500$, luego $n = 1.000$ y finalmente $n = 2.500$.
- **Líneas 805–808:** Genera el dataset de tamaño `n`, crea `sortedById` ordenado por `id` para la búsqueda binaria, y elige `const worstCaseId = n` (el último ID de todos) para obligar a la búsqueda lineal a recorrer los `n` registros completos frente a los $\approx \log_2(n)$ pasos de la binaria.
- **Líneas 811–832:** Cronometra con `measureExecution` las **6 competencias**:
  1. `linearSearchRecord` vs `binarySearchRecord`.
  2. `bubbleSortRecords` vs `mergeSortRecords` (ordenando por fecha descendente).
  3. `countOrdersByCustomerQuadratic` vs `countOrdersByCustomerLinear`.
  4. `rankTopItemsQuadratic` vs `rankTopItemsOptimized` (Top 5).
  5. `sumSalesLinear` (1 pasada).
  6. `normalizeAndUnifyStringsQuadratic` vs `normalizeAndUnifyStringsLinear` (sobre `d.products[0].name`).
- **Líneas 835–870:** Guarda en `experiments` los conteos de operaciones (`ops`), milisegundos (`timeMs`), factor de aceleración en tiempo (`speedupFactor`) y cuántas veces menos operaciones hizo la versión optimizada (`opsReductionRatio = opsLento / opsRapido`).
- **Líneas 876–901:** Devuelve también `optimizationSummary` con las 4 tarjetas ejecutivas *"Antes vs Después e Impacto"* que se pintan al final de la pantalla de React.

---

## 2.2 Archivo 2: `src/application/analytics/BenchmarkService.js` (Línea por Línea)

- **Ubicación exacta:** [BenchmarkService.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/application/analytics/BenchmarkService.js) (276 líneas).
- **Capa:** Aplicación / Casos de Uso (`src/application/analytics/`).
- **¿Quién lo instancia?** `buildContainer()` en `src/container.js`, inyectándole 4 repositorios de base de datos (`orderRepository`, `billingRepository`, `transactionRepository`, `catalogRepository`) y `logger`.
- **¿Cuándo se dispara?** Cuando el usuario entra a la pestaña de Benchmark o presiona **"Ejecutar Comparación"**, lo cual envía `GET /operational/benchmarks` $\to$ `OperationalController.runBenchmarks` $\to$ `benchmarkService.analyzeSystemData(...)`.

### Constructor (Líneas 52–65)
```js
constructor({
  orderRepository,
  billingRepository,
  transactionRepository,
  catalogRepository,
  logger,
}) {
  this.orderRepository = orderRepository;
  this.billingRepository = billingRepository;
  this.transactionRepository = transactionRepository;
  this.catalogRepository = catalogRepository;
  this.logger = logger;
}
```
- **¿Por qué no hace `require('../../infrastructure/...')` adentro?** Por **Inversión de Dependencias (Arquitectura Limpia)**: el servicio recibe los repositorios ya construidos desde afuera (`container.js`). Así, en los tests podemos pasarle repositorios falsos en memoria sin necesitar PostgreSQL encendido.

### Método único `analyzeSystemData({ searchId = null, entity = 'orders', sortBy = 'date', sizes = [100, 500, 1000, 2500] } = {})` (Líneas 83–273)

Vamos bloque por bloque explicando cada línea exacta:

1. **Bloque 0 — Consulta paralela de las 5 tablas con `Promise.all` (Líneas 90–96):**
   ```js
   const [orders, invoices, payments, transactions, items] = await Promise.all([
     this.orderRepository.findAllUnpaginated(),
     this.billingRepository.listInvoices(),
     this.billingRepository.listPayments(),
     this.transactionRepository.findAll(),
     this.catalogRepository.listItems(),
   ]);
   ```
   - **¿Qué hace `Promise.all`?** En vez de pedir primero `orders` (esperar 15 ms), luego `invoices` (esperar otros 15 ms), luego `payments`, etc. en fila india, **lanza las 5 consultas SQL al mismo tiempo en paralelo** hacia PostgreSQL y espera a que todas terminen juntas. ¡Reduce la espera de red casi 5 veces!

2. **Selección de tabla viva, copia ordenada por ID y elección del peor caso (Líneas 99–120):**
   ```js
   const entityRecordsMap = {
     orders,
     invoices,
     facturas: invoices,
     payments,
     pagos: payments,
     transactions,
     transacciones: transactions,
   };

   const selectedRecords = entityRecordsMap[entity] || orders;
   const sortedById = [...selectedRecords].sort(
     (a, b) => Number(a.id ?? a.id_txn ?? 0) - Number(b.id ?? b.id_txn ?? 0)
   );

   const targetId =
     searchId !== null && searchId !== undefined && searchId !== ''
       ? searchId
       : sortedById[sortedById.length - 1]?.id ?? 1;
   ```
   - **`entityRecordsMap` (líneas 99–107):** Acepta el nombre del módulo tanto en inglés (`invoices`, `payments`) como en español (`facturas`, `pagos`). Si mandan algo raro, cae por defecto en `orders` (línea 110).
   - **`sortedById` (líneas 112–114):** Clona la colección y la ordena de menor a mayor ID numérico. **¿Por qué es obligatoria esta línea?** Porque en la base de datos algunas consultas devuelven registros del más nuevo al más viejo (`ORDER BY created_at DESC`), y `binarySearchRecord` exige como precondición matemática que los IDs estén ordenados de menor a mayor.
   - **`targetId` (líneas 117–120):** Si el usuario escribió un ID en la cajita *"Buscar ID"* del frontend (`searchId`), busca ese ID. Si la dejó en blanco (`''`), toma automáticamente **`sortedById[sortedById.length - 1]?.id`** (el **último ID** de la tabla) para exhibir el peor escenario de la búsqueda lineal frente a la binaria.

3. **Las 6 competencias en vivo sobre datos reales de PostgreSQL (Líneas 122–172):**
   - **Líneas 123–128 (Competencia 1 — Búsqueda):** Ejecuta `measureExecution(() => linearSearchRecord(sortedById, targetId, 'id'))` contra `measureExecution(() => binarySearchRecord(sortedById, targetId, 'id'))`.
   - **Líneas 131–132 (Competencia 2 — Suma $O(n)$):** Ejecuta `sumSalesLinear(orders)` y `sumSalesLinear(invoices)` cronometrados.
   - **Líneas 135–140 (Competencia 3 — Pedidos por cliente):** Enfrenta `countOrdersByCustomerQuadratic(orders)` ($O(n^2)$) contra `countOrdersByCustomerLinear(orders)` ($O(n)$).
   - **Líneas 144–148 (Competencia 4 — Ordenamiento):** Enfrenta `bubbleSortRecords(selectedRecords, sortBy, 'desc')` ($O(n^2)$) contra `mergeSortRecords(selectedRecords, sortBy, 'desc')` ($O(n \log n)$) usando el criterio `sortBy` elegido en pantalla (`'date'` o `'amount'`).
   - **Líneas 151–152 (Competencia 5 — Ranking Top 10 productos):** Enfrenta `rankTopItemsQuadratic(orders, 10)` contra `rankTopItemsOptimized(orders, 10)`.
   - **Líneas 155–169 (Competencia 6 — Normalización de nombres reales de productos):**
     ```js
     const allProductStrings = [
       ...items.map((i) => i.nombre),
       ...orders.flatMap((o) => (o.products || []).map((p) => p.name || p.nombre)),
     ].filter(Boolean);
     ```
     Junta en un solo arreglo todos los nombres del catálogo (`items`) más todos los nombres históricos guardados dentro de cada pedido (`orders.flatMap(...)` aplana las listas de productos de todos los pedidos en una sola fila), `.filter(Boolean)` quita vacíos o `null`, y enfrenta `normalizeAndUnifyStringsQuadratic(allProductStrings)` contra `normalizeAndUnifyStringsLinear(allProductStrings)`.
   - **Línea 172 (Competencia 7 — Batería sintética escalable):** Llama a `runExperimentalBenchmarkSuite(sizes)` con `[100, 500, 1000, 2500]`.

4. **Armado del JSON de respuesta (Líneas 175–272):**
   Devuelve un objeto con dos grandes bloques que el frontend consume directamente:
   - `liveSystemMetrics`: conteo de filas reales (`datasetCounts`) y los resultados de las 6 pruebas reales (recortando muestras como `customers.slice(0, 15)`, `sampleTop5` y `sampleGroups.slice(0, 10)` para no mandar megabytes innecesarios por red).
   - `experimentalBenchmark`: la tabla de escalabilidad para $n = 100, 500, 1000, 2500$ y `optimizationSummary`.

---

## 2.3 Archivo 3 y Archivo 4: Script CLI (`runBenchmark.js`) y Pantalla React (`AlgorithmBenchmark.jsx`)

### A) `scripts/benchmark/runBenchmark.js` — Ejecución por Consola (Líneas 1–63)
- **Ubicación:** [runBenchmark.js](file:///Users/cesarjulioberrio/Documents/Appresso/scripts/benchmark/runBenchmark.js).
- **Cómo se dispara:** Ejecutando `npm run benchmark` (o `node scripts/benchmark/runBenchmark.js`) en la terminal, **sin siquiera necesitar levantar el navegador ni PostgreSQL**.
- **Qué hace línea por línea:**
  - **Líneas 14–19:** Importa `runExperimentalBenchmarkSuite` desde `operationalAlgorithms.js`, define `const sizes = [100, 500, 1000, 2500]` y ejecuta `const suite = runExperimentalBenchmarkSuite(sizes)`.
  - **Líneas 21–39 (Tabla 1 en consola):** Usa `.padEnd(24)` (rellena con espacios a la derecha para que las columnas queden derechitas en texto) e imprime para cada `n`: operaciones y milisegundos de Búsqueda Lineal $O(n)$, Búsqueda Binaria $O(\log n)$, cuántas veces menos operaciones hizo (`opsReductionRatio`x menos) y Suma de Ventas $O(n)$.
  - **Líneas 41–63 (Tabla 2 en consola):** Imprime lado a lado `BubbleSort O(n²)`, `MergeSort O(n log n)`, `Conteo Cliente O(n²)`, `Conteo Cliente O(n)`, `Top Ítems O(n log n)` y `Normalizar O(n)`.

### B) `frontend/src/components/AlgorithmBenchmark.jsx` — Laboratorio Visual en React (Líneas 1–400)
- **Ubicación:** [AlgorithmBenchmark.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/components/AlgorithmBenchmark.jsx).
- **Dónde se monta:** En `frontend/src/App.jsx` cuando el usuario selecciona la pestaña `activeView === 'benchmarks'`.
- **Qué función de `api.js` usa:** `fetchAlgorithmBenchmarks({ entity, sortBy, searchId })` ([api.js](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/api.js#L129-L137)), que construye la query string con `URLSearchParams` y hace `GET /operational/benchmarks?entity=...&sortBy=...&searchId=...`.
- **Los 5 estados de React (`useState`, líneas 22–34):**
  1. `entity` (`'orders'` por defecto): guarda qué tabla real se está analizando (`orders`, `invoices`, `payments` o `transactions`).
  2. `sortBy` (`'date'` por defecto): guarda si ordenamos por fecha (`'date'`) o por dinero (`'amount'`).
  3. `searchId` (`''` por defecto): guarda el ID escrito por el usuario para probar la búsqueda.
  4. `data` (`null` al inicio): guarda el JSON devuelto por `BenchmarkService.analyzeSystemData`.
  5. `loading` (`false` / `true`): deshabilita el botón y cambia su texto a `'Calculando...'` mientras responde el backend.
- **Disparo automático y manual (`useCallback` + `useEffect`, líneas 41–56):**
  - `runAnalysis` está envuelto en `useCallback(..., [entity, sortBy, searchId])`.
  - `useEffect(() => { runAnalysis(); }, [runAnalysis])` hace que **apenas abres la vista o apenas cambias un selector (`entity`, `sortBy` o `searchId`), se vuelva a disparar automáticamente la petición al backend**, además de poder pulsar el botón **"Ejecutar Comparación"** (`onClick={runAnalysis}`, línea 126).
- **Estructura visual (Líneas 59–398):**
  - `const live = data?.liveSystemMetrics;` $\to$ pinta las **6 tarjetas blancas/esmeralda** con los resultados sobre PostgreSQL en vivo (Líneas 135–318): (1) Búsqueda por ID, (2) Ordenamiento Bubble vs Merge, (3) Conteo por Cliente, (4) Suma de Ventas en 1 Pasada, (5) Normalización de Strings y (6) Ranking Top-5 de Ítems Más Vendidos.
  - `const exp = data?.experimentalBenchmark;` $\to$ pinta la **Tabla Experimental de Escalabilidad ($n = 100, 500, 1.000, 2.500$)** (Líneas 334–375) y debajo las **4 tarjetas Antes / Después / Impacto** (`exp.optimizationSummary.map(...)`, Líneas 380–395).

---

# PARTE 3: Inteligencia Artificial No-LLM — Bloque A: Estadística Descriptiva, Anomalías y Regresión con `simple-statistics`

> **¡Aclaración clave si el profesor pregunta por qué se llama "IA No-LLM"!**
> Hoy en día mucha gente cree que "IA" es solo conectar la API de ChatGPT o Gemini (que son *LLMs: Large Language Models*). En nuestro proyecto **NO usamos LLMs externos**: construimos **Machine Learning clásico y Estadística Computacional propia** corriendo 100% dentro de nuestro servidor Node.js con dos motores:
> 1. **`simple-statistics`** (`userBehaviorStats.js`): estadística matemática exacta, detección de valores atípicos (*outliers*), perfilamiento de fraude por usuario y regresión lineal por mínimos cuadrados.
> 2. **`@tensorflow/tfjs` con API Keras** (`tfModelManager.js`): redes neuronales artificiales multicapa entrenadas y guardadas en disco.

---

## 3.1 Estadística Explicada desde Cero (con Precios de Café Reales)

Imagina que anotamos el valor de **9 compras** hechas hoy en Appresso (ya ordenadas de menor a mayor en miles de pesos):
$$[10, \; 12, \; 15, \; 18, \; 20, \; 22, \; 25, \; 30, \; 200]$$
*(Fíjate que las primeras 8 compras son cafés y combos normales entre \$10.000 y \$30.000, pero la novena compra fue un pedido rarísimo de \$200.000).*

### 1. Media o Promedio ($\mu$ — `ss.mean`)
- **¿Qué es?** Sumar todos los datos y dividir entre cuántos hay:
  $$\mu = \frac{10 + 12 + 15 + 18 + 20 + 22 + 25 + 30 + 200}{9} = \frac{352}{9} \approx 39.11$$
- **El problema del promedio:** Por culpa de ese único pedido gigante de $200$, el promedio dice que un cliente típico gasta $39.11$, ¡cuando 8 de los 9 clientes gastaron $30$ o menos! El promedio se deja engañar fácilmente por valores extremos.

### 2. Mediana o Segundo Cuartil ($Q_2$ — `ss.medianSorted`)
- **¿Qué es?** Pones los datos en fila de menor a mayor y tomas **el dato que quedó parado exactamente en la mitad** (50% a su izquierda, 50% a su derecha).
- En nuestros 9 datos `[10, 12, 15, 18, (20), 22, 25, 30, 200]`, el del centro (posición 5) es **$20$**.
- **¿Por qué amamos la mediana en antifraude?** Porque aunque el último número fuera $200$ o $20.000.000$, ¡la mediana sigue siendo **$20$**! Es **robusta** frente a datos locos.

### 3. Cuartiles $Q_1$ (25%) y $Q_3$ (75%) (`ss.quantileSorted`)
Si la mediana parte la fila en **2 mitades** (50%), los **cuartiles** parten la fila ordenada en **4 cuartos iguales** (de 25% cada uno):
- **$Q_1$ (Primer Cuartil — Percentil 25%):** El valor por debajo del cual está el 25% de las compras más baratas (en nuestro ejemplo $\approx 15$).
- **$Q_2$ (Segundo Cuartil — Percentil 50%):** Es la misma **Mediana** ($20$).
- **$Q_3$ (Tercer Cuartil — Percentil 75%):** El valor por debajo del cual está el 75% de las compras (en nuestro ejemplo $\approx 25$).

### 4. Rango Intercuartílico ($IQR$ — `ss.interquartileRange`)
- **Fórmula:**
  $$IQR = Q_3 - Q_1$$
- **¿Qué significa en español sencillo?** Es el ancho de la **"zona normal del corazón del negocio"**, donde vive el 50% central de la gente común (quitando al 25% más tacaño y al 25% más gastón). En nuestro ejemplo: $IQR = 25 - 15 = 10$.

### 5. Valla de Tukey (`upperFence`) y Valores Atípicos (*Outliers*)
El matemático John Tukey inventó la regla universal para detectar si un número se salió demasiado de lo normal sin dejarse engañar por extremos:
$$\text{Valla Superior (upperFence)} = Q_3 + 1.5 \times IQR$$
$$\text{Valla Inferior (lowerFence)} = \max(0, \; Q_1 - 1.5 \times IQR)$$
- En nuestro ejemplo: $\text{upperFence} = 25 + 1.5 \times 10 = 25 + 15 = 40$.
- Cualquier compra que pase de **$40$** se declara matemáticamente un **Outlier (valor atípico)**. ¡Así cazamos automáticamente la compra de **$200$**!

### 6. Desviación Estándar ($\sigma$) y Puntaje Z (`Z-Score`)
- **Desviación Estándar ($\sigma$ — `ss.standardDeviation`):** Mide qué tan "dispersos o regados" están los datos alrededor del promedio $\mu$. Si todos los cafés valen exactamente \$15.000, $\sigma = 0$. Si unos valen \$5.000 y otros \$90.000, $\sigma$ es grande.
- **Z-Score (`ss.zScore`):**
  $$z = \frac{x - \mu}{\sigma}$$
  Responde en una frase simple: ***"¿A cuántas desviaciones estándar por encima del promedio global está este monto?"***.
  - Un $z = 0$ significa que gastaste exactamente igual al promedio.
  - Un $z = 1$ es normalito.
  - En estadística, superar **$z > 2.2$** (más de 2.2 desviaciones estándar arriba de la media) ocurre en menos del ~1.4% de los casos normales: **¡alerta de monto anormal!**

### 7. Regresión Lineal Simple ($y = mx + b$ y $R^2$)
Imagina que en los últimos 5 días vendiste `[18, 21, 24, 27, 30]` cafés. Si dibujas esos puntos en una cuadrícula (eje horizontal $x = \text{día}$, eje vertical $y = \text{cafés vendidos}$), puedes trazar con una regla **la línea recta que mejor pase por el medio de todos los puntos**:
$$\hat{y} = m \cdot x + b$$
- **$m$ (`slope` o pendiente):** Cuánto suben (o bajan) las ventas **por cada día que pasa**. En `[18, 21, 24, 27, 30]`, cada día vendes 3 cafés más, así que **$m = +3$** (si fuera negativa, ej. $m = -2$, las ventas estarían cayendo).
- **$b$ (`intercept` o intercepto):** En qué altura arranca la línea cuando $x = 0$ (en este ejemplo $b = 15$, porque para el día $x=1 \implies 3(1) + 15 = 18$). Para predecir el día $x = 6$: $\hat{y} = 3(6) + 15 = 33$ cafés.
- **$R^2$ (`rSquared` o coeficiente de determinación, va de $0$ a $1$):** Es la **"calificación de puntería"** de la línea recta:
  - Si $R^2 = 1.0$, los puntos forman una línea recta perfecta (100% explicada).
  - Si $R^2 = 0.85$, la tendencia lineal es muy fuerte (explica el 85% de la variación).
  - Si $R^2 \approx 0$, los puntos suben y bajan al azar como una nube sin rumbo lineal.

---

## 3.2 Archivo 5: `src/domain/ai/userBehaviorStats.js` (Explicación Completa Función por Función y Línea por Línea)

- **Ubicación exacta:** [userBehaviorStats.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/ai/userBehaviorStats.js) (700 líneas).
- **Capa:** Dominio IA (`src/domain/ai/`). Solo importa `const ss = require('simple-statistics');` en la línea 28.

---

### Función 1: `computeQuartileSummary(values = [])` (Líneas 48–120)

```js
function computeQuartileSummary(values = []) {
  const numeric = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0);

  if (numeric.length === 0) {
    return {
      count: 0, min: 0, max: 0, mean: 0, median: 0, stdDev: 0,
      q1: 0, q2: 0, q3: 0, iqr: 0, upperFence: 0, lowerFence: 0,
    };
  }

  const sorted = [...numeric].sort((a, b) => a - b);
  const mean = ss.mean(sorted);
  const median = ss.medianSorted(sorted);
  const stdDev = sorted.length > 1 ? ss.standardDeviation(sorted) : 0;
  const q1 = ss.quantileSorted(sorted, 0.25);
  const q2 = median;
  const q3 = ss.quantileSorted(sorted, 0.75);
  const iqr = sorted.length > 1 ? ss.interquartileRange(sorted) : 0;
  const upperFence = q3 + 1.5 * iqr;
  const lowerFence = Math.max(0, q1 - 1.5 * iqr);

  return {
    count: sorted.length,
    min: Number(ss.minSorted(sorted).toFixed(2)),
    max: Number(ss.maxSorted(sorted).toFixed(2)),
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    q1: Number(q1.toFixed(2)),
    q2: Number(q2.toFixed(2)),
    q3: Number(q3.toFixed(2)),
    iqr: Number(iqr.toFixed(2)),
    upperFence: Number(upperFence.toFixed(2)),
    lowerFence: Number(lowerFence.toFixed(2)),
  };
}
```
- **Líneas 50–52:** Convierte todo a número y filtra con `Number.isFinite(v) && v >= 0` para botar a la basura cualquier `NaN`, `null`, `Infinity` o monto negativo.
- **Líneas 55–70:** **Protección contra arreglos vacíos**: `simple-statistics` lanza un error si le pides la media o cuartil de `[]`. Si no hay datos válidos, devolvemos el objeto lleno de ceros sin romper el servidor.
- **Línea 73 (`const sorted = [...numeric].sort((a, b) => a - b);`):** Ordenamos **una sola vez** en $O(n \log n)$ (nota que `(a, b) => a - b` es indispensable en JS porque `.sort()` sin función ordena alfabéticamente como texto, donde `'100'` iría antes que `'20'`). Gracias a tener `sorted` ya ordenado, usamos las funciones rápidas `ss.medianSorted`, `ss.quantileSorted`, `ss.minSorted` y `ss.maxSorted` sin volver a ordenar.
- **Líneas 75–91:** Calcula `mean` ($\mu$), `median` ($Q_2$), `stdDev` ($\sigma$, protegido con `sorted.length > 1 ? ... : 0`), `q1` (percentil `0.25`), `q2`, `q3` (percentil `0.75`), `iqr`, `upperFence = q3 + 1.5 * iqr` y `lowerFence = Math.max(0, q1 - 1.5 * iqr)` (truncado en `0` porque no existen precios ni descuentos negativos).
- **Líneas 94–119:** Devuelve las 12 métricas redondeadas a 2 decimales.

---

### Función 2: `analyzeUserBehaviorProfiles({ users, orders, invoices, payments, transactions })` (Líneas 132–480)

Esta función es el corazón del detector estadístico de usuarios sospechosos (`GET /ai/user-profiles`). Veamos sus **6 etapas exactas**:

1. **Etapa 1 — Línea Base Global del Negocio (Líneas 140–163):**
   - Junta todos los montos mayores a 0 de `invoices` (`i.total`), `transactions` (`t.valor`) y `orders` (`o.totalAmount()` o `o.total`) en `allAmounts`, y todos los descuentos de facturas en `allDiscountPcts`.
   - Calcula `globalAmountStats = computeQuartileSummary(...)` y `globalDiscountStats = computeQuartileSummary(...)`. Si la base de datos estuviera recién instalada y vacía, usa semillas realistas `[10000, 18000, 25000, 32000, 45000]` y `[0, 5, 10, 15, 20]`.

2. **Etapa 2 — Creación de Cubetas por Usuario (`userBuckets` y `ensureBucket`, Líneas 166–200):**
   - Crea `const userBuckets = new Map()` (la ficha acumulada de cada persona) y `const userById = new Map()` (índice rápido `id -> usuario` en $O(1)$ para cruzar llaves foráneas sin ciclos lentos).
   - `ensureBucket(key, userMeta)` (líneas 169–192) limpia la llave en minúsculas y, si el usuario no tenía cubeta aún, se la crea con sus contadores en cero: `amounts: []`, `discountsPct: []`, `discountsValue: []`, `totalOperations: 0`, `cancelledCount: 0`, `invalidHashOrReceiptCount: 0`, `nightOperationsCount: 0`, `channels: {}` y `paymentMethods: {}`.

3. **Etapa 3 — Cruce Transversal de las 4 Tablas Operativas (Líneas 203–320):**
   - **Facturas (`for (const inv of invoices)`, líneas 203–234):** Suma `totalOperations++`, guarda `total`, `porcentaje_descuento` y `descuento`. Si `inv.estado === 'Anulada'` suma `cancelledCount++`; si `inv.estado === 'Alterada'` (cadena de hash rota) suma `invalidHashOrReceiptCount++`; cuenta el canal `inv.canal`.
   - **Pedidos (`for (const ord of orders)`, líneas 237–263):** Suma `totalOperations++`, guarda el monto del pedido, si `ord.status === 'Cancelled' || ord.status === 'Anulado'` suma `cancelledCount++`, y cuenta el canal.
   - **Pagos (`for (const pay of payments)`, líneas 266–288):** Suma `totalOperations++`, guarda `pay.monto`, si `pay.comprobante_valido === false || pay.estado === 'Sospechoso' || pay.estado === 'Rechazado'` suma `invalidHashOrReceiptCount++`, y cuenta `pay.metodo_pago`.
   - **Transacciones Antifraude (`for (const txn of transactions)`, líneas 291–320):** Suma `totalOperations++`, guarda `txn.valor`, si `txn.estado === 'Hash inválido' || txn.es_anomalia` suma `invalidHashOrReceiptCount++`. Además lee la hora con `new Date(txn.fecha_txn).getHours()` (línea 312): **si `hour >= 0 && hour <= 5` (entre medianoche y 5:59 a.m.), suma `bucket.nightOperationsCount++`**.

4. **Etapa 4 — Estadísticas Individuales de cada Cubeta (Líneas 326–356):**
   - Salta usuarios con `0` operaciones (`continue`, línea 328).
   - Calcula `quartiles = computeQuartileSummary(bucket.amounts)` y `discountQuartiles = computeQuartileSummary(bucket.discountsPct)`.
   - Calcula el porcentaje de cancelación `cancellationRate = (cancelledCount / totalOperations) * 100` (líneas 335–338).
   - Define `upperFence` (líneas 343–346) como el máximo entre la valla global, la valla propia del usuario y un piso de seguridad de `150000` COP, y cuenta cuántos montos de ese usuario la superaron (`outlierAmounts`, línea 348).
   - Calcula **`maxAmountZScore`** con `ss.zScore(quartiles.max, globalAmountStats.mean, globalAmountStats.stdDev)` (líneas 351–356).

5. **Etapa 5 — Las 5 Reglas Exactas de Puntaje `anomalyScore` (0 a 100 puntos, Líneas 359–424):**
   *(¡Memoriza esta tabla de puntos! Es una pregunta clásica del profesor)*:
   - **Regla 1 — Descuentos (líneas 363–380):**
     - Si `maxDiscountPct > 30` (viola el tope máximo del 30% de la empresa) $\implies$ **`+35 puntos`** (alerta `DESCUENTO_ABUSADO`, severidad `Alta`).
     - Si no pasó de 30%, pero superó `Math.max(20, globalDiscountStats.upperFence)` $\implies$ **`+18 puntos`** (alerta `DESCUENTO_ATIPICO_IQR`, severidad `Media`).
   - **Regla 2 — Anulaciones sospechosas (líneas 383–390):**
     - Si `cancelledCount >= 2 || cancellationRate >= 25` (2 o más anuladas, o un cuarto de todo lo que opera termina anulado) $\implies$ **`+30 puntos`** (alerta `ANULACIONES_SOSPECHOSAS`, severidad `Alta`).
   - **Regla 3 — Comprobante falso, hash alterado o ráfaga anómala (líneas 393–401):**
     - Si `invalidHashOrReceiptCount > 0` $\implies$ suma **`25 puntos por incidente` con tope de `40` puntos** (`Math.min(40, bucket.invalidHashOrReceiptCount * 25)`, alerta `COMPROBANTE_O_FIRMA_INVALIDA`, severidad `Crítica`).
   - **Regla 4 — Montos atípicos por Cuartil o Z-Score (líneas 404–411):**
     - Si `outlierAmounts.length > 0 || maxAmountZScore > 2.2` $\implies$ **`+20 puntos`** (alerta `MONTO_ATIPICO_CUARTIL`, severidad `Media`).
   - **Regla 5 — Operaciones de madrugada (líneas 414–421):**
     - Si `nightOperationsCount >= 3` (3 o más operaciones entre 00:00 y 05:59) $\implies$ **`+15 puntos`** (alerta `PATRON_HORARIO_MADRUGADA`, severidad `Media`).
   - **Línea 424:** Limita el puntaje máximo a 100 con `anomalyScore = Math.min(100, Math.round(anomalyScore))`.

6. **Etapa 6 — Semáforo de Clasificación y Ordenamiento por Riesgo (Líneas 427–479):**
   - **Líneas 427–432:**
     - `anomalyScore >= 50` $\implies$ **`'SOSPECHOSO'`** (Rojo).
     - `anomalyScore >= 25` (entre 25 y 49) $\implies$ **`'EN_OBSERVACION'`** (Amarillo/Ámbar).
     - Menor a 25 $\implies$ **`'NORMAL'`** (Verde).
   - **Línea 467 (`profiles.sort((a, b) => b.anomalyScore - a.anomalyScore)`):** Pone de primeros en la tabla a los usuarios más peligrosos.

---

### Función 3: `predictDemandWithSimpleStatistics(dailySeries = [], horizonDays = 7)` (Líneas 499–553)

```js
function predictDemandWithSimpleStatistics(dailySeries = [], horizonDays = 7) {
  const cleanSeries = dailySeries
    .map((val, idx) => [idx + 1, Number(val)])
    .filter((pair) => Number.isFinite(pair[1]) && pair[1] >= 0);

  if (cleanSeries.length < 2) {
    return {
      slope: 0, intercept: 0, rSquared: 0, trend: 'estable', forecasts: [],
    };
  }

  const regression = ss.linearRegression(cleanSeries);
  const predictFn = ss.linearRegressionLine(regression);
  const r2 = ss.rSquared(cleanSeries, predictFn);
  const n = cleanSeries.length;

  const forecasts = [];
  for (let d = 1; d <= horizonDays; d++) {
    const futureDay = n + d;
    const rawPred = predictFn(futureDay);
    forecasts.push({
      dayIndex: futureDay,
      daysAhead: d,
      predictedDemand: Math.max(0, Number(rawPred.toFixed(2))),
    });
  }

  const trend =
    regression.m > 0.5 ? 'creciente' : regression.m < -0.5 ? 'decreciente' : 'estable';

  return {
    slope: Number(regression.m.toFixed(4)),
    intercept: Number(regression.b.toFixed(4)),
    rSquared: Number((Number.isFinite(r2) ? r2 : 0).toFixed(4)),
    trend,
    historicalStats: computeQuartileSummary(cleanSeries.map((p) => p[1])),
    forecasts,
  };
}
```
- **Líneas 501–503:** Convierte `[18, 22, 25]` en coordenadas cartesianas `[[1, 18], [2, 22], [3, 25]]` (día 1, día 2, día 3...).
- **Líneas 506–514:** En geometría elemental, **por un solo punto pasan infinitas rectas**; necesitamos mínimo 2 puntos (`cleanSeries.length < 2`) para trazar una línea. Si llegan menos de 2 datos, devuelve ceros sin fallar.
- **Línea 517 (`ss.linearRegression(cleanSeries)`):** Calcula por **Mínimos Cuadrados Ordinarios (OLS)** el objeto `{ m, b }` (pendiente e intercepto).
- **Línea 519 (`ss.linearRegressionLine(regression)`):** Devuelve una función matemática lista para usar: le metes cualquier día `x` y te calcula `m * x + b`.
- **Línea 521 (`ss.rSquared(cleanSeries, predictFn)`):** Calcula el coeficiente de determinación $R^2 \in [0, 1]$. (En la línea 548 validamos `Number.isFinite(r2) ? r2 : 0` porque si todos los días vendiste exactamente el mismo número, ej. `[20, 20, 20]`, la varianza total es `0` y `0/0` da `NaN` en `simple-statistics`).
- **Líneas 526–538:** Proyecta los próximos `horizonDays` días (`n + 1`, `n + 2`, ..., `n + 7`), usando `Math.max(0, ...)` para que si la pendiente es muy negativa nunca prediga "-5 cafés".
- **Líneas 541–542:** Si la pendiente sube más de media unidad al día (`m > 0.5`) la tendencia es `'creciente'`; si cae más de media unidad (`m < -0.5`) es `'decreciente'`; si está entre `-0.5` y `0.5` es `'estable'`.

---

### Función 4: `discoverOperationalPatterns({ orders, invoices, payments, transactions })` (Líneas 564–692)

- **Líneas 571–577 (`byHour`):** Crea de antemano las **24 casillas del reloj** (`00:00` hasta `23:00`) con `Array.from({ length: 24 }, ...)`, cada una con `{ hour, label, operations: 0, totalAmount: 0, anomalies: 0 }`. Como la hora `hour` es un número de `0` a `23`, acceder a `byHour[hour]` toma tiempo constante **$O(1)$**.
- **Líneas 580–588:** Prepara acumuladores para los 4 canales (`presencial`, `web`, `app`, `domicilio`) y el diccionario `byPaymentMethod = {}`.
- **Líneas 593–625 (`registerRecord`):** Función ayudante interna que recibe cualquier operación, le extrae la hora (`d.getHours()`), suma `1` en `byHour[hour].operations`, suma el dinero, suma `1` en `anomalies` si fue anómala, actualiza `byChannel` y `byPaymentMethod`, y mete el monto en `allAmounts`.
- **Líneas 628–670:** Pasa todas las colecciones por `registerRecord` definiendo qué cuenta como anomalía en cada una:
  - En `orders`: `o.status === 'Cancelled'`.
  - En `invoices`: `Anulada`, `Alterada` o `porcentaje_descuento > 30`.
  - En `payments`: `comprobante_valido === false` o `estado !== 'Aprobado'`.
  - En `transactions`: `es_anomalia` verdadero o `estado === 'Hash inválido'`.
- **Líneas 673–680:**
  - `peakHour`: ordena una copia de `byHour` de mayor a menor `operations` y toma la posición `[0]` (la **hora pico de ventas**).
  - `highestAnomalyHour`: ordena una copia de `byHour` de mayor a menor `anomalies` y toma la posición `[0]` (la **hora más peligrosa del día**).
  - `dominantChannel`: ordena `Object.entries(byChannel)` por `count` y saca el canal rey de la cafetería.

---

# PARTE 4: Inteligencia Artificial No-LLM — Bloque B: Redes Neuronales con TensorFlow.js y Keras

## 4.1 Diccionario de Redes Neuronales desde Cero (Sin Jerga Difícil)

Si nunca has visto Inteligencia Artificial en tu vida, lee estas 10 definiciones con calma. Con esto vas a entender mejor que nadie qué hace `tfModelManager.js`:

1. **¿Qué es un Tensor (`tf.tensor2d`)?**
   - Un **tensor** es simplemente el nombre elegante que usa TensorFlow para llamar a una **tabla o matriz de números** preparada para hacer multiplicaciones rápidas:
     - Tensor 1D = una fila simple `[24500, 14, 0.4, ...]`.
     - **Tensor 2D (`tf.tensor2d`)** = una hoja de Excel con **filas y columnas** (por ejemplo, $72$ operaciones de entrenamiento como filas $\times$ $8$ características como columnas $\implies$ forma `[72, 8]`).

2. **¿Qué es Normalizar entre 0 y 1 (*Min-Max Scaling*) y por qué es obligatorio?**
   - Imagina meterle a una neurona en la columna 0 el monto **`280000`** (pesos) y al lado en la columna 3 la bandera de firma falsa **`1`**. Como `280000` es 280 mil veces más grande que `1`, ¡la neurona solo "escucharía" al monto y aplastaría por completo a las demás columnas!
   - **Normalizar Min-Max** pone a **todas las columnas a competir en igualdad de condiciones entre `0` y `1`** usando una regla de tres sencillísima:
     $$x_{\text{norm}} = \frac{x - x_{\min}}{x_{\max} - x_{\min}}$$
   - *Ejemplo real:* Si el monto mínimo visto es $1.000$ y el máximo es $301.000$ (rango $= 300.000$), una compra de $151.000$ se convierte en $\frac{151000 - 1000}{300000} = \mathbf{0.5}$. ¡Ahora montos, horas y descuentos hablan todos el mismo idioma del `0` al `1`!

3. **¿Qué es *Data Augmentation* (Aumento Sintético de Datos)?**
   - Una red neuronal aprende con ejemplos, igual que un estudiante practicando ejercicios antes de un parcial. Si la base de datos de una cafetería nueva apenas tiene 25 o 40 operaciones, son muy poquitos ejemplos y la red podría aprenderse esos 25 casos "de memoria" sin saber generalizar.
   - **Data Augmentation** toma cada operación real y fabrica **clones ligeramente variados** (por ejemplo, le sube o baja un $\pm 4\%$ o $\pm 8\%$ al monto, o mueve 1 hora el reloj, manteniendo intacta su etiqueta de si era Normal o Fraude). Con `augmentationFactor = 2`, por cada 1 ejemplo original fabricamos 2 variantes nuevas: ¡multiplicamos por **3x** el material de estudio!

4. **¿Qué es una Red Neuronal Secuencial (`tf.sequential`)?**
   - Es una cadena de montaje en línea recta donde los datos entran por la **Capa 1**, su resultado pasa a la **Capa 2**, y así hasta llegar a la **Capa de Salida**.

5. **¿Qué hace una Capa Densa (`tf.layers.dense`)?**
   - *"Densa"* o *"Totalmente Conectada"* significa que **cada neurona de esa capa recibe cables desde TODAS las entradas de la capa anterior**.
   - ¿Qué hace una neurona por dentro? Multiplica cada dato de entrada por una "importancia" llamada **peso (`weight`, $w$)**, los suma todos y les agrega un ajuste base llamado **sesgo (`bias`, $b$)**:
     $$z = (x_1 \cdot w_1 + x_2 \cdot w_2 + \dots + x_8 \cdot w_8) + b$$
   - Cuando entrenamos la red, **lo único que aprende y guarda en `weights.bin` son esos números $w$ y $b$**.

6. **¿Qué son las funciones de activación (`relu`, `sigmoid`, `linear`)?**
   Después de calcular $z$, cada neurona le aplica un filtro:
   - **`relu` (*Rectified Linear Unit*):** $\text{ReLU}(z) = \max(0, z)$. En español: *"Si el número dio negativo, conviértelo en `0`; si dio positivo, déjalo pasar igual"*. Se usa en las **capas ocultas intermedias** porque permite que la red aprenda curvas y combinaciones complejas (por ejemplo: *"monto alto SOLO ES MALO cuando además es de madrugada"*).
   - **`sigmoid` (Función Sigmoide):** $\sigma(z) = \frac{1}{1 + e^{-z}}$. Aplasta cualquier número (sea $-50$ o $+80$) suavemente dentro del intervalo **`(0, 1)`**, es decir, **un porcentaje de probabilidad entre 0% y 100%**. ¡Por eso es perfecta para la última neurona del **Clasificador de Fraude** (`0.92` = 92% probabilidad de fraude)!
   - **`linear` (Lineal / Identidad):** $f(z) = z$. Deja salir el número continuo tal cual sin aplastarlo entre 0 y 1. Se usa en la última capa del **Regresor de Demanda y Monto**, porque ahí queremos predecir cantidades abiertas (ej. `32` cafés y `$464.000` pesos), no sí/no.

7. **¿Qué hace `dropout({ rate: 0.1 })`?**
   - Imagina un grupo de estudio donde un solo compañero sabelotodo responde todo y los demás se vuelven vagos. Durante el entrenamiento, **`Dropout(0.1)` apaga al azar el 10% de las neuronas en cada ronda**, obligando a todas las neuronas a aprender patrones útiles y evitando el **sobreajuste (*overfitting*)** (memorizar de machete). Cuando ya vamos a predecir en la vida real (`.predict()`), Keras vuelve a encender automáticamente el 100% de las neuronas.

8. **¿Qué es la Función de Pérdida (`loss`: `binaryCrossentropy` vs `meanSquaredError`)?**
   - Es el **"medidor de equivocación"** de la red (mientras más cercano a `0`, mejor):
     - **`binaryCrossentropy` (Entropía Cruzada Binaria):** Castiga durísimo al clasificador cuando dice *"estoy 99% seguro de que es Normal"* y en realidad era Fraude (`1`). Es la pérdida estándar mundial para clasificación Sí/No (`0` o `1`).
     - **`meanSquaredError` (`MSE` o Error Cuadrático Medio):** Resta `(valor real - valor predicho)`, lo eleva al cuadrado y saca el promedio. Es la pérdida estándar mundial para regresión numérica (predecir unidades y dinero).

9. **¿Qué hace el Optimizador `adam` (`tf.train.adam`)?**
   - Si `loss` te dice *"te equivocaste por tanto"*, **`adam`** (*Adaptive Moment Estimation*) es el mecánico inteligente que gira las perillas de todos los pesos $w$ y sesgos $b$ un poquito (`learningRate = 0.025` o `0.03`) en la dirección que reduce el error.

10. **¿Qué son `epochs` (Épocas) y `batchSize` (Tamaño de Lote)?**
    - **1 Época (`epoch`):** Es cuando la red neuronal terminó de leer y repasar **todo el cuaderno completo de ejemplos una vez** (nosotros entrenamos `35` épocas por defecto, o `40` desde el botón de React).
    - **`batchSize: 16`:** En vez de ajustar los pesos después de cada ejemplo suelto o esperar al final de todo el libro, repasa de **16 en 16 ejemplos** y ajusta las perillas en cada grupito de 16.

---

## 4.2 Archivo 6: `src/domain/ai/tfModelManager.js` (Explicación Completa Parte por Parte y Línea por Línea)

- **Ubicación exacta:** [tfModelManager.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/ai/tfModelManager.js) (1,042 líneas).
- **Importaciones clave (Líneas 31–35):**
  - `fs = require('fs/promises')` y `path = require('path')` para guardar/leer los modelos en disco.
  - `tf = require('@tensorflow/tfjs')`: usamos el motor puro JavaScript de TensorFlow para que funcione en cualquier Mac, Windows o Linux del profesor sin errores de compilación de C++ (`node-gyp`).

### Constantes Iniciales de Codificación (Líneas 38–60)
- **`DEFAULT_MODELS_DIR` (líneas 38–41):** Apunta a `src/infrastructure/ai/saved_models`, donde viven las subcarpetas `fraud_classifier/` y `demand_regressor/`.
- **¿Por qué existen `PAYMENT_METHOD_CODES` (líneas 44–52) y `CHANNEL_CODES` (líneas 55–60)?**
  Las redes neuronales **NO saben multiplicar palabras** como `'Efectivo'` o `'Domicilio'`; solo entienden números. Por eso codificamos cada medio de pago y cada canal según su nivel de exposición al fraude entre `0` y `1`:
  - Medios de pago: `efectivo: 0.1`, `tarjeta: 0.4`, `nequi: 0.5`, `daviplata: 0.5`, `transferencia: 0.6`, `pse: 0.7`, `cripto: 0.95`.
  - Canales: `presencial: 0.2`, `app: 0.5`, `web: 0.6`, `domicilio: 0.8`.

---

### Pieza 1: `createFileSystemIOHandler(modelDir)` — Guardado y Carga Real en Disco (Líneas 75–166)

> **¡Atención Juan Esteban!** Guardar y cargar los modelos entrenados en disco es un **requisito explícito de la rúbrica**. Como usamos `@tensorflow/tfjs` puro (que originalmente fue diseñado para navegadores y no trae `file://` nativo de Node), nosotros mismos programamos este adaptador profesional `IOHandler` con `fs/promises`.

```js
function createFileSystemIOHandler(modelDir) {
  return {
    async save(modelArtifacts) {
      await fs.mkdir(modelDir, { recursive: true });
      const weightsFileName = 'weights.bin';
      const modelJson = {
        modelTopology: modelArtifacts.modelTopology,
        format: modelArtifacts.format,
        generatedBy: modelArtifacts.generatedBy,
        convertedBy: modelArtifacts.convertedBy || null,
        weightsManifest: [
          {
            paths: [weightsFileName],
            weights: modelArtifacts.weightSpecs,
          },
        ],
      };

      await fs.writeFile(
        path.join(modelDir, 'model.json'),
        JSON.stringify(modelJson, null, 2),
        'utf8'
      );

      if (modelArtifacts.weightData) {
        const buffer = Buffer.from(modelArtifacts.weightData);
        await fs.writeFile(path.join(modelDir, weightsFileName), buffer);
      }

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON',
          weightDataBytes: modelArtifacts.weightData
            ? modelArtifacts.weightData.byteLength
            : 0,
        },
      };
    },

    async load() {
      const modelJsonPath = path.join(modelDir, 'model.json');
      const rawJson = await fs.readFile(modelJsonPath, 'utf8');
      const modelJson = JSON.parse(rawJson);

      const weightsManifest = modelJson.weightsManifest || [];
      const weightSpecs = [];
      const weightBuffers = [];

      for (const group of weightsManifest) {
        if (Array.isArray(group.weights)) {
          weightSpecs.push(...group.weights);
        }
        for (const relPath of group.paths || []) {
          const buf = await fs.readFile(path.join(modelDir, relPath));
          weightBuffers.push(buf);
        }
      }

      const combined = Buffer.concat(weightBuffers);
      const weightData = combined.buffer.slice(
        combined.byteOffset,
        combined.byteOffset + combined.byteLength
      );

      return {
        modelTopology: modelJson.modelTopology,
        weightSpecs,
        weightData,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
      };
    },
  };
}
```
- **Cuando se llama `await model.save(handler)` (`save`, líneas 78–119):**
  1. `fs.mkdir(modelDir, { recursive: true })` crea la carpeta (ej. `saved_models/fraud_classifier`) si no existía.
  2. Construye `model.json` guardando el **plano arquitectónico** de las capas (`modelTopology`) y el índice de cómo leer los pesos (`weightsManifest` con nombres, tamaños `shape` y tipos `float32`).
  3. Escribe `model.json` en texto UTF-8 (líneas 98–102).
  4. Toma los pesos matemáticos entrenados (`modelArtifacts.weightData`, un bloque binario de memoria `ArrayBuffer`), lo convierte en `Buffer` de Node y lo escribe en **`weights.bin`** (líneas 105–108).
- **Cuando se llama `await tf.loadLayersModel(handler)` (`load`, líneas 123–164):**
  1. Lee y parsea `model.json` desde el disco (líneas 125–129).
  2. Recorre `weightsManifest`, junta las especificaciones `weightSpecs` y lee el archivo binario `weights.bin` con `fs.readFile` (líneas 138–146).
  3. **Líneas 149–153 (`combined.buffer.slice(...)`):** Une los buffers y recorta exactamente desde `byteOffset` hasta `byteOffset + byteLength` para devolver un `ArrayBuffer` limpio que TensorFlow usa para revivir las neuronas con su memoria exacta, ¡sin tener que volver a entrenar al reiniciar el servidor!

---

### Pieza 2: `extractOperationFeatures(operation = {})` — Las 8 Entradas Exactas del Clasificador (Líneas 185–262)

Convierte cualquier factura, pago, transacción o formulario del simulador en una lista fija de **8 números** (`[0]` al `[7]`):

| Posición | Variable extraída | Líneas | ¿Qué mide y cómo se limpia? |
| :---: | :--- | :---: | :--- |
| **`[0]`** | `rawAmount` (Monto COP) | 187–189, 253 | Lee `monto ?? valor ?? value ?? total ?? 15000`, acotado a $\ge 0$. |
| **`[1]`** | `hour` (Hora del día `0..23`) | 191–202, 254 | Saca `.getHours()` de la fecha (o usa `operation.hora ?? 12`), acotado entre `0` y `23`. |
| **`[2]`** | `methodCode` (Medio de pago) | 205–210, 255 | Busca en `PAYMENT_METHOD_CODES` (ej. `'efectivo'` $\to 0.1$, `'transferencia'` $\to 0.6$). |
| **`[3]`** | `invalidSignatureFlag` (Firma falsa) | 213–221, 256 | Vale **`0`** si la firma HMAC / comprobante es legítimo y **`1`** si está alterada o falsa. |
| **`[4]`** | `frequency` (Ráfaga ventana) | 224–229, 257 | Cuántas transacciones seguidas van en ventana corta (mínimo `1`). |
| **`[5]`** | `discountPct` (% Descuento) | 232–237, 258 | Porcentaje de descuento aplicado en la factura ($\ge 0$). |
| **`[6]`** | `userCancelRate` (% Anulaciones) | 240–242, 259 | Porcentaje histórico de pedidos/facturas anuladas por ese usuario ($\ge 0$). |
| **`[7]`** | `channelCode` (Canal de venta) | 245–249, 260 | Busca en `CHANNEL_CODES` (`presencial: 0.2`, `app: 0.5`, `web: 0.6`, `domicilio: 0.8`). |

---

### Pieza 3: Escalamiento Tensorial y Memoria RAM (`computeNormalizationScaler` y `normalizeFeaturesWithScaler`, Líneas 276–314)

```js
function computeNormalizationScaler(featureMatrix) {
  return tf.tidy(() => {
    const tensor = tf.tensor2d(featureMatrix);
    const minTensor = tensor.min(0);
    const maxTensor = tensor.max(0);
    const min = Array.from(minTensor.dataSync());
    const max = Array.from(maxTensor.dataSync());
    return { min, max };
  });
}
```
- **Líneas 279–283:** Convierte la matriz JS en un tensor 2D `[N, 8]`, saca el mínimo de cada una de las 8 columnas con `tensor.min(0)` y el máximo con `tensor.max(0)` (el `0` significa *"aplasta las filas verticalmente para que queden 8 mínimos y 8 máximos"*), y con `.dataSync()` los baja a arreglos normales de JS que guardaremos en `scaler.json`.
- **¡Pregunta fija de sustentación! ¿Por qué envolvemos esto en `tf.tidy(() => ...)` y en otras partes llamamos `.dispose()`?**
  - En JavaScript normal, cuando dejas de usar una variable, el recolector de basura (*Garbage Collector* de V8) limpia la RAM solo. **¡Pero los tensores de TensorFlow viven fuera del recolector de V8!** Si creas miles de tensores y no los destruyes, se produce una **fuga de memoria (*memory leak*)** hasta tumbar el servidor.
  - **`tf.tidy(() => ...)`** limpia automáticamente todos los tensores temporales creados adentro apenas termina la función **síncrona** (`computeNormalizationScaler`, `classifyOperation`, `predictExpectedDemandAndAmount`).
  - **¿Y por qué en `trainAndSaveModels` usamos `xs.dispose()` manual en vez de `tf.tidy()`?** Porque `tf.tidy()` **NO soporta funciones asíncronas con `await`** como `await model.fit(...)`. Por eso después del `await` liberamos explícitamente `xs.dispose()`, `ys.dispose()`, `dXs.dispose()`, `dYs.dispose()` y al reentrenar destruimos el modelo viejo con `this.fraudModel.dispose()`.

- **`normalizeFeaturesWithScaler(featureMatrix, scaler)` (Líneas 300–314):**
  - Aplica `(val - min) / range` columna por columna.
  - Si `range <= 1e-9` (por ejemplo todos los ejemplos tenían el mismo valor en una columna), devuelve `0` evitando dividir por cero.
  - Acota con `Math.min(1.5, Math.max(-0.2, ...))` (*clipping suave*) para que si mañana llega una compra aún más cara que el máximo histórico del entrenamiento, salga como `1.2` o `1.5` sin reventar las neuronas con un número gigante.

---

### Pieza 4: `augmentFraudDataset` y `buildBaseFraudSamples` (Líneas 327–467)

1. **`augmentFraudDataset(samples = [], augmentationFactor = 2)` (Líneas 327–385):**
   - Copia las muestras base intactas (`const augmented = [...samples]`).
   - Por cada muestra `i` y cada clon `k = 1..augmentationFactor`:
     - Calcula `sign = (i + k) % 2 === 0 ? 1 : -1` (alterna `+` y `-` de forma 100% determinista sin `Math.random`) y `jitter = 0.04 * k * sign` ($\pm 4\%$ en el clon 1, $\pm 8\%$ en el clon 2).
     - Varía suavemente el monto (`amount * (1 + jitter)` con piso `1000`), desplaza `+1` hora en los clones pares (`(hour + ...) % 24`), suma `+1` a la frecuencia si era fraude, y varía suavemente el descuento, **manteniendo intactos `methodCode`, `invalidSig`, `cancelRate`, `channelCode` y la etiqueta `label` (`0` o `1`)**.

2. **`buildBaseFraudSamples(realOperations = [])` (Líneas 396–467):**
   - **Paso 1 (Líneas 400–419):** Toma todas las operaciones reales de PostgreSQL, les saca sus 8 features con `extractOperationFeatures(op)` y les pone etiqueta supervisada `label: 1` (fraude) si cumplen alguna evidencia real (`es_anomalia`, `'Hash inválido'`, `'Alterada'`, `comprobante_valido === false`, `features[3] === 1`, `features[4] >= 5`, `features[5] > 30`, o monto $> 180.000$ de madrugada / con alta anulación), o `label: 0` si son sanas.
   - **Paso 2 (Líneas 422–464):** Agrega **24 arquetipos semilla balanceados**: **12 normales** (compras diurnas de \$9.500 a \$42.000 con firmas válidas y descuentos $\le 15\%$) y **12 de fraude** repartidos en las 4 familias de ataque de Appresso (A: Firma falsa, B: Ráfaga $\ge 7$ ops, C: Descuento abusivo $42\%\text{–}55\%$, D: Montos de \$250.000–\$340.000 en la madrugada). Así la red siempre conoce ambos mundos incluso el día 1 de instalación.

---

### Pieza 5: Construcción de las 2 Redes Neuronales Keras (`buildKerasFraudClassifierModel` y `buildKerasDemandRegressorModel`, Líneas 488–572)

| Característica | Modelo 1: `buildKerasFraudClassifierModel()` (Líneas 488–525) | Modelo 2: `buildKerasDemandRegressorModel()` (Líneas 538–572) |
| :--- | :--- | :--- |
| **Tipo de problema** | **Clasificación Binaria Supervisada** (`0` Normal vs `1` Fraude) | **Regresión Multivariable Multisalida** (Unidades + Monto COP) |
| **Entradas (`inputShape`)** | **`[8]`** (las 8 features de `extractOperationFeatures`) | **`[5]`** (`[día/7, hora/23, canalCod, desc/100, promHist/100]`) |
| **Capa Oculta 1** | `Dense(16, activation: 'relu', kernelInitializer: 'glorotUniform')` | `Dense(12, activation: 'relu')` |
| **Regularización** | `Dropout(rate: 0.1)` (apaga 10% al entrenar) | Sin dropout (malla limpia de 196 escenarios) |
| **Capa Oculta 2** | `Dense(8, activation: 'relu')` | `Dense(8, activation: 'relu')` |
| **Capa de Salida** | **`Dense(1, activation: 'sigmoid')`** $\to$ probabilidad en `(0, 1)` | **`Dense(2, activation: 'linear')`** $\to$ `[unidadesNorm, montoNorm]` |
| **Optimizador** | `tf.train.adam(0.025)` | `tf.train.adam(0.03)` |
| **Función de Pérdida** | **`'binaryCrossentropy'`** (métrica: `'accuracy'`) | **`'meanSquaredError'`** (métrica: `'mse'`) |

---

### Pieza 6: Todos los Métodos de la Clase `TfModelManager` (Líneas 578–1031)

1. **`constructor({ modelsDir = DEFAULT_MODELS_DIR, logger })` (Líneas 586–604):**
   Configura las rutas `this.fraudModelDir` (`.../saved_models/fraud_classifier`) y `this.demandModelDir` (`.../saved_models/demand_regressor`), e inicializa en `null` las 5 propiedades en RAM (`fraudModel`, `fraudScaler`, `fraudMetadata`, `demandModel`, `demandMetadata`).

2. **`ensureReady(realOperations = [])` (Líneas 618–632) — Carga Perezosa Inteligente en 3 Niveles:**
   - **Nivel 1 (RAM, línea 620):** Si `this.fraudModel && this.fraudScaler && this.demandModel` ya están en memoria, devuelve `this.getStatus()` al instante en $O(1)$.
   - **Nivel 2 (Disco, líneas 625–628):** Si el servidor acaba de arrancar, llama a `await this.loadModelsFromDisk()`. Si existen los archivos `model.json` y `weights.bin`, los carga en milisegundos sin gastar CPU entrenando.
   - **Nivel 3 (Entrenamiento en frío, línea 631):** Solo si tampoco existían en disco, ejecuta `this.trainAndSaveModels({ realOperations, epochs: 35, augmentationFactor: 2 })`.

3. **`loadModelsFromDisk()` (Líneas 639–675):**
   Envuelto en `try / catch`: lee `scaler.json` y ambos `metadata.json` con `fs.readFile`, reconstruye ambas redes con `await tf.loadLayersModel(fraudHandler)` y `await tf.loadLayersModel(demandHandler)`, guarda todo en `this.*` y retorna `true` (o `false` si faltaba algún archivo).

4. **`trainAndSaveModels({ realOperations = [], epochs = 35, augmentationFactor = 2 })` (Líneas 691–852):**
   - **Entrenamiento Red 1 (Fraude, líneas 697–770):** Arma muestras base $\to$ aplica `augmentFraudDataset` $\to$ calcula `scaler` $\to$ normaliza `rawFeatures` $\to$ crea `xs` y `ys` con `tf.tensor2d` $\to$ entrena con `await fraudModel.fit(xs, ys, { epochs, batchSize: 16, shuffle: true, verbose: 0 })` $\to$ libera memoria con `xs.dispose(); ys.dispose();` $\to$ extrae `finalLoss` y `finalAccuracy` de la última época $\to$ guarda en disco **`model.json`**, **`weights.bin`**, **`scaler.json`** y **`metadata.json`**.
   - **Entrenamiento Red 2 (Demanda, líneas 773–838):** Construye una malla de **$7 \text{ días} \times 7 \text{ horas} \times 4 \text{ canales} = 196 \text{ escenarios}$** modelando hora pico (`1.35x` entre 11h y 19h), fin de semana (`1.25x` sábado y domingo) y empuje digital (`1.2x`), escalando objetivos (`expectedUnits / 100` y `expectedAmount / 1000000`) $\to$ entrena `30` épocas $\to$ hace `dXs.dispose(); dYs.dispose();` $\to$ guarda en disco `model.json`, `weights.bin` y `metadata.json` en `demand_regressor/`.
   - **Limpieza de modelos previos (líneas 841–851):** Si ya había modelos en RAM de antes, les hace `.dispose()`, asigna los nuevos y devuelve `this.getStatus()`.

5. **`classifyOperation(operation = {})` (Líneas 864–955) — Inferencia Neuronal + IA Explicable (XAI):**
   - Llama `await this.ensureReady()`.
   - Saca las 8 features con `extractOperationFeatures(operation)` y las escala con `normalizeFeaturesWithScaler([rawFeatures], this.fraudScaler)`.
   - Corre la red neuronal dentro de `tf.tidy()`:
     ```js
     const nnProbability = tf.tidy(() => {
       const inputTensor = tf.tensor2d(normalized);
       const outputTensor = this.fraudModel.predict(inputTensor);
       return outputTensor.dataSync()[0];
     });
     ```
   - **¿Por qué sumamos `structuralBoost` y armamos `reasons` (Líneas 880–917)?** Porque un cajero o auditor no confía en una "caja negra" que solo diga *"Fraude"* sin explicar por qué (**XAI: Explainable AI**). Evaluamos 5 señales explicables:
     1. `rawFeatures[3] === 1` (Firma/comprobante falso) $\to$ `+0.45`.
     2. `rawFeatures[4] >= 5` (Ráfaga $\ge 5$ ops) $\to$ `+0.30`.
     3. `rawFeatures[5] > 30` (Descuento $> 30\%$) $\to$ `+0.35`.
     4. `rawFeatures[6] >= 25` (Anulaciones usuario $\ge 25\%$) $\to$ `+0.20`.
     5. `rawFeatures[0] > 180000 && rawFeatures[1] <= 5` (Monto alto de madrugada) $\to$ `+0.25`.
   - **Fórmula híbrida final (Líneas 912–917):**
     `combinedScore = Math.min(0.999, Number((nnProbability * 0.65 + structuralBoost).toFixed(4)))`
     Si `combinedScore >= 0.5 || rawFeatures[3] === 1`, clasifica como **`'FRAUDULENTA'`**; si no, **`'NORMAL'`**. Asigna nivel de riesgo (`Crítico` $\ge 0.75$, `Alto` $\ge 0.50$, `Medio` $\ge 0.30$, `Bajo` $< 0.30`).

6. **`predictExpectedDemandAndAmount({ dayOfWeek, hour, canal, porcentajeDescuento, promedioHistoricoUnidades })` (Líneas 966–1013):**
   - Arma el vector normalizado de 5 entradas `[day/7, hour/23, chCode, desc/100, prom/100]`.
   - Ejecuta `this.demandModel.predict(inputTensor)` dentro de `tf.tidy()` obteniendo `[predUnitsNorm, predAmountNorm]`.
   - **Des-escala** multiplicando por los mismos factores inversos del entrenamiento: `predictedUnits = Math.max(1, Math.round(predUnitsNorm * 100))` y `predictedRevenue = Math.max(predictedUnits * 6500, Math.round(predAmountNorm * 1000000))`, más el ticket esperado `predictedRevenue / predictedUnits`.

7. **`getStatus()` (Líneas 1021–1030):**
   Retorna `{ isReady, backend: tf.getBackend(), modelsDir, fraudClassifier, demandRegressor, scaler }`.

---

## 4.3 Archivo 7: `src/application/ai/AiService.js` — El Director de Orquesta de IA (Línea por Línea)

- **Ubicación exacta:** [AiService.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/application/ai/AiService.js) (301 líneas).
- **Capa:** Aplicación / Casos de Uso (`src/application/ai/`).
- **¿Cuál es su papel arquitectónico?** Ni `userBehaviorStats.js` ni `tfModelManager.js` tocan PostgreSQL (son Dominio Puro). `AiService` es el puente: recibe los 4 repositorios (`userRepository`, `orderRepository`, `billingRepository`, `transactionRepository`) desde `container.js`, saca los datos reales de la base de datos y llama a ambos motores de IA.
- **¡Dato extra para brillar!** `aiService` no solo responde a las rutas `/ai/*`; también está inyectado dentro de `OperationalService` para **evaluar en caliente con la red neuronal cada factura (`POST /operational/invoices`) y cada pago (`POST /operational/payments`) en el instante en que se crean**.

### Desglose de su Constructor y sus 8 Métodos (1 privado + 7 públicos):

1. **`constructor(...)` (Líneas 51–68):**
   Guarda los 4 repositorios, `logger`, e inicializa `this.tfModelManager = tfModelManager || new TfModelManager({ logger })` (permitiendo pasar un gestor de prueba en tests unitarios).

2. **`async #collectSystemOperations()` (Método privado con `#`, Líneas 76–87):**
   ```js
   async #collectSystemOperations() {
     const [users, orders, invoices, payments, transactions] = await Promise.all([
       this.userRepository.listAll(),
       this.orderRepository.findAllUnpaginated(),
       this.billingRepository.listInvoices(),
       this.billingRepository.listPayments(),
       this.transactionRepository.findAll(),
     ]);
     return { users, orders, invoices, payments, transactions };
   }
   ```
   - En JavaScript moderno, el símbolo `#` al inicio del nombre hace que el método sea **estrictamente privado** (nadie desde afuera de `AiService` puede llamarlo). Trae las 5 tablas en paralelo con `Promise.all`.

3. **`async getModelsStatus()` (Líneas 96–102) $\leftarrow$ `GET /ai/status` y `GET /operational/summary`:**
   Trae `invoices`, `payments` y `transactions`, los une en `realOps = [...transactions, ...invoices, ...payments]` y llama a `this.tfModelManager.ensureReady(realOps)`.

4. **`async trainModels({ epochs = 35, augmentationFactor = 2 } = {})` (Líneas 114–125) $\leftarrow$ `POST /ai/train`:**
   Recolecta `realOps` y aplica un **acotamiento defensivo en un único lugar**:
   - `epochs: Math.min(100, Math.max(5, Number(epochs) || 35))` (nadie puede mandar `999999` épocas para colgar el servidor, ni `0` épocas).
   - `augmentationFactor: Math.min(5, Math.max(1, Number(augmentationFactor) || 2))` (entre 1 y 5 clones por muestra).
   Luego ejecuta `this.tfModelManager.trainAndSaveModels(...)`.

5. **`async classifyOperation(operationPayload = {})` (Líneas 135–138) $\leftarrow$ `POST /ai/classify` (+ creación de facturas y pagos):**
   Delega directo a `this.tfModelManager.classifyOperation(operationPayload)`.

6. **`async classifyRecentOperations(limit = 20)` (Líneas 147–220) $\leftarrow$ `GET /ai/classify-recent`:**
   - Trae `invoices`, `payments` y `transactions` y asegura que el modelo esté listo (`ensureReady`).
   - **Líneas 153–196 (`const combined = [...]`):** Traduce las 3 tablas distintas a un formato común con etiqueta `sourceType: 'Factura'`, `'Pago'` o `'Transacción'`, su referencia (`FAC-...`, comprobante o `TXN-...`), usuario, monto, canal y validez de firma.
   - **Línea 199 (`combined.slice(-limit).reverse()`):** Toma las últimas `limit` operaciones y las voltea para ver la más reciente arriba.
   - **Líneas 203–209:** Pasa cada una por la red neuronal (`classifyOperation(op)`).
   - **Líneas 212–219:** Cuenta cuántas dieron `isFraudulent` (`fraudulentCount`) y cuántas normales (`normalCount = results.length - fraudulentCount`).

7. **`async predictDemandAndAmount(payload = {})` (Líneas 232–272) $\leftarrow$ `POST /ai/predict-demand` — ¡El Método Híbrido!:**
   Une los **dos mundos de IA** en una sola respuesta:
   - **Líneas 237–250:** Si el usuario envió `payload.dailySeries` con al menos 2 números, usa esa serie; si no, construye una serie real a partir de los últimos 10 pedidos de PostgreSQL (o `[18, 21, 24, 23, 27, 31, 34]` si hay menos de 4 pedidos).
   - **Líneas 253–255:** Acota `horizonDays` entre `1` y `14` días y corre la **Regresión Lineal de `simple-statistics`** (`predictDemandWithSimpleStatistics(series, horizonDays)`).
   - **Líneas 258–265:** Toma el promedio histórico recién calculado por `simple-statistics` (`simpleStatsRegression.historicalStats.mean || 24`) y **se lo inyecta como quinta entrada a la Red Neuronal Regresora Keras** (`predictExpectedDemandAndAmount`). ¡Estadística y Deep Learning trabajando en equipo!

8. **`async getUserBehaviorAnomalies()` (Líneas 280–285) $\leftarrow$ `GET /ai/user-profiles`:**
   Llama `#collectSystemOperations()` y se lo pasa a `analyzeUserBehaviorProfiles(data)`.

9. **`async getOperationalPatterns()` (Líneas 293–298) $\leftarrow$ `GET /ai/patterns`:**
   Llama `#collectSystemOperations()` y se lo pasa a `discoverOperationalPatterns(data)`.

---

## 4.4 Archivo 8: `frontend/src/components/AiAnalyticsCenter.jsx` — El Centro Visual de IA en React (Línea por Línea)

- **Ubicación exacta:** [AiAnalyticsCenter.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/components/AiAnalyticsCenter.jsx) (823 líneas).
- **Dónde se monta:** En `frontend/src/App.jsx` cuando `activeView === 'ai_center'`.

### 1. Los 9 Estados (`useState`, Líneas 41–75)
- **7 estados de servidor y carga (líneas 41–53):**
  - `aiStatus`: arquitectura Keras, conteo antes/después de Data Augmentation, accuracy, loss y ruta `saved_models/...`.
  - `recentOps`: tabla de las últimas 12 operaciones reales evaluadas por la red neuronal.
  - `userProfiles`: cuartiles globales y tabla de riesgo por usuario (`simple-statistics`).
  - `patterns`: hora pico, hora con más anomalías, canales y métodos de pago.
  - `demandResult`: resultado doble (Regresión Lineal + Regresión Neuronal Keras).
  - `classifierResult`: tarjeta derecha del simulador con barra de probabilidad, razones XAI y el tensor normalizado `[8]`.
  - `training`: booleano que cambia el botón negro a `'Entrenando Redes Keras...'` mientras corre `POST /ai/train`.
- **2 estados de formularios interactivos (líneas 56–75):**
  - `opInput` (líneas 56–65): los **8 campos exactos** del simulador de fraude (`monto: 24500`, `hora: 14`, `metodoPago: 'Tarjeta'`, `firmaValida: true`, `frecuencia: 1`, `porcentajeDescuento: 5`, `tasaAnulacionUsuario: 0`, `canal: 'presencial'`).
  - `demandInput` (líneas 68–75): el formulario de demanda (`dailySeriesText: '18, 22, 25, 24, 29, 33, 37'`, `horizonDays: 7`, `dayOfWeek: 6`, `hour: 15`, `canal: 'app'`, `porcentajeDescuento: 10`).

### 2. Carga Inicial en Paralelo y los 3 Manejadores de Botones (Líneas 83–164)
- **`loadAllAiData` + `useEffect` (líneas 83–112):** Al abrir la pantalla lanza **5 peticiones HTTP simultáneas** con `Promise.all` (`GET /ai/status`, `GET /ai/classify-recent?limit=12`, `GET /ai/user-profiles`, `GET /ai/patterns` y `POST /ai/predict-demand`) para que los 4 paneles aparezcan llenos de inmediato.
- **`handleTrainModels` (líneas 119–129):** Al pulsar **"Reentrenar y Guardar Modelos en Disco (Data Augmentation)"**, envía `POST /ai/train` con `{ epochs: 40, augmentationFactor: 2 }`, actualiza `aiStatus` y vuelve a pedir `fetchRecentClassifiedOperations(12)` con las neuronas recién entrenadas.
- **`handleClassify(customPayload = null)` (líneas 136–141):** Sirve tanto para el botón negro *"Clasificar Operación con Red Neuronal Keras"* como para los **3 botones rápidos de demostración en vivo** (líneas 246–300):
  1. **Botón verde `"Caso Normal"`:** \$18.500 a las 11:00 a.m., tarjeta, firma válida, frecuencia 1, descuento 5% $\to$ sale **NORMAL (Verde)**.
  2. **Botón rojo `"Fraude: Firma Falsa / Ráfaga"`:** \$280.000 a las 3:00 a.m., transferencia, `firmaValida: false`, frecuencia 7 $\to$ sale **FRAUDULENTA — Riesgo Crítico (Rojo)**.
  3. **Botón ámbar `"Fraude: Descuento Abusado 55%"`:** \$145.000 con 55% de descuento y 40% de anulaciones del usuario $\to$ sale **FRAUDULENTA (Rojo)**.
- **`handlePredictDemand(e)` (líneas 148–164):** Hace `e.preventDefault()`, parte el texto `dailySeriesText` por comas (`.split(',')`), convierte cada trozo a número válido y dispara `POST /ai/predict-demand`.

### 3. Las 4 Grandes Secciones Visuales de la Pantalla (Líneas 169–820)
1. **Sección 1 (Líneas 169–533):** 5 tarjetas superiores de ficha técnica Keras + Simulador interactivo de 8 entradas con barra porcentual roja/verde y tensor normalizado `[8]` + Tabla automática de las últimas 12 operaciones reales del sistema.
2. **Sección 2 (Líneas 536–645):** 4 tarjetas resumen (`Mediana Global Q2`, `Rango Intercuartílico IQR` + `Valla Atípicos`, `Usuarios Analizados`, `Sospechosos / En Observación`) + Tabla completa de usuarios ordenada por `anomalyScore` con sus cuartiles `Q1 / Q2 / Q3`, `IQR`, `Z-Score`, etiqueta de color y lista de alertas rojas.
3. **Sección 3 (Líneas 649–750):** Formulario de predicción de demanda + Tarjeta gris de Regresión Lineal (`trend`, `R²`, `m`, `b`) junto a Tarjeta esmeralda de Regresión Neuronal Keras (`unidades`, `monto esperado`, `ticket esperado`) + cuadritos de pronóstico `Día +1` a `Día +7`.
4. **Sección 4 (Líneas 754–819):** Descubrimiento de patrones con `Horario Pico`, `Hora Más Anomalías`, `Canal Dominante`, tarjetas por canal y etiquetas por método de pago.

---

# PARTE 5: Simulacro de 12 Preguntas de Profesor para Juan Esteban Zapa (con Respuestas Palabra por Palabra)

> **Consejo para el día de la sustentación:** Léelas en voz alta un par de veces. Cada respuesta está redactada con seguridad, claridad y mencionando el archivo y la línea exacta para dejar al profesor sin dudas.

---

### Pregunta 1: *"Juan Esteban, ¿cómo miden exactamente el tiempo de los algoritmos en el benchmark y por qué no usaron un simple `Date.now()`?"*
**Respuesta palabra por palabra:**
> *"Profesor, lo medimos en la función `measureExecution(fn)` dentro de `src/domain/algorithms/operationalAlgorithms.js` (líneas 43 a 57). Usamos `process.hrtime.bigint()` antes y después de correr el algoritmo porque `Date.now()` solo tiene precisión de milisegundos enteros y puede alterarse si el sistema operativo ajusta el reloj por internet. En cambio, `process.hrtime.bigint()` es un reloj monotónico de alta resolución que mide nanosegundos exactos. Luego restamos `Number(end - start)` y lo dividimos entre `1_000_000` para convertir nanosegundos a milisegundos con 4 decimales de precisión, manteniendo un costo adicional constante $O(1)$."*

---

### Pregunta 2: *"Muéstreme la diferencia entre su búsqueda lineal y su búsqueda binaria. Si tengo 2.500 facturas, ¿cuántos pasos hace cada una y qué condición exige la binaria?"*
**Respuesta palabra por palabra:**
> *"Ambas están en `operationalAlgorithms.js`. `linearSearchRecord` (línea 68) recorre el arreglo posición por posición con un `for` desde `0` hasta el final; en el peor caso, con 2.500 facturas hace las **2.500 comparaciones** ($O(n)$). En cambio, `binarySearchRecord` (línea 114) usa dos punteros `left` y `right`, calcula el centro `mid = Math.floor((left + right) / 2)` y en cada paso descarta de golpe la mitad del arreglo moviendo `left = mid + 1` o `right = mid - 1`. Para 2.500 facturas solo hace **12 comparaciones** ($O(\log n)$, más de 200 veces menos). La precondición obligatoria es que el arreglo esté **previamente ordenado por ID de menor a mayor**, lo cual garantizamos en `BenchmarkService.js` (línea 112) creando la copia `sortedById` antes de buscar."*

---

### Pregunta 3: *"En `bubbleSortRecords` veo una variable `swapped` y un `n - 1 - i`. ¿Qué hacen exactamente esas dos cosas?"*
**Respuesta palabra por palabra:**
> *"En `operationalAlgorithms.js` (líneas 384 a 407), Bubble Sort compara parejas vecinas `arr[j]` y `arr[j + 1]` e intercambia las desordenadas usando una variable temporal `temp`. El límite del ciclo interno es `n - 1 - i` porque en cada pasada `i`, el elemento más extremo ya quedó fijo al final del arreglo y no hace falta volver a compararlo. Y la bandera `swapped` empieza en `false` en cada pasada y cambia a `true` si hubo algún intercambio; si termina una pasada entera y `swapped` sigue siendo `false` (`if (!swapped) break;`), significa que la lista ya quedó completamente ordenada y cortamos el algoritmo temprano sin desperdiciar las pasadas restantes."*

---

### Pregunta 4: *"¿Por qué su `mergeSortRecords` es $O(n \log n)$ garantizado y qué significa que en la línea 449 hayan puesto `<=` y `>=` en lugar de `<` y `>`?"*
**Respuesta palabra por palabra:**
> *"Es $O(n \log n)$ garantizado porque aplica Divide y Vencerás: la función interna `divide` parte recursivamente el arreglo por la mitad con `slice` ($\log_2 n$ niveles de profundidad) hasta llegar al caso base de tamaño 1, y luego `merge` fusiona dos mitades ya ordenadas usando dos punteros `i` y `j` en una sola pasada lineal $O(n)$. En la línea 449 escribimos `valLeft <= valRight` (y `>=` en descendente) para que, cuando dos pedidos empaten en fecha o monto, se elija primero el de la mitad izquierda `left[i]`. Eso hace que nuestro Merge Sort sea **estable**, conservando el orden original en los empates."*

---

### Pregunta 5: *"En `countOrdersByCustomerQuadratic` vs `countOrdersByCustomerLinear`, ¿cómo lograron bajar de $O(n^2)$ a $O(n)$?"*
**Respuesta palabra por palabra:**
> *"En la versión cuadrática (línea 229) no usamos estructuras hash: tenemos un doble ciclo anidado `i` y `j` que por cada pedido barre el resto del arreglo buscando pedidos del mismo cliente y marcándolos en `visitedIndices` para no duplicarlos, lo cual crece como $\approx \frac{n(n+1)}{2}$, o sea $O(n^2)$. En `countOrdersByCustomerLinear` (línea 291) eliminamos por completo el ciclo interno usando una tabla Hash `new Map()`: recorremos los pedidos una única vez ($O(n)$) y consultamos `customerMap.get(customer)` en tiempo constante promedio $O(1)$ para sumar `orderCount` y `totalSpent`."*

---

### Pregunta 6: *"Explíqueme qué hace la línea `const pseudoRandomOffset = (((i * 2654435761) >>> 0) % size) * 60000;` en `generateSyntheticDataset`."*
**Respuesta palabra por palabra:**
> *"Está en la línea 772 de `operationalAlgorithms.js`. Sirve para desordenar las fechas de los pedidos sintéticos de forma **determinista y reproducible** sin usar `Math.random()`. Si las fechas salieran en orden, Bubble Sort terminaría en una sola pasada por su bandera `swapped` y el benchmark sería injusto; y si usáramos `Math.random()`, cada corrida daría operaciones distintas. Multiplicar `i` por `2654435761` (constante multiplicativa áurea de Knuth), aplicar `>>> 0` para forzar un entero positivo de 32 bits sin signo y sacar módulo `size` desordena las marcas de tiempo exigiendo trabajo real a los algoritmos de ordenamiento, pero dando siempre resultados exactos y verificables."*

---

### Pregunta 7: *"En `BenchmarkService.js`, línea 90, ¿por qué usan `Promise.all` con cinco repositorios y cuándo se dispara ese método?"*
**Respuesta palabra por palabra:**
> *"`BenchmarkService.analyzeSystemData` se dispara cuando llega la petición `GET /operational/benchmarks` desde la vista `AlgorithmBenchmark.jsx` (al montar el componente o al cambiar los filtros). Usamos `Promise.all` en la línea 90 para lanzar concurrentemente al mismo tiempo las 5 lecturas a PostgreSQL (`orders`, `invoices`, `payments`, `transactions` e `items`) en vez de esperar una detrás de otra con cinco `await` separados, reduciendo al mínimo la latencia de base de datos antes de medir en memoria los algoritmos."*

---

### Pregunta 8: *"Pasemos a IA con `simple-statistics`. En `userBehaviorStats.js`, ¿cómo detectan si un usuario tiene montos atípicos y cómo se calcula su `anomalyScore`?"*
**Respuesta palabra por palabra:**
> *"En `userBehaviorStats.js` primero `computeQuartileSummary` ordena los montos y calcula con `simple-statistics` el cuartil 1 ($Q_1$, 25%), la mediana ($Q_2$, 50%), el cuartil 3 ($Q_3$, 75%), el rango intercuartílico $IQR = Q_3 - Q_1$ y la **Valla Superior de Tukey** $Q_3 + 1.5 \times IQR$, además del **Z-Score** (`ss.zScore`). Luego `analyzeUserBehaviorProfiles` agrupa en `userBuckets` las facturas, pedidos, pagos y transacciones de cada usuario y suma puntos en `anomalyScore` (de 0 a 100): **+35 pts** si aplicó descuentos mayores al 30% (o +18 si supera el IQR), **+30 pts** si tiene $\ge 2$ anulaciones o $\ge 25\%$ de cancelación, **+25 pts** por comprobante o hash inválido (tope 40), **+20 pts** si supera la valla de Tukey o tiene `Z-Score > 2.2`, y **+15 pts** si acumula $\ge 3$ operaciones de madrugada (00:00 a 05:59). Si llega a **50 o más** queda `SOSPECHOSO`, entre **25 y 49** `EN_OBSERVACION`, y menos de 25 `NORMAL`."*

---

### Pregunta 9: *"¿Cómo funciona la predicción de demanda y por qué dicen que es híbrida?"*
**Respuesta palabra por palabra:**
> *"Es híbrida porque en `AiService.predictDemandAndAmount` (`src/application/ai/AiService.js`, línea 232) combinamos nuestros dos motores No-LLM cuando se llama a `POST /ai/predict-demand`. Primero, `predictDemandWithSimpleStatistics` (`userBehaviorStats.js`, línea 499) ajusta una recta por mínimos cuadrados $\hat{y} = mx + b$ con `ss.linearRegression`, mide su confiabilidad con `ss.rSquared` ($R^2$) y proyecta los próximos 7 días. Segundo, le pasamos el promedio histórico recién calculado junto con el día de la semana, la hora, el canal y el descuento a nuestra **Red Neuronal Regresora Keras** (`predictExpectedDemandAndAmount` en `tfModelManager.js`), que tiene dos neuronas lineales de salida para estimar tanto las unidades esperadas como la facturación en pesos."*

---

### Pregunta 10: *"Explíqueme la arquitectura exacta de su Red Neuronal Clasificadora de Fraude en `tfModelManager.js`: cuántas entradas recibe, qué capas tiene y por qué termina en `sigmoid`."*
**Respuesta palabra por palabra:**
> *"Está en `buildKerasFraudClassifierModel` (`src/domain/ai/tfModelManager.js`, líneas 488 a 525). Es un modelo secuencial `tf.sequential()` que recibe un vector normalizado de **8 entradas** (`monto`, `hora`, `metodoPagoCod`, `firmaInvalidaFlag`, `frecuencia`, `porcentajeDescuento`, `tasaAnulacionUsuario` y `canalCod`). Pasa por una primera capa oculta `Dense` de **16 neuronas con activación `relu`**, luego una capa **`Dropout(0.1)`** que apaga al azar el 10% de neuronas durante el entrenamiento para evitar sobreajuste, luego una segunda capa oculta `Dense` de **8 neuronas `relu`**, y finalmente **1 neurona de salida con activación `sigmoid`**, porque la sigmoide comprime el resultado al rango $(0, 1)$, entregándonos directamente la probabilidad de fraude, entrenada con optimizador `adam(0.025)` y pérdida `binaryCrossentropy`."*

---

### Pregunta 11: *"La rúbrica exige guardar y cargar los modelos en disco y hacer Data Augmentation. ¿En qué funciones exactas de su código ocurre eso?"*
**Respuesta palabra por palabra:**
> *"Ambos están en `src/domain/ai/tfModelManager.js`. El **Data Augmentation** está en `augmentFraudDataset` (línea 327): por cada muestra base genera 2 clones deterministas aplicando micro-variaciones controladas ($\pm 4\%$ y $\pm 8\%$) en monto, hora, frecuencia y descuento sin alterar la etiqueta de fraude, triplicando el dataset antes de entrenar. Y la **persistencia en disco** está en `createFileSystemIOHandler(modelDir)` (línea 75): su método `save` escribe con `fs/promises` la arquitectura de capas en `model.json` y el `ArrayBuffer` binario de pesos entrenados en `weights.bin` dentro de `src/infrastructure/ai/saved_models/` (junto con `scaler.json` y `metadata.json`), mientras que su método `load` los vuelve a leer en `loadModelsFromDisk()` (línea 639) usando `tf.loadLayersModel` para que el servidor restaure las redes instantáneamente sin reentrenar en cada arranque."*

---

### Pregunta 12: *"Veo `tf.tidy()` en unas funciones de `tfModelManager.js` y `.dispose()` en otras. ¿Qué pasaría si borro esas líneas?"*
**Respuesta palabra por palabra:**
> *"Si las borramos causaríamos una **fuga de memoria RAM (memory leak)** en el servidor, porque los tensores creados por TensorFlow.js viven en un backend matemático separado que el recolector de basura automático de JavaScript no limpia. Usamos `tf.tidy(() => ...)` en las funciones síncronas como `computeNormalizationScaler` (línea 277) y `classifyOperation` (línea 873) para que TensorFlow destruya automáticamente todos los tensores intermedios al retornar. Y como `tf.tidy()` no puede envolver promesas con `await`, en `trainAndSaveModels` (líneas 722, 815 y 841) llamamos manualmente a `xs.dispose()`, `ys.dispose()` y `this.fraudModel.dispose()` justo después de terminar `await model.fit(...)`."*

---

> **Checklist Final de Victoria para Juan Esteban antes de pasar al frente:**
> 1. Abre en el navegador **"Algoritmos y Benchmark"** $\to$ cambia entre `Pedidos` y `Facturas` y señala cómo `Binaria O(log n)` y `Merge Sort O(n log n)` aplastan en número de operaciones (`ops`) a `Lineal O(n)` y `Bubble Sort O(n²)`, especialmente en la fila `n = 2,500`.
> 2. Abre **"Modelos de IA"** $\to$ haz clic en los 3 botones rápidos (**Caso Normal**, **Firma Falsa / Ráfaga** y **Descuento Abusado 55%**), señala el `Tensor Normalizado [8]` y las `Factores Determinantes`, baja a la tabla de **Cuartiles por Usuario (`Q1 / Q2 / Q3 / IQR / Z-Score`)** y muestra cómo un usuario con descuentos $>30\%$ o anulaciones sube a `SOSPECHOSO`. ¡Éxito total en la sustentación!


---

## Parte 6: Planificador de Rutas de Entrega — Grafos Ponderados y Algoritmo de Dijkstra

Además de los algoritmos operativos y de IA, el sistema incluye la sección **"Rutas"** en el menú lateral para planificar entregas a domicilio entre ciudades encontrando siempre el camino más corto y estimando el gasto de gasolina.

### 6.1 ¿Qué es un Grafo Ponderado y cómo funciona Dijkstra? (Explicado desde cero)

Imagina un mapa de carreteras:
- **Nodos (Vértices)**: Son las ciudades (`Medellín`, `Envigado`, `Sabaneta`, `Cali`).
- **Aristas (Conexiones)**: Son las carreteras que unen dos ciudades.
- **Peso (`weight`)**: Es la cantidad de kilómetros que mide cada carretera (por eso se llama *grafo ponderado*).

¿Por qué no basta con contar cuántas ciudades intermedias pasamos?
Porque ir directo de `Medellín -> Sabaneta` por una vía congestionada podría medir **25 km**, mientras que ir `Medellín -> Envigado (10 km) -> Sabaneta (5 km)` pasa por más nodos pero suma solo **15 km**. El **Algoritmo de Dijkstra** garantiza matemáticamente encontrar siempre la ruta cuya suma total de kilómetros sea la menor posible.

---

### 6.2 `src/domain/delivery/DeliveryGraph.js` (Explicado línea por línea)

1. **`constructor()`**:
   - Crea `this.adjacencyList = {}` (*Lista de Adyacencia*). Es un objeto donde cada propiedad es el nombre de una ciudad y su valor es una lista de carreteras que salen de ella:
     ```js
     {
       Medellin: [{ node: 'Envigado', weight: 10 }, { node: 'Sabaneta', weight: 25 }],
       Envigado: [{ node: 'Medellin', weight: 10 }, { node: 'Sabaneta', weight: 5 }],
       Sabaneta: [{ node: 'Envigado', weight: 5 }, { node: 'Medellin', weight: 25 }]
     }
     ```
2. **`addCity(city)` y `addEdge(from, to, weight)` ($O(1)$)**:
   - `addCity` crea el casillero vacío `[]` para la ciudad si aún no existía.
   - `addEdge` mete `{ node: to, weight }` dentro de la lista de vecinos de `from`.
3. **`dijkstra(start, end)` — Paso a paso**:
   - **`distances = {}`**: Anota la menor distancia conocida desde `start` hasta cada ciudad. Al principio ponemos `Infinity` (infinito) en todas las ciudades porque aún no sabemos cómo llegar, excepto en la ciudad de salida: `distances[start] = 0`.
   - **`previous = {}`**: Guarda una "miga de pan" indicando desde qué ciudad previa llegamos por el mejor camino (por ejemplo `previous['Sabaneta'] = 'Envigado'`). Empieza en `null`.
   - **`visited = new Set()`**: Conjunto rápido $O(1)$ de ciudades cuyo camino más corto definitivo ya quedó confirmado para no procesarlas dos veces.
   - **`queue = [{ node: start, distance: 0 }]`**: Lista de ciudades pendientes por explorar.
   - **Ciclo `while (queue.length > 0)`**:
     1. `queue.sort((a, b) => a.distance - b.distance)` y `queue.shift()`: Ordena los candidatos de menor a mayor distancia acumulada y saca el más cercano (`current`).
     2. Si `visited.has(current)` lo salta; si no, lo marca como visitado (`visited.add(current)`).
     3. `if (current === end) break;`: ¡Optimización clave! Si la ciudad más cercana que acabamos de sacar ya es nuestro destino `end`, no hace falta seguir buscando por caminos más largos; ya hallamos el óptimo.
     4. **Relajación de aristas (`for (const neighbor of this.adjacencyList[current])`)**:
        - Calcula `newDistance = distances[current] + neighbor.weight` (lo que llevamos hasta `current` más los km del tramo hacia el vecino).
        - `if (newDistance < distances[neighbor.node])`: Si este camino nuevo mejora el récord anterior que tenía ese vecino, actualiza `distances[neighbor.node] = newDistance`, anota `previous[neighbor.node] = current` y mete al vecino en `queue`.
   - **Reconstrucción de la ruta (`while (step)`)**:
     - Si `distances[end] === Infinity`, las ciudades no están conectadas y devuelve `{ path: [], distanceKm: null }`.
     - Si sí hay camino, empieza en `step = end` y retrocede siguiendo las migas de pan `step = previous[step]`, insertando al inicio con `path.unshift(step)` para armar el arreglo en orden `['Medellín', 'Envigado', 'Sabaneta']`.

---

### 6.3 `src/domain/delivery/estimateGasCost.js` ($O(1)$)
Función pura de 3 líneas llamada apenas termina Dijkstra:
- `const liters = distanceKm / kmPerLiter;` $\rightarrow$ Divide los kilómetros totales entre cuántos kilómetros rinde 1 litro de gasolina (ej. $15\text{ km} / 15\text{ km/L} = 1\text{ litro}$).
- `const cost = liters * pricePerLiter;` $\rightarrow$ Multiplica los litros gastados por el precio del litro en pesos.

---

### 6.4 Conexión Completa del Módulo de Rutas (SQL $\leftrightarrow$ Servicio $\leftrightarrow$ HTTP $\leftrightarrow$ React)

1. **`RouteRepository.js` (`src/infrastructure/database/repositories/RouteRepository.js`)**:
   - `create(origin, destination, distanceKm)`: Como una carretera sirve de ida y de regreso, hace `INSERT` del tramo `A -> B`, luego `INSERT` del tramo inverso `B -> A` apuntando `pair_route_id` al primero, y un `UPDATE` enlazando el primero con el segundo.
   - `findCities()`: Usa `SELECT DISTINCT origin AS city FROM routes UNION SELECT DISTINCT destination AS city FROM routes ORDER BY city ASC` para entregar la lista alfabética de ciudades sin repetidos.
2. **`RouteService.js` (`src/application/delivery/RouteService.js`)**:
   - `#buildGraphFromDB()`: Lee todas las filas de `routes`, instancia `new DeliveryGraph()` y carga cada fila con `graph.addEdge(...)`.
   - `calculateRoute({ from, to, kmPerLiter, pricePerLiter })`: Valida una sola vez `if (!from || !to)` (cero redundancia con HTTP), construye el grafo, corre `graph.dijkstra(from, to)` y si existe camino calcula `estimateGasCost`.
3. **`DeliveryController.js` + `delivery.routes.js` + `RoutePlanner.jsx`**:
   - Al abrir la vista **"Rutas"** en `App.jsx`, el `useEffect` de `RoutePlanner.jsx` llama en paralelo (`Promise.all`) a `GET /delivery/cities` y `GET /delivery/routes`.
   - El botón **"Calcular ruta"** dispara `GET /delivery/route?from=...&to=...` mostrando el camino `A → B → C`, kilómetros, litros y costo en pesos.
   - El botón **"+ Guardar ruta"** dispara `POST /delivery/routes` (validado en transporte por `requireJsonBody`) y el botón **"eliminar"** dispara `DELETE /delivery/routes/:id` (validado en transporte por `requirePositiveIntParam('id')`).

### Pregunta Extra de Profesor sobre Rutas
- **Profesor: *"En `DeliveryGraph.js`, ¿para qué sirve el objeto `previous` dentro de `dijkstra`?"***
  - **Respuesta palabra por palabra:** *"Porque el objeto `distances` solo guarda el número mínimo de kilómetros para llegar a cada ciudad, pero no guarda por cuáles ciudades intermedias pasamos. El objeto `previous` guarda para cada ciudad cuál fue la ciudad inmediatamente anterior en su camino más corto; así al final caminamos hacia atrás desde el destino `end` hasta el origen `start` con un ciclo `while (step)` usando `path.unshift(step)` para reconstruir la ruta exacta paso por paso."*
