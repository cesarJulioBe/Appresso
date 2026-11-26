# TOMO 0: Diccionario de Programación Desde Cero y Funcionamiento General de Appresso

> **¿Para quién es este documento?**
> Para **César Julio Berrio**, **Julián Cardona Atehortúa** y **Juan Esteban Zapa**.
> Está escrito asumiendo que **no tienen base previa de programación**. Si el profesor señala cualquier línea en cualquier archivo y pregunta *"¿Qué significa ese `async`?"*, *"¿Qué hace ese `.map()`?"*, *"¿Por qué dice `$1` en el SQL?"* o *"¿Qué es `req.body`?"*, aquí tienen la traducción exacta al español cotidiano.

---

## 1. Diccionario de Supervivencia: Qué Significa Cada Palabra en el Código

### 1.1 Variables y Tipos de Datos (Guardar información en memoria)
- **`const nombre = 'Café';`**: Crea una caja en memoria llamada `nombre` cuyo enlace **no va a reasignarse**. Usamos `const` el 95% de las veces por seguridad.
- **`let contador = 0;`**: Crea una variable cuyo valor **sí va a cambiar** más adelante (por ejemplo `contador++` le suma 1 en un ciclo).
- **`Object.freeze(objeto)`**: "Congela" un objeto para que **nadie pueda cambiar, borrar ni agregar propiedades** por accidente mientras corre el servidor (lo usamos en `env.js`, `orderStatus.js` y `getThresholdByTime.js`).
- **Arreglo (`Array`) `[10, 20, 30]`**: Una lista ordenada por posiciones empezando desde `0` (`lista[0]` es `10`).
- **Objeto (`Object`) `{ id: 1, precio: 5800 }`**: Una ficha con pares `clave: valor`. Se lee con punto (`item.precio`) o corchetes (`item['precio']`).

### 1.2 Operadores que Verán en Casi Todas las Líneas
- **`===` y `!==` (Igualdad y desigualdad estricta)**: Compara tanto el valor como el tipo de dato (`5 === 5` es `true`, pero `'5' === 5` es `false`). Nunca usamos `==` porque en JavaScript convierte tipos de forma impredecible.
- **`&&` ("Y" lógico) y `||` ("O" lógico)**:
  - `condicionA && condicionB`: Solo es verdadero si **ambas** se cumplen.
  - `valorA || valorPorDefecto`: Si `valorA` viene vacío/`0`/`undefined`, usa el valor de respaldo de la derecha.
- **`??` (Fusión nula / Nullish Coalescing)**: Ej. `payload.descuento ?? 0`. Significa: *"Si lo de la izquierda es `null` o `undefined`, usa `0`; pero si es `0` real, respétalo"*.
- **`?.` (Encadenamiento opcional / Optional Chaining)**: Ej. `this.logger?.info(...)` o `req.params?.id`. Significa: *"Si lo de la izquierda existe, accede a lo que sigue; si no existe, devuelve `undefined` en vez de estallar el programa con error"*.
- **Operador ternario `condicion ? siEsVerdadero : siEsFalso`**: Es un `if / else` resumido en una sola línea. Ejemplo: `score >= 50 ? 'SOSPECHOSO' : 'NORMAL'`.
- **Desestructuración `const { customer, products } = req.body;`**: En vez de escribir dos líneas (`const customer = req.body.customer; const products = req.body.products;`), saca esas propiedades directamente en variables con el mismo nombre.
- **Operador Spread `...` (`[...arreglo]` o `{ ...objeto }`)**: Crea una **copia nueva** de una lista o un objeto para no alterar (mutar) el original. Muy usado en React (`setProducts([...products, nuevo])`) y en algoritmos de ordenamiento (`const arr = [...records]`).

### 1.3 Funciones, Clases y Asincronía (`async / await`)
- **`function sumar(a, b) { return a + b; }` o función flecha `(a, b) => a + b`**: Un bloque reutilizable que recibe datos de entrada (*parámetros*), los procesa y devuelve un resultado con `return`.
- **`class OperationalService { constructor({ db }) { this.db = db; } }`**:
  - Una `class` es un molde que agrupa funciones relacionadas (*métodos*) y sus dependencias internas (`this.userRepository`, `this.secret`).
  - El `constructor` se ejecuta **una sola vez** al arrancar el servidor dentro de `src/container.js` para inyectarle las herramientas que necesita.
- **`async` y `await` (¡Pregunta fija del profesor!)**:
  - Ir a PostgreSQL por red o entrenar una red neuronal tarda varios milisegundos. Si Node.js se quedara congelado esperando, bloquearía a todos los demás usuarios.
  - Marcar una función con **`async`** significa que devuelve una **Promesa** (una tarea asíncrona).
  - Poner **`await`** delante de una llamada (`const user = await this.userRepository.findById(id);`) significa: *"Pausa únicamente esta función hasta que PostgreSQL responda con los datos, mientras Node.js sigue atendiendo otras peticiones en paralelo"*.
- **`await Promise.all([consulta1(), consulta2(), consulta3()])`**: Lanza varias consultas independientes **al mismo tiempo en paralelo** y espera a que todas terminen. Reduce el tiempo total a la consulta más lenta en vez de sumarlas una tras otra.
- **`try { ... } catch (err) { ... } finally { ... }`**:
  - Intenta ejecutar lo que está en `try`. Si algo lanza un error (`throw new ValidationError(...)`), salta a `catch` sin tumbar el servidor. Lo de `finally` se ejecuta siempre al final (por ejemplo `setLoading(false)` en React para reactivar un botón).
- **`require(...)` y `module.exports = ...`**:
  - En el Backend usamos CommonJS: `module.exports` expone lo que un archivo comparte hacia afuera, y `const x = require('./archivo')` lo importa en otro archivo. (En el Frontend con Vite/React se escribe `export` e `import`).

### 1.4 Métodos de Listas y Estructuras en Memoria (`Map` y `Set`)
- **`.map(elemento => nuevoElemento)`**: Recorre una lista de $n$ elementos y devuelve una **nueva lista del mismo tamaño** transformada (en React convierte una lista de datos en una lista de filas `<tr>` en pantalla).
- **`.filter(elemento => condicion)`**: Devuelve una nueva lista quedándose **solo** con los elementos que cumplan la condición.
- **`.reduce((acumulador, elemento) => acumulador + elemento.precio, 0)`**: Recorre toda una lista acumulando un resultado único (como sumar el subtotal de un pedido empezando desde `0`).
- **`.find(elemento => condicion)`**: Devuelve el primer elemento que cumpla la condición (o `undefined` si no lo halla).
- **`new Map()` (Tabla Hash clave $\rightarrow$ valor)**:
  - A diferencia de buscar en un arreglo con un ciclo `for` que tarda $O(n)$, un `Map` guarda y busca cualquier clave (`map.set(clave, valor)`, `map.get(clave)`, `map.has(clave)`) en **tiempo constante $O(1)$ instantáneo**. Es el secreto con el que bajamos algoritmos de $O(n^2)$ a $O(n)$!
- **`new Set()` (Conjunto de valores únicos sin repetidos)**:
  - Guarda valores únicos y permite preguntar `set.has('COMP-1001')` en **$O(1)$ instantáneo**. Lo usamos para detectar comprobantes de pago reutilizados y duplicados.

### 1.5 Qué Significan `req`, `res`, `next` en Express (Backend HTTP)
Cuando el navegador hace una petición HTTP al backend (`http://localhost:3000/operational/orders`), Express crea tres objetos:
- **`req` (*Request* / Petición entrante)**: Trae todo lo que envió el cliente:
  - `req.body`: El objeto JSON enviado en un `POST`, `PUT` o `PATCH` (gracias a `express.json()`).
  - `req.params`: Variables dentro de la ruta URL, por ejemplo en `/operational/users/:id`, si llaman `/operational/users/7`, entonces `req.params.id` vale `'7'`.
  - `req.query`: Filtros después del signo `?` en la URL, por ejemplo en `/operational/orders?page=2&pageSize=10`, `req.query.page` vale `'2'`.
  - `req.headers`: Cabeceras HTTP como `req.headers['x-request-id']`.
- **`res` (*Response* / Respuesta saliente)**: Lo usamos en el Controlador para contestarle al navegador:
  - `res.json(datos)`: Responde código `200 OK` convirtiendo `datos` a formato JSON.
  - `res.status(201).json(datos)`: Responde `201 Created` al crear un registro nuevo.
- **`next` (Siguiente paso del pipeline)**: Función que usan los *middlewares* (`httpValidator.js`, `requestContext.js`). Llamar `next()` sin argumentos significa *"todo bien, pasa al siguiente eslabón"*; llamar `next(error)` significa *"hubo un error, salta directo a `errorHandler.js`"*.

### 1.6 Qué Significan `$1, $2` y `RETURNING *` en PostgreSQL
En los repositorios verán consultas así:
```js
await this.db.query(
  'INSERT INTO categorias (nombre, nombre_normalizado) VALUES ($1, $2) RETURNING *',
  [nombre, nombreNormalizado]
);
```
- **`$1, $2` (Consultas Parametrizadas)**: En lugar de pegar texto con `+` dentro del SQL (lo cual permitiría un ataque de **Inyección SQL** si alguien escribe `' OR 1=1 --`), enviamos marcadores `$1, $2` y aparte el arreglo de valores. El motor PostgreSQL trata los valores estrictamente como datos y **jamás** como comandos ejecutables.
- **`RETURNING *`**: Le ordena a PostgreSQL que, en la misma operación de `INSERT` o `UPDATE`, nos devuelva inmediatamente la fila completa recién guardada (con su `id` autogenerado y su fecha `created_at`) sin tener que hacer un `SELECT` adicional.
- **`COALESCE($1, nombre)`**: En un `UPDATE`, significa *"Si me enviaste un valor nuevo en `$1` (no es `null`), pon ese nuevo valor; si `$1` vino vacío/`null`, conserva el valor `nombre` que ya tenía la columna"*.

### 1.7 Qué Significan `useState`, `useEffect` y `useCallback` en React (Frontend)
- **`const [items, setItems] = useState([]);`**: Crea una "memoria reactiva" en la pantalla. `items` tiene el valor actual (empieza en lista vacía `[]`) y `setItems(nuevosItems)` actualiza esa memoria **y le ordena a React volver a pintar la tabla en pantalla automáticamente**.
- **`useEffect(() => { loadAll(); }, [loadAll]);`**: Ejecuta código automáticamente cuando el componente aparece por primera vez en la pantalla (por ejemplo, pedirle los datos iniciales al backend sin que el usuario tenga que oprimir un botón de "Cargar").
- **`useCallback(async () => { ... }, [])`**: Memoriza una función para que React no la vuelva a crear desde cero en cada repintado de pantalla.

---

## 2. Mapa General de la Arquitectura Unificada (4 Capas Limpias)

Después de unificar el sistema y eliminar los 30 archivos viejos desconectados, **Appresso** tiene exactamente **4 capas estrictas** y **5 módulos funcionales 100% conectados**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ FRONTEND REACT (frontend/src/)                                          │
│ App.jsx (Menú Lateral) + api.js + 5 Vistas:                             │
│  1. OperationalERP.jsx          (Usuarios, Categorías, Ítems, Pedidos,  │
│                                  Facturas y Pagos)                      │
│  2. DataQualityAndIntegrity.jsx (Limpieza de Datos + Hash Encadenado)   │
│  3. AlgorithmBenchmark.jsx      (O(n), O(n²), O(n log n), O(log n))     │
│  4. AiAnalyticsCenter.jsx       (Keras/TensorFlow + Simple Statistics)  │
│  5. FraudDetection.jsx          (Transacciones HMAC + SlidingWindow)    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ Peticiones HTTP JSON (fetch)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CAPA 1 BACKEND: INTERFACES HTTP (src/interfaces/http/)                  │
│  - Middlewares: requestContext -> httpLogger -> notFound -> errorHandler│
│  - Validador Transporte (DRY): validators/httpValidator.js              │
│  - Rutas: operational.routes.js y fraud.routes.js                       │
│  - Controladores: OperationalController.js y FraudController.js         │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ Llama métodos de Servicios
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ CAPA 2 BACKEND: APLICACIÓN / CASOS DE USO (src/application/)            │
│  - OperationalService.js   (ERP completo + Integridad Hash Chain)       │
│  - DataQualityService.js   (Auditoría + Limpieza automática)            │
│  - BenchmarkService.js     (Comparación Big-O sobre BD y sintéticos)    │
│  - AiService.js            (Orquestación IA Keras + Simple Statistics)  │
│  - TransactionService.js, FraudReportService.js, ThresholdService.js    │
└──────────────────┬─────────────────────────────────┬────────────────────┘
                   │ Cálculos puros (sin BD/HTTP)    │ Persistencia SQL
                   ▼                                 ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│ CAPA 3: DOMINIO PURO (src/domain/)│ │ CAPA 4: INFRAESTRUCTURA           │
│  - quality/dataCleaner.js         │ │ (src/infrastructure/)             │
│  - integrity/hashChain.js         │ │  - database/connection.js (Pool)  │
│  - algorithms/operationalAlgs.js  │ │  - database/migrations.js         │
│  - ai/userBehaviorStats.js        │ │  - 7 Repositorios SQL (*Repo.js)  │
│  - ai/tfModelManager.js           │ │  - logging/logger.js + context.js │
│  - fraud/* + entities/ + errors/  │ │  - ai/saved_models/ (Disco)       │
└───────────────────────────────────┘ └───────────────────────────────────┘
```

---

## 3. Cómo Están Divididos los 3 Tomos de Estudio Detallado

Para que **nada esté resumido** y cada uno pueda estudiar su parte línea por línea y también leer las de sus compañeros:

1. **[TOMO 1 — César Julio Berrio (`01_GUIA_CESAR_JULIO_BERRIO_ARQUITECTURA_BD_Y_ERP.md`)](./01_GUIA_CESAR_JULIO_BERRIO_ARQUITECTURA_BD_Y_ERP.md)**:
   - Explica sin resumir: Configuración (`env.js`), Arranque (`server.js`, `app.js`), Inyección de Dependencias (`container.js`), Eliminación de validaciones redundantes (`httpValidator.js`, `asyncHandler.js`, `errorHandler.js`), Logs seguros (`requestContext.js`, `logger.js`), Base de Datos PostgreSQL (`connection.js`, `migrations.js`, `Order.js`, `orderStatus.js`, `errors/index.js`, `UserRepository.js`, `CatalogRepository.js`, `OrderRepository.js`, `BillingRepository.js`) y todo el flujo ERP (`OperationalService.js`, `OperationalController.js`, `operational.routes.js`, `App.jsx`, `api.js` y `OperationalERP.jsx`).
2. **[TOMO 2 — Julián Cardona Atehortúa (`02_GUIA_JULIAN_CARDONA_CALIDAD_FRAUDE_E_INTEGRIDAD.md`)](./02_GUIA_JULIAN_CARDONA_CALIDAD_FRAUDE_E_INTEGRIDAD.md)**:
   - Explica sin resumir: Limpieza y Normalización de Datos (`dataCleaner.js` función por función y línea por línea + `DataQualityService.js`), Cadena de Hashes tipo Blockchain para Facturas, Pagos y Comprobantes (`hashChain.js` + métodos de integridad en `OperationalService.js` + `DataQualityAndIntegrity.jsx`), y Motor Antifraude de Transacciones (`hashUtils.js`, `validateTransaction.js`, `validateTransactionHash.js`, `getThresholdByTime.js`, `SlidingWindow.js`, `detectAnomaly.js`, `TransactionRepository.js`, `AnomalyRepository.js`, `ThresholdRepository.js`, `TransactionService.js`, `FraudReportService.js`, `ThresholdService.js`, `FraudController.js`, `fraud.routes.js` y `FraudDetection.jsx`).
3. **[TOMO 3 — Juan Esteban Zapa (`03_GUIA_JUAN_ESTEBAN_ZAPA_ALGORITMOS_BENCHMARK_E_IA.md`)](./03_GUIA_JUAN_ESTEBAN_ZAPA_ALGORITMOS_BENCHMARK_E_IA.md)**:
   - Explica sin resumir: Qué es la notación Big-O desde cero, los algoritmos $O(n)$, $O(n^2)$, $O(n \log n)$ y $O(\log n)$ línea por línea (`operationalAlgorithms.js`, `BenchmarkService.js`, `runBenchmark.js`, `AlgorithmBenchmark.jsx`), Estadística Descriptiva e Inferencial con `simple-statistics` (`userBehaviorStats.js`: cuartiles $Q_1, Q_2, Q_3$, $IQR$, vallas de Tukey, Z-Score, regresión lineal y patrones) y Redes Neuronales con `@tensorflow/tfjs` + Keras (`tfModelManager.js`, `AiService.js`, `AiAnalyticsCenter.jsx`).
