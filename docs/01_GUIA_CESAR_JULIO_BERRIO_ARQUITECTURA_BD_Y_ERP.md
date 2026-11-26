# 📘 TOMO 1 — GUÍA MAESTRA DE SUSTENTACIÓN (SIN RESUMIR)
## Arquitectura Limpia, Arranque, Validación sin Redundancia, Base de Datos PostgreSQL y Módulos Operativos ERP
**Preparada especialmente para:** César Julio Berrio (y equipo Appresso)  
**Cobertura en la rúbrica:** Arquitectura, Configuración, Logs, Base de Datos PostgreSQL (**5%**) y Módulos Operativos ERP Backend + Frontend (**15%**)  

---

## 🧭 INTRODUCCIÓN RÁPIDA: ¿CÓMO ENTENDER APPRESSO SIN SER PROGRAMADOR EXPERTO?

Imagina que **Appresso** es una **cafetería real de alta gama** bien organizada. En una cafetería desordenada, el cajero recibe el billete, corre a moler el café, mete la mano a la bodega y apunta la cuenta en una servilleta. Si algo falla, nadie sabe quién se equivocó.

En cambio, **Appresso usa Arquitectura Limpia (Clean Architecture)** dividida en **4 capas**, igual que el personal especializado de una cafetería profesional:

1. **Capa 1 — Interfaces HTTP (`src/interfaces/http/` y `frontend/`):**  
   Son **la vitrina y el mesero en la puerta**. El cliente toca botones en la pantalla web (`React`), y en el servidor los **Rutas, Validadores HTTP y Controladores** reciben el pedido en la puerta, revisan que el papel no venga en blanco y se lo pasan al gerente. **Prohibido cocinar o tocar la caja fuerte aquí.**
2. **Capa 2 — Aplicación / Casos de Uso (`src/application/`):**  
   Son **los jefes de operaciones (`*Service.js`)**, como `OperationalService.js`. Ellos coordinan todo el trabajo del negocio: *"Revisa si hay café en bodega, descuenta 2 bolsas, calcula el IVA del 19%, pide firmar la factura y guárdala"*.
3. **Capa 3 — Dominio Puro (`src/domain/`):**  
   Es **el manual de recetas, calculadora financiera y sellos de seguridad**. Aquí viven las entidades (`Order.js`), constantes (`orderStatus.js`), errores (`ValidationError`), limpiadores de datos (`dataCleaner.js`) y firmas criptográficas (`hashChain.js`). **No saben que existe internet ni PostgreSQL**; son matemáticas y reglas puras en JavaScript.
4. **Capa 4 — Infraestructura (`src/infrastructure/`):**  
   Son **la bodega física (`PostgreSQL`) y las cámaras de seguridad (`Winston Logs`)**. Aquí viven `connection.js`, `migrations.js`, los **7 Repositorios SQL** (los únicos autorizados para hablar idioma SQL con la base de datos) y el sistema de bitácoras `logger.js`.

### 🔄 El viaje completo de un clic (en 6 segundos):
Cuando tú haces clic en **"Crear Pedido y Descontar Inventario"** en el navegador:
`OperationalERP.jsx` ➔ `frontend/src/api.js` (`fetch POST /operational/orders`) ➔ `src/app.js` (Middlewares) ➔ `operational.routes.js` (`requireJsonBody`) ➔ `OperationalController.js` (`createOperationalOrder`) ➔ `OperationalService.js` (verifica stock, calcula IVA 19%) ➔ `CatalogRepository.js` & `OrderRepository.js` (SQL parametrizado) ➔ `connection.js` (`pg.Pool`) ➔ **PostgreSQL**.

---

# 🏗️ BLOQUE 1: ARRANQUE, CONFIGURACIÓN E INYECCIÓN DE DEPENDENCIAS

En este primer bloque están los **4 archivos que encienden y conectan todo el backend**. El profesor suele abrir estos archivos primero para preguntar: *"¿Por dónde arranca su aplicación y cómo se conectan las capas?"*.

---

## 1.1 Archivo: `src/config/env.js`
- **Ubicación exacta:** [env.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/config/env.js)
- **Capa:** Configuración Transversal (Arranque del Sistema).
- **¿Qué hace este archivo en palabras sencillas?**  
  Es el **"lector oficial de credenciales"**. Lee el archivo oculto `.env` (donde están las contraseñas de PostgreSQL y la llave secreta `HMAC_SECRET`), comprueba en el milisegundo cero que no falte ningún dato obligatorio y guarda toda la configuración bajo llave con un candado (`Object.freeze`) para que ningún archivo pueda alterarla por accidente mientras el servidor está prendido.
- **¿Quién lo llama y cuándo se dispara?**  
  Se dispara **apenas arranca Node.js**, porque es requerido en las primeras líneas de `src/server.js`, `src/app.js`, `src/container.js`, `src/infrastructure/database/connection.js` y `src/infrastructure/logging/logger.js`.

### 🔍 Explicación línea por línea de `src/config/env.js`

1. **Importación de herramientas (Líneas 26–28):**
   ```js
   const path = require('path');
   const dotenv = require('dotenv');
   ```
   - `path`: Herramienta nativa de Node.js que une carpetas sin importar si estás en Mac (`/`), Linux (`/`) o Windows (`\`).
   - `dotenv`: Librería encargada de abrir el archivo `.env` y copiar sus valores dentro de `process.env` (la memoria de variables del sistema operativo en Node).

2. **Carga exacta del archivo `.env` (Línea 31):**
   ```js
   dotenv.config({ path: path.resolve(__dirname, '../../.env') });
   ```
   - `__dirname` significa *"la carpeta donde está parado este archivo ahora mismo"* (`.../Appresso/src/config`).
   - `'../../.env'` sube dos pisos (`src/config` ➔ `src` ➔ raíz `Appresso/`) y busca allí el archivo `.env`.
   - ¿Por qué usamos `path.resolve` en vez de dejar `dotenv.config()` vacío? Porque si alguien ejecuta el servidor desde otra carpeta en la terminal, `path.resolve` garantiza que **siempre** encuentre el `.env` sin perderse.

3. **Lista de variables obligatorias y filtro de faltantes (Líneas 34–36):**
   ```js
   const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'HMAC_SECRET'];
   const missing = required.filter((key) => !process.env[key]);
   ```
   - `required`: Arreglo con los 4 datos vitales sin los cuales Appresso no puede vivir: dónde está la base de datos (`DB_HOST`), con qué usuario entra (`DB_USER`), cómo se llama la base (`DB_NAME`) y cuál es la clave secreta para firmar facturas, pagos y transacciones (`HMAC_SECRET`).
   - `required.filter((key) => !process.env[key])`: Recorre esas 4 palabras una por una y pregunta: *"¿Esta variable está vacía o no existe en `process.env`?"*. Si falta alguna, la mete en la lista `missing`.

4. **Patrón *Fail-Fast* ("Fallar Rápido") (Líneas 39–41):**
   ```js
   if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
     throw new Error(`Variables de entorno obligatorias faltantes: ${missing.join(', ')}`);
   }
   ```
   - **¿Qué es Fail-Fast?** Imagina salir de viaje en carro sin gasolina: es mejor que una alarma suene en el garaje antes de arrancar y no quedarte varado a mitad de la autopista a las 3:00 a. m. Si `missing.length > 0` (falta al menos una variable) y **NO** estamos corriendo pruebas automáticas (`NODE_ENV !== 'test'`), lanza un `Error` inmediato diciendo exactamente cuáles faltan y detiene el arranque.

5. **Construcción del diccionario `config` clave por clave (Líneas 44–71):**
   ```js
   const config = {
     env: process.env.NODE_ENV || 'development',
     port: Number(process.env.PORT) || 3000,
     db: Object.freeze({
       host: process.env.DB_HOST,
       port: Number(process.env.DB_PORT) || 5432,
       user: process.env.DB_USER,
       password: process.env.DB_PASSWORD,
       database: process.env.DB_NAME,
       max: Number(process.env.DB_POOL_MAX) || 20,
     }),
     hmacSecret: process.env.HMAC_SECRET,
     timezone: process.env.APP_TIMEZONE || 'America/Bogota',
     log: Object.freeze({
       level: process.env.LOG_LEVEL || 'info',
       dir: process.env.LOG_DIR || path.resolve(__dirname, '../../logs'),
       retentionDays: process.env.LOG_RETENTION || '14d',
     }),
     corsOrigin: process.env.CORS_ORIGIN || '*',
   };
   ```
   Explicación de cada una de las **7 claves principales** de `config`:
   - `env`: Modo de trabajo (`'development'`, `'test'` o `'production'`). Si no viene definido, asume `'development'`.
   - `port`: Convierte `process.env.PORT` a número con `Number(...)` (porque todo en `.env` se lee como texto). Si no existe, usa el puerto `3000`.
   - `db` (congelado con `Object.freeze`): Datos de conexión para PostgreSQL:
     - `host`: Dirección del servidor de BD (ej. `localhost`).
     - `port`: Puerto de PostgreSQL (`5432` por defecto).
     - `user` y `password`: Credenciales de acceso.
     - `database`: Nombre de la base de datos de Appresso.
     - `max`: Máximo de conexiones abiertas al tiempo en el pool (`20` por defecto).
   - `hmacSecret`: Llave simétrica secreta para firmar hashes HMAC-SHA256.
   - `timezone`: Zona horaria oficial del negocio (`'America/Bogota'` por defecto), usada para evaluar franjas horarias de fraude (madrugada, mañana, tarde, noche).
   - `log` (congelado con `Object.freeze`): Configuración de los archivos de auditoría de Winston:
     - `level`: Nivel mínimo que se guarda (`'info'` por defecto).
     - `dir`: Carpeta donde se escriben los `.log` (`<raíz>/logs`).
     - `retentionDays`: Cuántos días se guardan antes de borrarse solos (`'14d'`, es decir, 14 días).
   - `corsOrigin`: Qué páginas web tienen permiso de llamar al backend (`'*'` en desarrollo local, o el dominio exacto en producción).

6. **Congelamiento final (Línea 74):**
   ```js
   module.exports = Object.freeze(config);
   ```
   - `Object.freeze(config)` le pone un candado en memoria a `config`. Si más adelante algún programador escribe por error `config.port = 9999` o `config.hmacSecret = '123'`, JavaScript **lo ignora o bloquea** porque el objeto es **inmutable**. Nota que también congelamos por dentro `config.db` y `config.log` porque `Object.freeze` en JavaScript es superficial (*shallow*), así que congelamos tanto el objeto padre como sus sub-objetos.

---

## 1.2 Archivo: `src/server.js`
- **Ubicación exacta:** [server.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/server.js)
- **Capa:** Punto de Entrada del Proceso Node.js (*Bootstrap & Ciclo de Vida*).
- **¿Qué hace este archivo en palabras sencillas?**  
  Es el **interruptor general de encendido y apagado** del edificio:
  1. Revisa que las tablas de PostgreSQL existan y tengan los datos iniciales de cafetería (`seedInitialOperationalData`).
  2. Abre las puertas al público en el puerto `3000` (`app.listen`).
  3. Vigila si alguien presiona `Ctrl + C` para apagar el servidor con orden, esperando a que terminen los clientes actuales y cerrando la base de datos sin romper nada (*Graceful Shutdown*).
- **¿Cuándo se dispara?**  
  Cuando ejecutas en la terminal `npm start` (`node src/server.js`) o `npm run dev` (`node --watch src/server.js`).
- **Pregunta típica del profesor: *"¿Por qué `server.js` está separado de `app.js`?"***  
  > **Respuesta ganadora:** Porque `app.js` construye las reglas y rutas de Express sin ocupar ningún puerto de red, mientras que `server.js` abre el puerto `3000`. Gracias a esa separación, las pruebas automáticas (`tests/`) pueden importar `app.js` y levantar servidores temporales en puertos aleatorios (`listen(0)`) sin chocar con el puerto `3000` ni disparar semillas globales dos veces.

### 🔍 Explicación bloque por bloque de `src/server.js`

1. **Importaciones iniciales (Líneas 26–34):**
   - Carga `config` (`./config/env`), crea un logger etiquetado como `[Server]` (`logger.child('Server')`), importa `db` (`./infrastructure/database/connection`), importa `{ seedInitialOperationalData }` de `./infrastructure/database/migrations` e importa `app` ya armada desde `./app`.

2. **Verificación de base de datos y datos semilla al arrancar (Líneas 37–43):**
   ```js
   seedInitialOperationalData(db, config.hmacSecret)
     .then(() => {
       logger.info('Esquema de base de datos y datos operativos iniciales verificados');
     })
     .catch((err) => {
       logger.error('Error al verificar migraciones iniciales', { error: err.message });
     });
   ```
   - Llama a `seedInitialOperationalData` pasándole la conexión `db` y la clave `config.hmacSecret`.
   - Si todas las tablas están listas (o las acaba de crear y poblar), escribe un log informativo verde. Si PostgreSQL estuviera apagado, atrapa el error en `.catch` y lo deja registrado en `logs/error-*.log` sin estrellar silenciosamente el servidor.

3. **Apertura del puerto HTTP (Líneas 46–51):**
   ```js
   const server = app.listen(config.port, () => {
     logger.info(`Servidor corriendo en http://localhost:${config.port}`, {
       port: config.port,
       env: config.env,
     });
   });
   ```
   - `app.listen(config.port, ...)` abre el socket TCP en el puerto `3000` y guarda la referencia en la constante `server` (la necesitamos guardada para poder cerrarla después al apagar).

4. **Apagado controlado — *Graceful Shutdown* (Líneas 58–75):**
   ```js
   async function shutdown(signal) {
     logger.info(`Señal ${signal} recibida. Iniciando apagado controlado...`);
     server.close(async () => {
       try {
         await db.close();
         logger.info('Servidor y conexiones de base de datos cerrados correctamente');
         process.exit(0);
       } catch (err) {
         logger.error('Error durante el cierre de recursos', { error: err.message });
         process.exit(1);
       }
     });
   }

   process.on('SIGINT', () => shutdown('SIGINT'));
   process.on('SIGTERM', () => shutdown('SIGTERM'));
   ```
   - **¿Qué son `SIGINT` y `SIGTERM`?**
     - `SIGINT` (*Signal Interrupt*): Se dispara cuando tú presionas `Ctrl + C` en la terminal.
     - `SIGTERM` (*Signal Terminate*): Se dispara cuando Docker, un servidor en la nube o el sistema operativo manda apagar el programa.
   - **¿Qué hace `shutdown` paso a paso?**
     1. `server.close(...)`: Cierra la puerta de entrada HTTP para no recibir clientes nuevos, **pero espera** a que cualquier venta o pago que vaya por la mitad termine de responderse.
     2. Cuando ya no queda ninguna petición HTTP a medias, ejecuta `await db.close()`, que cierra limpiamente las 20 conexiones del pool de PostgreSQL.
     3. Sale con `process.exit(0)` (`0` en sistemas operativos significa *"salida limpia y sin errores"*). Si algo falló cerrando la BD, sale con `process.exit(1)` (`1` significa *"salida con error"*).

5. **Redes de seguridad globales del proceso (Líneas 78–92):**
   - `process.on('unhandledRejection', ...)`: Si en algún rincón una promesa asíncrona (`async`) falló y a alguien se le olvidó ponerle `.catch`, este detector atrapa el motivo (`reason`) y la pila (`stack`) y lo escribe en `logger.error` para que nunca ocurran fallos invisibles.
   - `process.on('uncaughtException', ...)`: Si ocurre un error síncrono catastrófico fuera de Express, lo registra completo en el log de errores con `err.message` y `err.stack` y apaga el proceso de forma segura con `process.exit(1)`.

---

## 1.3 Archivo: `src/app.js`
- **Ubicación exacta:** [app.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/app.js)
- **Capa:** Interfaces HTTP — Ensamblaje del Pipeline Express.
- **¿Qué hace este archivo en palabras sencillas?**  
  Construye la **banda transportadora de 7 estaciones** por la que pasa **absolutamente toda petición HTTP** que llega al backend. En Express, **el orden de los `app.use(...)` lo es todo**: si pones el manejador de errores al principio o el lector de JSON después de las rutas, nada funcionará.
- **¿Quién lo llama?**  
  `src/server.js` importa la instancia por defecto (`defaultApp`), y las suites de pruebas llaman a `createApp(customContainer)`.

### 🔍 Los 7 pasos exactos de `createApp(container = buildContainer())` (Líneas 43–74)

Cuando llega una petición HTTP (por ejemplo, `POST http://localhost:3000/operational/orders`), atraviesa estas **7 estaciones en orden estricto**:

| Paso | Línea en `src/app.js` | Qué hace exactamente (como si fuera un aeropuerto) |
| :--- | :--- | :--- |
| **1** | `app.use(cors({ origin: config.corsOrigin }));` | **Control de fronteras (CORS):** Como el frontend React vive en `http://localhost:5173` y el backend Express vive en `http://localhost:3000`, los navegadores web bloquean esa comunicación por seguridad a menos que el backend ponga el sello `Access-Control-Allow-Origin`. Este paso autoriza a React a hablar con Express. |
| **2** | `app.use(express.json());` | **Traductor de paquetes JSON:** Los datos por internet viajan como un chorro de bytes de texto (`'{"canal":"app"}'`). Este middleware lee ese chorro y lo convierte en un objeto JavaScript listo para usar dentro de `req.body`. Si no estuviera aquí, `req.body` sería `undefined` en todos los controladores. |
| **3** | `app.use(requestContextMiddleware);` | **Manilla de identificación (`requestId`):** Le pega a cada petición un código único UUID (ej. `f47ac10b-...`) usando `AsyncLocalStorage` y lo devuelve en la cabecera `X-Request-Id`. Así todos los logs de esa venta comparten el mismo número de rastreo. |
| **4** | `app.use(httpLoggerMiddleware);` | **Cronómetro de entrada y salida:** Anota la hora exacta a la que entró la petición (`Date.now()`) y deja programado un aviso para que, cuando termine de salir la respuesta, guarde en el log cuánto tardó en milisegundos y qué código HTTP devolvió (`200`, `201`, `400`, `500`). |
| **5** | `app.use(createRoutes(container.controllers));` | **Directorio de oficinas (Rutas REST):** Revisa la URL solicitada (`/operational/orders`, `/operational/invoices`, `/fraud/transactions`, etc.), pasa primero por el validador de protocolo HTTP (`httpValidator.js`) y ejecuta el Controlador correspondiente. |
| **6** | `app.use(notFoundMiddleware);` | **Oficina de objetos perdidos (404):** Solo llegan aquí las peticiones cuya URL **no coincidió con ninguna ruta del Paso 5** (por ejemplo, `GET /ruta-inventada`). Crea un `NotFoundError` (404) y lo envía al Paso 7. |
| **7** | `app.use(errorHandlerMiddleware);` | **Juez único de errores:** Es el último eslabón. Si falló algo en el Paso 5 o en el Paso 6, aquí se traduce cualquier error (`ValidationError`, `NotFoundError`, `23505` de PostgreSQL o error inesperado) en una respuesta JSON limpia y segura. |

Al final del archivo (Líneas 65–74):
- `app.container = container`: Guarda una referencia al contenedor dentro de `app` para que los tests de integración puedan inspeccionarlo si lo necesitan.
- `const defaultApp = createApp()`: Crea la aplicación real usando `buildContainer()` por defecto.
- `defaultApp.createApp = createApp`: Adjunta también la función fábrica para poder crear apps aisladas en los tests.

---

## 1.4 Archivo: `src/container.js`
- **Ubicación exacta:** [container.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/container.js)
- **Capa:** Raíz de Composición (*Composition Root* — Inyección de Dependencias).
- **¿Cuándo se dispara?**  
  Cuando `src/app.js` ejecuta `createApp(container = buildContainer())` al iniciar el servidor (o al iniciar un test).

### 💡 ¿Qué es Inyección de Dependencias (DI) explicado con una analogía sencilla?
Imagina dos formas de fabricar una lámpara:
- **Sin Inyección de Dependencias (Mala práctica):** Sueldas el bombillo directamente a los cables internos de la lámpara. Si el bombillo se funde o quieres probar la lámpara con un bombillo de ahorro, te toca romper la lámpara entera. En código, eso pasa cuando `OperationalService.js` hace `const db = require('pg')` directamente adentro suyo: queda atado a PostgreSQL real para siempre.
- **Con Inyección de Dependencias (Lo que hace `src/container.js`):** Fabricas la lámpara con una **rosca estándar** y desde afuera le enroscas el bombillo que quieras. En Appresso, ningún Servicio (`*Service.js`) crea sus propios repositorios ni importa `pg`; todos reciben sus herramientas por su `constructor({ userRepository, catalogRepository, ... })`.  
  **`src/container.js` es el único taller de todo el proyecto donde se fabrican las piezas y se enchufan unas con otras.**  
  ¿Por qué le encanta esto al profesor? Porque cumple dos principios SOLID a la vez: **SRP (Responsabilidad Única)** y **DIP (Principio de Inversión de Dependencias)**, permitiendo correr pruebas unitarias ultrarrápidas en memoria sin siquiera tener PostgreSQL encendido.

### 🔍 Paso a paso de `buildContainer(...)` en `src/container.js`

#### Parámetros que recibe `buildContainer` (Líneas 56–63):
Recibe un objeto opcional con valores reales por defecto (que en pruebas se pueden reemplazar por simuladores):
- `db = defaultDb` (el pool de PostgreSQL de `connection.js`).
- `logger = defaultLogger` (el logger de Winston de `logger.js`).
- `secret = config.hmacSecret` (la llave secreta HMAC del `.env`).
- `timeZone = config.timezone` (`'America/Bogota'`).
- `clock = () => new Date()` (reloj inyectable para poder "congelar la hora" en pruebas de fraude).
- `repositories: customRepositories = {}` (permite inyectar repositorios falsos en tests).

#### Paso 1: Instancia los 7 Repositorios SQL (Líneas 65–75)
A todos les entrega `{ db }`:
1. `orderRepository`: `new OrderRepository({ db })` ➔ Maneja tabla `orders`.
2. `userRepository`: `new UserRepository({ db })` ➔ Maneja tabla `usuarios`.
3. `transactionRepository`: `new TransactionRepository({ db })` ➔ Maneja tabla `transacciones`.
4. `anomalyRepository`: `new AnomalyRepository({ db })` ➔ Maneja tabla `anomalias`.
5. `thresholdRepository`: `new ThresholdRepository({ db })` ➔ Maneja tabla `umbrales_horarios`.
6. `catalogRepository`: `new CatalogRepository({ db })` ➔ Maneja tablas `categorias` e `items`.
7. `billingRepository`: `new BillingRepository({ db })` ➔ Maneja tablas `facturas`, `pagos` y `reportes_calidad`.

#### Paso 2: Instancia `SlidingWindow` y el helper `childLogger` (Líneas 78–81)
- `const slidingWindow = new SlidingWindow()`: Crea en memoria RAM la estructura de ventana deslizante que vigila ráfagas de transacciones por correo electrónico en tiempo $O(1)$ amortizado.
- `const childLogger = (mod) => (typeof logger.child === 'function' ? logger.child(mod) : logger)`: Pequeña función ayudante que le crea a cada servicio su propio micrófono de logs marcado con su nombre (por ejemplo, `[OperationalService]`), de modo que al leer la consola sabes de inmediato qué servicio habló.

#### Paso 3: Instancia y conecta los 7 Servicios de Casos de Uso (Líneas 84–150)
Fíjate cómo unos servicios incluso se inyectan dentro de otros:
1. **`thresholdService`** (`new ThresholdService`): Recibe `{ thresholdRepository, logger: childLogger('ThresholdService') }`. Administra los límites de transacciones por franja horaria.
2. **`aiService`** (`new AiService`): Recibe `{ userRepository, orderRepository, billingRepository, transactionRepository, logger: childLogger('AiService') }`. Entrena y ejecuta las redes neuronales Keras/TensorFlow.js y modelos estadísticos Simple Statistics.
3. **`operationalService`** (`new OperationalService`): Recibe `{ userRepository, catalogRepository, orderRepository, billingRepository, aiService, secret, logger: childLogger('OperationalService') }`. ¡Nota que recibe `aiService` para evaluar riesgo con IA cada vez que emite una factura o procesa un pago, y `secret` para encadenar los hashes!
4. **`dataQualityService`** (`new DataQualityService`): Recibe `{ userRepository, catalogRepository, billingRepository, db, logger: childLogger('DataQualityService') }`. Audita y limpia datos sucios.
5. **`benchmarkService`** (`new BenchmarkService`): Recibe `{ orderRepository, billingRepository, transactionRepository, catalogRepository, logger: childLogger('BenchmarkService') }`. Corre las comparaciones experimentales Big-O.
6. **`transactionService`** (`new TransactionService`): Recibe `{ userRepository, transactionRepository, anomalyRepository, thresholdService, slidingWindow, secret, timeZone, clock, logger: childLogger('TransactionService') }`. Evalúa firmas HMAC y antifraude por ventana deslizante.
7. **`fraudReportService`** (`new FraudReportService`): Recibe `{ transactionRepository, anomalyRepository, logger: childLogger('FraudReportService') }`. Construye métricas y tableros de fraude.

#### Paso 4: Instancia los 2 Controladores HTTP unificados (Líneas 153–165)
1. **`fraudController`** (`new FraudController`): Recibe `{ transactionService, fraudReportService, thresholdService }`.
2. **`operationalController`** (`new OperationalController`): Recibe `{ operationalService, dataQualityService, benchmarkService, aiService }`.

Finalmente (Líneas 167–174), devuelve el paquete completo `{ db, logger, slidingWindow, repositories, services, controllers }`.

---

# 🛡️ BLOQUE 2: VALIDACIÓN SIN REDUNDANCIA, MIDDLEWARES Y LOGS SEGUROS

## 🏆 GUION DE ORO PARA EL PROFESOR: ¿Por qué en Appresso YA NO hay validaciones redundantes?

Si el profesor pregunta: *"¿Dónde validan los datos? ¿Están repitiendo los mismos `if` en el validador, en el controlador y en el servicio?"*, tú le respondes con total seguridad:

> *"Profesor, aplicamos estrictamente el principio **DRY (Don't Repeat Yourself)** y **Responsabilidad Única (SRP)** dividiendo las validaciones en dos niveles que jamás se pisan entre sí:*
> 1. ***Validación de Transporte HTTP (`src/interfaces/http/validators/httpValidator.js`):*** *Solo revisa la forma del protocolo HTTP antes de entrar al controlador: que `req.body` sea un objeto JSON plano (no nulo ni un arreglo), que `:id` en la URL sea un número entero positivo seguro, o que `:franja` no sea texto vacío. No sabe nada de café, precios ni inventario.*
> 2. ***Validación de Reglas de Negocio (`src/application/*Service.js` y `src/domain/`):*** *Todas las reglas del negocio —como que un pedido tenga al menos un ítem, que haya stock suficiente, que el estado sea uno de los 4 permitidos en `VALID_ORDER_STATUSES`, o que el subtotal de una factura sea mayor a cero— viven **UNA SOLA VEZ** adentro de los Servicios/Dominio. Así nunca repetimos el mismo `if` en dos archivos y además protegemos el negocio incluso si alguien llama al Servicio desde un test o un script sin pasar por HTTP."*

---

## 2.1 Archivo: `src/interfaces/http/validators/httpValidator.js`
- **Ubicación exacta:** [httpValidator.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/validators/httpValidator.js)
- **Capa:** Interfaces HTTP — Validadores de Transporte.
- **¿Cuándo se dispara?**  
  Express lo ejecuta en las rutas (`operational.routes.js` y `fraud.routes.js`) **justo antes** de entrar al método del Controlador. Si falla, llama a `next(new ValidationError(...))`, saltándose el controlador y yendo directo a `errorHandler.js` para responder `400 Bad Request`.

### 🔍 Sus 3 funciones explicadas línea por línea

#### 1. `requireJsonBody(req, _res, next)` (Líneas 39–48)
```js
function requireJsonBody(req, _res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(
      new ValidationError('El cuerpo de la petición debe ser un objeto JSON válido')
    );
  }
  return next();
}
```
- **¿Cuándo se dispara?** En rutas `POST`, `PUT` y `PATCH` que esperan datos en el cuerpo JSON (ej. `POST /operational/orders`, `POST /operational/users`).
- **¿Por qué hace esas 3 preguntas en el `if`?** En JavaScript ocurre una curiosidad famosa: `typeof null === 'object'` y `typeof [1, 2, 3] === 'object'`. Por eso verifica las tres cosas:
  1. `!req.body`: Rechaza `null` o `undefined` (cuerpo vacío).
  2. `typeof req.body !== 'object'`: Rechaza textos sueltos o números primitivos.
  3. `Array.isArray(req.body)`: Rechaza arreglos `[]`, exigiendo un objeto JSON `{ clave: valor }`.
- Si todo está bien, llama a `next()` sin argumentos, que significa: *"¡Adelante, pase al Controlador!"*.

#### 2. `requirePositiveIntParam(paramName = 'id')` (Líneas 57–75)
```js
function requirePositiveIntParam(paramName = 'id') {
  return function validateIntParam(req, _res, next) {
    const rawValue = req.params?.[paramName];
    const parsed = Number(rawValue);

    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return next(
        new ValidationError(
          `El parámetro de ruta '${paramName}' debe ser un entero positivo válido`
        )
      );
    }

    return next();
  };
}
```
- **¿Qué es una "fábrica de middlewares"?** Es una función que recibe el nombre del parámetro (por defecto `'id'`) y devuelve lista la función middleware `validateIntParam`. Así sirve tanto para `:id` como para `:orderId` sin copiar código.
- **¿Cuándo se dispara?** En rutas como `PUT /operational/users/:id`, `DELETE /operational/items/:id`, `PATCH /operational/orders/:id/status` o `POST /operational/invoices/:id/cancel`.
- **¿Qué hace `Number.isSafeInteger(parsed)`?** Si alguien manda en la URL `/operational/users/abc`, `/operational/users/3.14` o `/operational/users/-5`, `parsed` será `NaN`, decimal o negativo. `Number.isSafeInteger(parsed) && parsed > 0` garantiza que solo pasen enteros positivos exactos (`1, 2, 3...`) dentro del rango seguro de 64 bits de JavaScript, evitando errores SQL en PostgreSQL cuando busca `WHERE id = $1`.

#### 3. `requireTextParam(paramName)` (Líneas 83–98)
```js
function requireTextParam(paramName) {
  return function validateTextParam(req, _res, next) {
    const rawValue = req.params?.[paramName];

    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      return next(
        new ValidationError(`El parámetro de ruta '${paramName}' es obligatorio`)
      );
    }

    return next();
  };
}
```
- **¿Cuándo se dispara?** En rutas con parámetros de texto en la URL, como `PUT /fraud/thresholds/:franja`.
- **¿Qué hace `.trim().length === 0`?** Limpia espacios en blanco a los lados; si alguien envió puros espacios (`"   "`), queda de longitud `0` y lo rechaza con HTTP `400`.

---

## 2.2 Los 5 Middlewares HTTP en `src/interfaces/http/middlewares/`

### A) `asyncHandler.js`
- **Ubicación:** [asyncHandler.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/middlewares/asyncHandler.js)
- **Código clave (Líneas 18–24):**
  ```js
  function asyncHandler(fn) {
    return function wrappedHandler(req, res, next) {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
  ```
- **Explicación sencilla:** Es una **red atrapa-errores automática**. Si no existiera `asyncHandler`, tendríamos que escribir `try { ... } catch (err) { next(err); }` repetido adentro de los más de 30 métodos de los controladores. En cambio, envolvemos cada método en las rutas así: `asyncHandler(controller.createUser)`. Si `OperationalService` lanza un `throw new ValidationError(...)` o PostgreSQL falla, `.catch(next)` atrapa la promesa rechazada automáticamente y se la entrega a `errorHandler.js`.

### B) `requestContext.js` (Middleware HTTP)
- **Ubicación:** [requestContext.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/middlewares/requestContext.js)
- **¿Cuándo se dispara?** Paso 3 en `src/app.js`, en cada petición entrante.
- **Qué hace línea por línea (Líneas 22–40):**
  1. `const incomingId = req.headers['x-request-id']`: Mira si el cliente o un balanceador externo ya mandó un código de rastreo.
  2. Si vino uno válido lo usa (`incomingId.trim()`); si no, genera uno nuevo e irrepetible con el módulo criptográfico nativo de Node: `crypto.randomUUID()` (ej. `'9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'`).
  3. `res.locals.requestId = requestId`: Lo guarda en el bolsillo temporal de esta respuesta Express (`res.locals`) para que `errorHandler.js` pueda leerlo rápido si ocurre un fallo.
  4. `res.setHeader('X-Request-Id', requestId)`: Lo estampa en los encabezados de salida HTTP para que el navegador o Postman también vean con qué ID quedó registrada su operación.
  5. `runWithContext({ requestId }, () => { next(); })`: Mete toda la ejecución del resto de la petición dentro de la "burbuja" de `AsyncLocalStorage` para que todos los logs de Servicios y SQL lleven ese `requestId` automáticamente.

### C) `httpLogger.js`
- **Ubicación:** [httpLogger.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/middlewares/httpLogger.js)
- **¿Cuándo se dispara?** Paso 4 en `src/app.js`. Su listener interno se ejecuta cuando termina de enviarse la respuesta HTTP (`res.on('finish')`).
- **Qué hace línea por línea (Líneas 17–47):**
  1. `const startedAt = Date.now()`: Guarda el milisegundo exacto de entrada.
  2. `res.on('finish', () => { ... })`: Le dice a Express: *"Todavía no escribas el log; espérate a que el controlador responda y sepamos cuánto tardó y qué código HTTP salió"*.
  3. Calcula `const durationMs = Date.now() - startedAt` y lee `const status = res.statusCode`.
  4. Arma `meta` con `{ method, route: req.originalUrl, status, durationMs, result }`.
  5. Clasifica inteligentemente el color/severidad del log:
     - Si `status >= 500` ➔ `logger.error(...)` (fallo grave de servidor).
     - Si `status >= 400` ➔ `logger.warn(...)` (error del cliente: validación 400, no encontrado 404, duplicado 409).
     - Si es `200` o `201` ➔ `logger.info(...)` (petición exitosa).
  6. Llama a `next()` de inmediato para no frenar el tráfico.

### D) `notFound.js`
- **Ubicación:** [notFound.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/middlewares/notFound.js)
- **¿Cuándo se dispara?** Paso 6 en `src/app.js`, únicamente cuando ninguna ruta del Paso 5 coincidió con la URL pedida.
- **Código clave (Línea 21):**
  ```js
  next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
  ```
  Crea un error operacional `NotFoundError` (que tiene `statusCode = 404`) diciendo qué verbo y ruta intentaron abrir, y se lo pasa a `errorHandler.js`.

### E) `errorHandler.js` (¡Archivo favorito de preguntas de examen!)
- **Ubicación:** [errorHandler.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/middlewares/errorHandler.js)
- **¿Cuándo se dispara?** Paso 7 en `src/app.js`, cada vez que cualquier validador, controlador, servicio o repositorio lanza un error o llama a `next(err)`.
- **Dato técnico crucial:** En Express, un middleware normal tiene 3 parámetros `(req, res, next)`, pero un **middleware de errores DEBE tener exactamente 4 parámetros `(err, req, res, _next)`**. Por eso dejamos `_next` escrito aunque no se llame adentro: si lo borráramos, Express dejaría de reconocerlo como manejador de errores.

#### 🔍 Los 3 superpoderes de `errorHandler.js` (Líneas 26–96):
1. **Traducción centralizada del error `23505` de PostgreSQL a HTTP `409 Conflict` (Líneas 30–35):**
   ```js
   if (handledError && handledError.code === '23505') {
     handledError = new ConflictError('Ya existe una transacción con ese idTxn', {
       code: 'DUPLICATE_TRANSACTION',
       resultTag: 'duplicate_transaction',
     });
   }
   ```
   - En el estándar internacional de PostgreSQL, el código `'23505'` significa **`unique_violation`** (intentaron insertar un valor repetido en una columna `UNIQUE`, como un `idTxn` duplicado). En lugar de llenar los servicios de bloques `try/catch` preguntando por `'23505'`, `errorHandler.js` lo traduce en un único lugar a un `ConflictError` con código HTTP **409**.
2. **Caso A — Errores Operacionales conocidos (`handledError.isOperational === true`) (Líneas 46–80):**
   - Son errores previstos del negocio que heredan de `AppError` (`ValidationError` 400, `NotFoundError` 404, `ConflictError` 409, `ConfigurationError` 500).
   - Si `statusCode >= 500`, lo registra con `logger.error`; si es `400/404/409`, lo registra con `logger.warn` (porque que un usuario mande un dato vacío es una advertencia de cliente, no que el servidor esté roto).
   - Si el error trae un `code` simbólico (ej. `'VALIDATION_ERROR'` o `'INVALID_HASH'`), responde `{ error: code, message, requestId, details, ...payload }`. Si es un error operacional sencillo (como en los CRUD operativos), responde `{ error: handledError.message }` con su `statusCode` exacto (`400` o `404`).
3. **Caso B — Ocultamiento de *Stack Traces* en errores inesperados `500` (Líneas 82–95):**
   ```js
   logger.error('Error interno no controlado', {
     error: handledError ? handledError.message : 'Unknown error',
     stack: handledError ? handledError.stack : undefined,
     route: req.originalUrl,
     method: req.method,
   });

   return res.status(500).json({
     error: 'Error interno del servidor',
     requestId,
   });
   ```
   - **¿Por qué esto es una práctica de ciberseguridad clave?** Si se cae el disco duro o hay un bug inesperado (`TypeError`), el `stack` contiene rutas internas de carpetas, nombres de archivos y librerías del servidor, lo cual le daría pistas valiosas a un atacante (*Stack Trace Leak*). Por eso:
     - **Adentro del servidor (`logger.error`):** Guardamos el `stack` completo para que nosotros podamos arreglarlo.
     - **Afuera al usuario (`res.status(500)`):** Solo le respondemos `"Error interno del servidor"` más el `requestId` para soporte técnico, ocultando el `stack`.

---

## 2.3 Trazabilidad y Logs Seguros en `src/infrastructure/logging/`

### A) `src/infrastructure/logging/requestContext.js` (`AsyncLocalStorage`)
- **Ubicación:** [requestContext.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/logging/requestContext.js)
- **¿Qué problema resuelve `AsyncLocalStorage`?**  
  En Node.js pueden entrar **50 clientes al mismo tiempo** por un solo hilo de ejecución asíncrono. Si guardáramos `let currentRequestId` en una variable global normal, el cliente #2 sobrescribiría el ID del cliente #1 en mitad de una consulta SQL. Y si no usáramos `AsyncLocalStorage`, tendríamos que pasar `requestId` como parámetro en las 100 funciones del proyecto (`createOrder(payload, requestId)` ➔ `adjustStock(id, qty, requestId)` ➔ `db.query(sql, params, requestId)`), ensuciando todo el código.
- **Cómo funciona (Líneas 22–61):**
  - `const storage = new AsyncLocalStorage()` (del módulo nativo `async_hooks` de Node.js): Crea un casillero invisible aislado por cada cadena de `async/await`.
  - `runWithContext(context, fn)`: Abre el casillero con `{ requestId }` para esa petición HTTP.
  - `getContext()`: Devuelve el objeto del casillero actual, o `{}` si estamos fuera de una petición HTTP (por ejemplo, creando tablas durante el arranque en `server.js`).
  - `getRequestId()`: Devuelve directamente `store.requestId` o `undefined`.

### B) `src/infrastructure/logging/logger.js` (Winston + Privacidad PII + Rotación Diaria)
- **Ubicación:** [logger.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/logging/logger.js)
- **Capa:** Infraestructura — Observabilidad Transversal.

#### 🔍 Sus piezas clave explicadas una por una:
1. **`SENSITIVE_KEYS` (Línea 31):**
   ```js
   const SENSITIVE_KEYS = new Set(['password', 'secret', 'hmacSecret', 'hash']);
   ```
   Un conjunto `Set` de búsqueda instantánea $O(1)$ con los nombres de campos prohibidos en texto plano dentro de los logs. Si alguien intenta loguear un objeto con `password` o `hmacSecret`, el logger lo intercepta antes de escribirlo en disco.

2. **`maskEmail(email)` — Protección de datos personales PII (Líneas 43–52):**
   ```js
   function maskEmail(email) {
     if (typeof email !== 'string' || !email.includes('@')) return email;
     const [local, domain] = email.split('@');
     if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
     return `${local.slice(0, 2)}***@${domain}`;
   }
   ```
   - Convierte `'laura.gomez@appresso.co'` en `'la***@appresso.co'`.
   - Así cumplimos normas de privacidad de datos personales (Habeas Data / GDPR): en los archivos `.log` podemos auditar de qué dominio era el cliente y sus dos primeras letras, sin exponer su correo real completo.

3. **`sanitizeValue(key, value)` y `sanitizeObject(obj)` (Líneas 62–110):**
   - Si la clave está en `SENSITIVE_KEYS`:
     - Si es un texto largo (`> 8` letras, como un hash SHA-256), deja ver solo los primeros 6 caracteres seguidos de `...[REDACTED]` (ej. `'a9f4bc...[REDACTED]'`) para poder depurar sin filtrar el hash entero.
     - Si es corto (como una clave o contraseña), lo reemplaza por `'[REDACTED]'`.
   - Si la clave se llama `'user'` o `'email'` y tiene `'@'`, le aplica `maskEmail(value)`.
   - Si el valor es un arreglo o un objeto anidado (y no es `Error` ni `Date`), se llama a sí misma **recursivamente** creando un clon nuevo (`const clone = {}`) para **nunca mutar ni dañar** los datos reales que sigue usando la aplicación en memoria.

4. **Formatos automáticos de Winston (Líneas 113–178):**
   - `injectRequestContext`: Llama a `getContext()` de `AsyncLocalStorage` y pega `info.requestId` en cada línea de log automáticamente.
   - `redactSensitive`: Pasa todos los metadatos del log por `sanitizeValue` antes de imprimir o guardar.
   - `jsonFormat`: Usado en archivos `.log` y en producción (una línea JSON perfecta por evento con `timestamp` ISO-8601 y `stack`).
   - `devConsoleFormat`: Usado en nuestra terminal de desarrollo local con colores, hora corta `HH:mm:ss`, los primeros 8 caracteres del `requestId` (`[f47ac10b]`) y la etiqueta del módulo (`[OperationalService]`).

5. **Canales de salida (`transports`) y Rotación Diaria (Líneas 181–222):**
   - **Consola (`winston.transports.Console`):** Tiene `silent: config.env === 'test'` para que cuando corremos `npm test` la terminal quede limpiecita y no se llene de miles de líneas de log.
   - **Rotación diaria en disco (`winston.transports.DailyRotateFile`, activa cuando `env !== 'test'`):**
     1. **`logs/app-YYYY-MM-DD.log`:** Guarda todos los eventos desde nivel `info` en formato JSON.
     2. **`logs/error-YYYY-MM-DD.log`:** Guarda **únicamente** errores críticos (`level: 'error'`) para que un administrador encuentre incidentes al instante.
     - Ambos tienen `maxFiles: config.log.retentionDays` (`'14d'`), lo que significa que Winston borra automáticamente los archivos de hace más de 14 días para que el disco duro del servidor jamás se llene.

6. **`createModuleLogger` / `logger.child('NombreModulo')` (Líneas 235–256):**
   - Extiende `logger.child` para aceptar directamente un texto como `logger.child('Database')` o `logger.child('OperationalService')`, envolviéndolo en `{ module: moduleOrMeta }`. También exporta `logger.sanitizeObject` para poder probar la sanitización en los tests unitarios.

---

# 🗄️ BLOQUE 3: ENTIDADES, ERRORES, BASE DE DATOS POSTGRESQL Y REPOSITORIOS OPERATIVOS (DB 5%)

En este bloque estudiaremos las piezas del **Dominio Base** (`Order.js`, `orderStatus.js`, `errors/index.js`) y toda la **Capa de Persistencia en PostgreSQL** (`connection.js`, `migrations.js` y los 4 repositorios operativos junto con su `index.js`).

---

## 3.1 Entidades, Constantes y Errores del Dominio (`src/domain/`)

### A) `src/domain/entities/Order.js`
- **Ubicación exacta:** [Order.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/entities/Order.js)
- **Capa:** Dominio Puro (0 dependencias de Express, HTTP o PostgreSQL).
- **¿Qué hace este archivo?**  
  Modela en memoria un pedido de Appresso y sabe calcular por sí mismo cuántas unidades lleva en total y cuánto dinero cuesta su lista de productos.
- **¿Quién lo llama y cuándo se dispara?**
  - `OrderRepository.toOrder(row)` la instancia cada vez que lee un pedido desde PostgreSQL.
  - `OperationalService.generateInvoice()` usa `pedido.totalAmount()` como respaldo cuando calcula el subtotal de un pedido a facturar.
  - `BenchmarkService.analyzeSystemData()` recorre instancias `Order` al ejecutar los algoritmos $O(n)$, $O(n^2)$ y $O(n \log n)$.

#### 🔍 Sus 3 métodos explicados paso a paso:
1. **`constructor(id, customer, products, status = 'Requested')` (Líneas 30–41) — Complejidad $O(1)$:**
   - Guarda `this.id`, `this.customer`, `this.products` (arreglo de objetos `{ name, price, quantity }`), `this.status` (si no envían estado, arranca en `'Requested'`) y estampa `this.createdAt = new Date()`.
2. **`totalQuantity()` (Líneas 50–58) — Complejidad $O(n)$ en tiempo, $O(1)$ en memoria extra:**
   ```js
   totalQuantity() {
     let total = 0;
     for (const product of this.products) {
       total += product.quantity;
     }
     return total;
   }
   ```
   Recorre la lista de productos del pedido sumando las unidades físicas ($\sum q_i$). Por ejemplo, 2 cafés + 1 croissant = `3` unidades.
3. **`totalAmount()` (Líneas 69–79) — Complejidad $O(n)$ en tiempo, $O(1)$ en memoria extra:**
   ```js
   totalAmount() {
     let total = 0;
     for (const product of this.products) {
       total += product.price * product.quantity;
     }
     return total;
   }
   ```
   Multiplica el precio unitario por la cantidad de cada línea y lo acumula ($\sum p_i \times q_i$).

---

### B) `src/domain/constants/orderStatus.js`
- **Ubicación exacta:** [orderStatus.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/constants/orderStatus.js)
- **Capa:** Dominio Puro.
- **¿Por qué existe este archivo?**  
  Evita la mala práctica llamada ***Magic Strings*** (escribir `'In Progress'` regado en 10 archivos distintos, donde alguien puede equivocarse y escribir `'In progress'` con minúscula y dañar la base de datos).
- **Contenido exacto (Líneas 22–35):**
  ```js
  const ORDER_STATUS = Object.freeze({
    REQUESTED: 'Requested',     // Pedido recién creado (stock ya descontado)
    IN_PROGRESS: 'In Progress', // Barista o cocina preparándolo
    DELIVERED: 'Delivered',     // Entregado al cliente o factura pagada
    CANCELLED: 'Cancelled',     // Anulado (unidades devueltas al stock)
  });

  const VALID_ORDER_STATUSES = Object.freeze(Object.values(ORDER_STATUS));
  ```
- **¿Quién lo usa?** `OperationalService.updateOperationalOrderStatus(orderId, status)` cuando llega `PATCH /operational/orders/:id/status`, validando en $O(1)$ con `VALID_ORDER_STATUSES.includes(status)`.

---

### C) `src/domain/errors/index.js`
- **Ubicación exacta:** [index.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/domain/errors/index.js)
- **Capa:** Dominio Puro.
- **¿Qué problema resuelve?**  
  Si dentro de `OperationalService` hiciéramos `res.status(400).json(...)`, estaríamos violando la Arquitectura Limpia porque el Servicio quedaría amarrado a Express. En cambio, el Servicio lanza errores semánticos del negocio (`throw new ValidationError(...)` o `throw new NotFoundError(...)`), y `errorHandler.js` en la frontera HTTP los convierte en códigos HTTP.

#### 🔍 Sus 5 clases de error (Líneas 26–101):
1. **`AppError extends Error` (Clase madre — Líneas 26–61):**
   - Llama a `super(message)`.
   - Guarda `this.name = this.constructor.name` (para que diga `'ValidationError'` o `'NotFoundError'`).
   - Guarda `this.statusCode` (`500` por defecto), `this.code`, `this.details`, `this.payload`, `this.resultTag`.
   - **`this.isOperational = true`:** Esta bandera es vital. Le avisa a `errorHandler.js`: *"Tranquilo, este es un error controlado de negocio, sí puedes mostrarle `message` al usuario"*.
   - `Error.captureStackTrace(this, this.constructor)`: Función de V8 (el motor de Node.js) que limpia la traza de error para que apunte exactamente a la línea donde hicimos `throw`.
2. **`ValidationError extends AppError`:** Fija `statusCode: 400` (datos inválidos, stock insuficiente, firma HMAC inválida, subtotal $\le 0$).
3. **`NotFoundError extends AppError`:** Fija `statusCode: 404` (usuario, categoría, ítem, pedido, factura o ruta HTTP no encontrada).
4. **`ConflictError extends AppError`:** Fija `statusCode: 409` (colisión de unicidad, como un `idTxn` repetido o traducción de SQLSTATE `23505`).
5. **`ConfigurationError extends AppError`:** Fija `statusCode: 500` (falta un secreto crítico como `HMAC_SECRET`).

---

## 3.2 Conexión a PostgreSQL: `src/infrastructure/database/connection.js`
- **Ubicación exacta:** [connection.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/connection.js)
- **Capa:** Infraestructura — Persistencia PostgreSQL.
- **¿Quién lo llama?**
  1. `src/container.js` se lo inyecta como `{ db }` a los 7 repositorios SQL y a `DataQualityService`.
  2. `src/server.js` lo usa al arrancar (`seedInitialOperationalData`) y al apagar (`await db.close()`).

### 💡 ¿Qué es `new Pool(config.db)` explicado fácil?
Abrir una conexión nueva a PostgreSQL desde cero toma tiempo (saludo de red TCP + verificación de usuario y contraseña). Si abriéramos y cerráramos una conexión por cada clic, el servidor sería lentísimo y colapsaría con 50 clientes.  
Un **Pool de Conexiones (`new Pool(config.db)`)** es como tener **hasta 20 ventanillas de banco ya abiertas y listas** (`max: 20`). Cuando un repositorio necesita hacer un `SELECT` o `INSERT`, toma prestada una ventanilla libre en 0 milisegundos, ejecuta el SQL y la devuelve inmediatamente al grupo para que la use el siguiente cliente.

### 🔍 Explicación línea por línea de `connection.js`

1. **Instanciación del Pool y umbral de consultas lentas (Líneas 29–32):**
   ```js
   const pool = new Pool(config.db);
   const SLOW_QUERY_THRESHOLD_MS = 500;
   ```
   - Crea un único pool singleton con `host`, `port`, `user`, `password`, `database` y `max: 20`.
   - Define que cualquier consulta SQL que tarde **500 milisegundos (medio segundo) o más** será reportada como consulta lenta (*Slow Query*).

2. **Protector contra caídas de red en reposo (Líneas 36–44):**
   ```js
   pool.on('error', (err) => {
     logger.error('Error inesperado en cliente inactivo del pool de PostgreSQL', {
       error: err.message,
       stack: err.stack,
     });
   });
   ```
   - Si PostgreSQL se reinicia mientras hay conexiones descansando en el pool, Node.js cerraría la aplicación si nadie escucha el evento `'error'`. Este listener atrapa el golpe y lo escribe en `logger.error` sin tumbar el servidor.

3. **Función `query(text, params)` (Líneas 55–109):**
   ```js
   async function query(text, params) {
     const start = Date.now();
     try {
       const result = await pool.query(text, params);
       const durationMs = Date.now() - start;
       const summarySql = text.replace(/\s+/g, ' ').trim();

       if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
         logger.warn('Consulta SQL lenta detectada', {
           sql: summarySql,
           durationMs,
           rows: result.rowCount,
         });
       } else {
         logger.debug('Consulta SQL ejecutada', {
           sql: summarySql,
           durationMs,
           rows: result.rowCount,
         });
       }
       return result;
     } catch (err) {
       const durationMs = Date.now() - start;
       logger.error('Error al ejecutar consulta SQL', {
         sql: text.replace(/\s+/g, ' ').trim(),
         durationMs,
         code: err.code,
         error: err.message,
       });
       throw err;
     }
   }
   ```
   - **Blindaje contra SQL Injection (`text, params`):** Jamás pegamos variables de usuario con `+` ni `${}` dentro del texto SQL. Siempre enviamos marcadores `$1, $2, $3` en `text` y los datos separados en el arreglo `params`. PostgreSQL trata `params` estrictamente como datos y nunca como comandos ejecutables.
   - **Telemetría de rendimiento:** Cronometra `durationMs = Date.now() - start`. Si tarda `>= 500` ms lanza alerta amarilla `logger.warn('Consulta SQL lenta detectada', ...)`; si es rápida la deja en `logger.debug`.
   - **Seguridad en errores (`catch`):** Si falla el SQL, registra el código `err.code` (como `'23505'`) y la sentencia compactada, **sin guardar en el log los valores crudos de `params`** por privacidad, y relanza `throw err` para que suba a `errorHandler.js`.

4. **Función `close()` (Líneas 117–122):**
   ```js
   async function close() {
     logger.info('Cerrando pool de conexiones de PostgreSQL');
     await pool.end();
   }
   ```
   - Invocada por `shutdown()` en `src/server.js`: drena y cierra ordenadamente todos los clientes del pool con `await pool.end()`.

---

## 3.3 Esquema SQL y Semillas: `src/infrastructure/database/migrations.js`
- **Ubicación exacta:** [migrations.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/migrations.js)
- **Capa:** Infraestructura — Esquema DDL y Datos Semilla (*Seeding*).
- **¿Cuándo se dispara?** Al encender el servidor en `src/server.js` (`seedInitialOperationalData(db, config.hmacSecret)`).
- **Palabra clave para impresionar al profesor: *IDEMPOTENCIA*.**  
  Una migración **idempotente** es aquella que puedes ejecutar **1 vez o 1.000 veces seguidas** y el resultado es el mismo, sin dar error ni borrar los datos que ya estaban guardados. Lo logramos usando `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, conteos `SELECT COUNT(*) === 0` y `COALESCE`.

### 🔍 Parte A: `ensureSchema(db)` — Tabla por tabla y columna por columna (Líneas 57–164)

`ensureSchema` ejecuta **7 sentencias DDL** en orden:

#### 1. Extensión de la tabla `usuarios` (Líneas 59–65)
La tabla base `usuarios` (que ya tenía `id`, `nombre`, `email`, `estado`, `fecha_registro`, `fecha_actualizacion`) se amplía con 4 columnas operativas:
- `rol VARCHAR(30) DEFAULT 'cliente'` ➔ Distingue `'cliente'`, `'empleado'` o `'admin'`.
- `documento VARCHAR(40)` ➔ Cédula o NIT (ej. `'CC10203040'`).
- `telefono VARCHAR(30)` ➔ Celular normalizado (ej. `'+573001112233'`).
- `nombre_normalizado VARCHAR(150)` ➔ Clave sin tildes ni mayúsculas para detectar duplicados.

#### 2. Creación de la tabla `categorias` (Líneas 68–78)
- `id SERIAL PRIMARY KEY`: Entero autoincremental único.
- `nombre VARCHAR(120) NOT NULL`: Nombre comercial visible (ej. `'Café Caliente'`).
- `nombre_normalizado VARCHAR(120) NOT NULL`: Clave canónica (ej. `'cafe caliente'`).
- `descripcion TEXT`: Explicación de la categoría.
- `estado VARCHAR(30) DEFAULT 'Activa'`: Estado operativo.
- `created_at TIMESTAMP DEFAULT NOW()` y `updated_at TIMESTAMP DEFAULT NOW()`.

#### 3. Creación de la tabla `items` (Catálogo e Inventario — Líneas 81–94)
- `id SERIAL PRIMARY KEY`: Identificador único del producto.
- `sku VARCHAR(50) NOT NULL`: Código de inventario (ej. `'CAF-AME-001'`).
- `nombre VARCHAR(150) NOT NULL`: Nombre comercial.
- `nombre_normalizado VARCHAR(150) NOT NULL`: Clave canónica para evitar crear dos veces el mismo café.
- `categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL`: Llave foránea hacia `categorias`. Si alguien borra la categoría, el producto **no se borra**, solo queda con `categoria_id = NULL`.
- `precio NUMERIC(12, 2) NOT NULL DEFAULT 0`: **¡Ojo!** Usamos `NUMERIC(12, 2)` y no `FLOAT` porque en contabilidad los números flotantes binarios producen errores de centavos (`0.1 + 0.2 = 0.30000000000000004`), mientras que `NUMERIC` es exacto.
- `stock INTEGER NOT NULL DEFAULT 0`: Unidades físicas disponibles en bodega/barra.
- `estado VARCHAR(30) DEFAULT 'Activo'`, `created_at`, `updated_at`.

#### 4. Extensión de la tabla `orders` (Pedidos Multicanal — Líneas 97–107)
La tabla base `orders` (que tiene `id`, `customer`, `products` JSONB, `status`, `created_at`) se extiende con 8 columnas ERP:
- `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`: Cliente comprador.
- `empleado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`: Cajero/barista que atendió.
- `canal VARCHAR(30) DEFAULT 'presencial'`: Canal unificado (`'presencial'`, `'web'`, `'app'`, `'domicilio'`).
- `subtotal NUMERIC(12, 2) DEFAULT 0`: Suma bruta antes de descuentos e impuestos.
- `descuento NUMERIC(12, 2) DEFAULT 0`: Dinero descontado.
- `impuestos NUMERIC(12, 2) DEFAULT 0`: Valor del IVA (19%).
- `total NUMERIC(12, 2) DEFAULT 0`: Neto final a pagar.
- `updated_at TIMESTAMP DEFAULT NOW()`.

#### 5. Creación de la tabla `facturas` (Con Hash Encadenado — Líneas 110–130)
- `id SERIAL PRIMARY KEY`.
- `numero_consecutivo VARCHAR(30) UNIQUE NOT NULL`: Numeración fiscal única (ej. `'FAC-000001'`).
- `pedido_id INTEGER REFERENCES orders(id) ON DELETE SET NULL`.
- `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`.
- `empleado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`.
- `canal VARCHAR(30) DEFAULT 'presencial'`.
- `subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0`.
- `descuento NUMERIC(12, 2) NOT NULL DEFAULT 0`.
- `porcentaje_descuento NUMERIC(5, 2) NOT NULL DEFAULT 0`.
- `impuestos NUMERIC(12, 2) NOT NULL DEFAULT 0`.
- `porcentaje_impuesto NUMERIC(5, 2) NOT NULL DEFAULT 19`.
- `total NUMERIC(12, 2) NOT NULL DEFAULT 0`.
- `estado VARCHAR(30) DEFAULT 'Emitida'` (`'Emitida'`, `'Pagada'`, `'Anulada'`, `'Alterada'`).
- `prev_hash VARCHAR(64) NOT NULL`: Huella SHA-256 de 64 caracteres de la factura anterior (o el bloque génesis).
- `hash_actual VARCHAR(64) NOT NULL`: Huella HMAC-SHA256 de esta factura firmada con `HMAC_SECRET`.
- `created_at`, `updated_at`.

#### 6. Creación de la tabla `pagos` (Con Comprobante Verificable y Doble Hash — Líneas 133–150)
- `id SERIAL PRIMARY KEY`.
- `factura_id INTEGER REFERENCES facturas(id) ON DELETE CASCADE`: Si se elimina una factura en pruebas, sus pagos caen en cascada.
- `pedido_id INTEGER REFERENCES orders(id) ON DELETE SET NULL`.
- `usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`.
- `monto NUMERIC(12, 2) NOT NULL DEFAULT 0`.
- `metodo_pago VARCHAR(40) NOT NULL DEFAULT 'Efectivo'`.
- `referencia_comprobante VARCHAR(100) NOT NULL`: Número del voucher/transferencia (ej. `'COMP-2026-0101'`).
- `comprobante_metadata JSONB DEFAULT '{}'::jsonb`: Columna JSONB nativa de PostgreSQL que guarda entidad bancaria, nombre del PDF adjunto y monto reportado.
- `comprobante_hash VARCHAR(64) NOT NULL`: Firma HMAC individual del soporte de pago.
- `comprobante_valido BOOLEAN DEFAULT true`: `true` si pasó todas las validaciones antifraude; `false` si es sospechoso.
- `estado VARCHAR(30) DEFAULT 'Aprobado'` (`'Aprobado'` o `'Sospechoso'`).
- `prev_hash VARCHAR(64) NOT NULL` y `hash_actual VARCHAR(64) NOT NULL`: Eslabones tipo blockchain de la cadena de pagos.
- `fecha_pago TIMESTAMP DEFAULT NOW()`.

#### 7. Creación de la tabla `reportes_calidad` (Líneas 153–163)
- `id SERIAL PRIMARY KEY`, `puntaje_calidad NUMERIC(5, 2) NOT NULL`, `total_registros INTEGER`, `problemas_detectados INTEGER`, `registros_corregidos INTEGER`, `detalle JSONB DEFAULT '{}'::jsonb`, `created_at TIMESTAMP DEFAULT NOW()`. Guarda el historial de auditorías de limpieza de datos.

---

### 🔍 Parte B: `seedInitialOperationalData(db, secret)` — Paso a paso (Líneas 182–650)

1. **Asegura el esquema primero:** Llama a `await ensureSchema(db)` y resuelve `effectiveSecret`.
2. **Sembrado de 5 Categorías (Líneas 189–231):**  
   Pregunta `SELECT COUNT(*) FROM categorias`. Solo si da `0`, inserta las 5 categorías oficiales calculando `toCanonicalKey(c.nombre)`: *Café Caliente*, *Café Frío*, *Pastelería y Panadería*, *Desayunos y Brunch* y *Accesorios y Café en Grano*.
3. **Sembrado de 9 Productos con SKU y Stock (Líneas 234–333):**  
   Pregunta `SELECT COUNT(*) FROM items`. Solo si da `0`:
   - Arma un `new Map` (`catByNorm`) que relaciona `nombre_normalizado ➔ id` para buscar el ID de categoría en $O(1)$.
   - Inserta los 9 ítems iniciales: `CAF-AME-001` (Americano \$5.800, stock 120), `CAF-CAP-002` (Cappuccino \$7.900, stock 95), `CAF-LAT-003` (Latte \$8.500, stock 80), `FRI-CLD-004` (Cold Brew \$9.800, stock 60), `FRI-MAT-005` (Matcha \$10.500, stock 55), `PAS-CRO-006` (Croissant \$7.200, stock 45), `PAS-TOR-007` (Torta Zanahoria \$8.900, stock 40), `BRU-SAN-008` (Sándwich Ciabatta \$16.500, stock 35) y `GRA-ESP-009` (Café en Grano Huila 500g \$38.000, stock 25).
4. **Sembrado y saneamiento de 5 Usuarios con Roles (Líneas 336–417):**  
   Revisa por correo los 5 perfiles semilla: 2 clientes (*Laura Gómez*, *Carlos Mendoza*), 2 empleados (*Valentina Ríos Cajera*, *Andrés Silva Barista*) y 1 administrador (*César Berrio Admin*, `admin@appresso.co`).
   - Si no existen, hace `INSERT`.
   - Si ya existían, hace `UPDATE` con `COALESCE(columna, $n)` para rellenar únicamente los campos vacíos sin borrar cambios hechos por el usuario.
   - Luego ejecuta un `UPDATE` masivo con `split_part(email, '@', 1)` para que ningún usuario viejo quede con `rol` o `nombre` en `NULL`.
5. **Sembrado de 3 Pedidos + 3 Facturas (`FAC-000001`..`FAC-000003`) + 3 Pagos encadenados (Líneas 420–649):**  
   Pregunta `SELECT COUNT(*) FROM facturas`. Solo si da `0`:
   - Arranca con `let prevInvoiceHash = GENESIS_INVOICE_HASH` y `let prevPaymentHash = GENESIS_PAYMENT_HASH`.
   - En un ciclo `for` de 3 vueltas (`presencial` con Tarjeta, `app` con Transferencia, `domicilio` con Efectivo), calcula `subtotal`, `descuento`, `baseGravable`, `impuestos` (19%) y `total`, inserta el pedido en `orders` (`status = 'Delivered'`), firma `hashActualFactura` con `computeInvoiceChainHash`, inserta la factura en `facturas` (`estado = 'Pagada'`), actualiza `prevInvoiceHash = hashActualFactura` (así la factura 2 queda amarrada a la factura 1, y la 3 a la 2), calcula `comprobanteHash` y `hashActualPago`, inserta el pago en `pagos` y avanza `prevPaymentHash = hashActualPago`.

---

## 3.4 Los Repositorios SQL Operativos (`src/infrastructure/database/repositories/`)

### A) `repositories/index.js` (*Barrel File*)
- **Ubicación:** [index.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/repositories/index.js)
- **¿Qué hace?** Es un **archivo barril (*Barrel File*)**: agrupa y re-exporta los 7 repositorios SQL (`OrderRepository`, `UserRepository`, `TransactionRepository`, `AnomalyRepository`, `ThresholdRepository`, `CatalogRepository`, `BillingRepository`) para que `src/container.js` los importe todos en un solo `require` limpio en lugar de 7 líneas dispersas.

---

### B) `UserRepository.js` (Tabla `usuarios`)
- **Ubicación:** [UserRepository.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/repositories/UserRepository.js)
- **Quién lo llama:** `OperationalService`, `TransactionService`, `DataQualityService` y `AiService`.
- **Todos sus métodos uno por uno:**
  1. **`constructor({ db })`:** Guarda `this.db = db`.
  2. **`findByEmail(email)`:** Ejecuta `SELECT * FROM usuarios WHERE email = $1`. Devuelve `result.rows[0] || null`. Se usa para evitar correos duplicados al crear usuarios.
  3. **`findById(id)`:** Ejecuta `SELECT * FROM usuarios WHERE id = $1`. Devuelve `result.rows[0] || null`.
  4. **`findOrCreate(email, nombre = null)`:** Busca primero con `findByEmail(email)`; si ya existe lo devuelve sin tocar la BD. Si no existe, toma como nombre el parámetro o la parte antes del `@` (`email.split('@')[0]`) y ejecuta `INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *`. Muy usado cuando entra una transacción rápida de monitoreo antifraude.
  5. **`listAll()`:** Ejecuta `SELECT * FROM usuarios ORDER BY id ASC`. Devuelve todas las filas ordenadas.
  6. **`create({ nombre, nombreNormalizado, email, rol, documento, telefono, estado })`:** Inserta las 7 columnas con `$1..$7` y `RETURNING *` (que le pide a PostgreSQL devolver de inmediato la fila recién creada con su `id` asignado, ahorrando hacer otro `SELECT`).
  7. **`update(id, { nombre, nombreNormalizado, email, rol, documento, telefono, estado })`:**  
     Ejecuta `UPDATE usuarios SET nombre = COALESCE($1, nombre), ... fecha_actualizacion = NOW() WHERE id = $8 RETURNING *`.  
     **¿Qué hace `COALESCE($1, nombre)`?** Es una función SQL que devuelve el primer valor que NO sea `NULL`. Si envías `telefono = undefined/null` porque solo querías cambiar el `rol`, `COALESCE` conserva el teléfono viejo intacto en vez de borrarlo.
  8. **`delete(id)`:** Ejecuta `DELETE FROM usuarios WHERE id = $1 RETURNING *`. Si el ID no existía, devuelve `null`.

---

### C) `CatalogRepository.js` (Tablas `categorias` e `items`)
- **Ubicación:** [CatalogRepository.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/repositories/CatalogRepository.js)
- **Quién lo llama:** `OperationalService`, `DataQualityService` y `BenchmarkService`.
- **Todos sus métodos de Categorías (Líneas 42–154):**
  1. **`listCategories()`:**
     ```sql
     SELECT c.*,
       (SELECT COUNT(*)::int FROM items i WHERE i.categoria_id = c.id) AS total_items
     FROM categorias c
     ORDER BY c.id ASC
     ```
     **¿Por qué hacemos esa subconsulta adentro del SQL?** Para traer en **1 sola ida a la base de datos** cuántos productos tiene cada categoría (`total_items`), evitando el antipatrón *N+1 queries* (hacer 1 consulta para categorías y luego otras 20 consultas separadas para contar ítems).
  2. **`findCategoryById(id)`:** `SELECT * FROM categorias WHERE id = $1`.
  3. **`findCategoryByNormalizedName(nombreNormalizado)`:** `SELECT * FROM categorias WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1`. Permite saber si `'cafe caliente'` ya existe aunque el usuario haya escrito `'CAFÉ   CALIENTE'`.
  4. **`createCategory({ nombre, nombreNormalizado, descripcion, estado })`:** `INSERT INTO categorias ... RETURNING *`.
  5. **`updateCategory(id, { nombre, nombreNormalizado, descripcion, estado })`:** `UPDATE categorias` con `COALESCE` y `updated_at = NOW()`.
  6. **`deleteCategory(id)`:** `DELETE FROM categorias WHERE id = $1 RETURNING *`.

- **Todos sus métodos de Ítems e Inventario (Líneas 165–321):**
  7. **`listItems()`:**
     ```sql
     SELECT i.*, c.nombre AS categoria_nombre
     FROM items i
     LEFT JOIN categorias c ON i.categoria_id = c.id
     ORDER BY i.id ASC
     ```
     Usa `LEFT JOIN` (y no `INNER JOIN`) para que si un producto se quedó sin categoría (`categoria_id IS NULL`), **siga apareciendo** en el inventario en lugar de desaparecer de la tabla.
  8. **`findItemById(id)`:** Igual que el anterior con `LEFT JOIN`, filtrando `WHERE i.id = $1`.
  9. **`findItemByNormalizedName(nombreNormalizado)`:** `SELECT * FROM items WHERE nombre_normalizado = $1 ORDER BY id ASC LIMIT 1`.
  10. **`createItem({ sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado })`:** Inserta en `items` con `$1..$7` y `RETURNING *`.
  11. **`updateItem(id, { sku, nombre, nombreNormalizado, categoriaId, precio, stock, estado })`:** `UPDATE items` con `COALESCE` y `updated_at = NOW()`.
  12. **⭐ `adjustStock(itemId, deltaQuantity)` (¡Línea estrella de sustentación! — Líneas 294–306):**
      ```js
      async adjustStock(itemId, deltaQuantity) {
        const result = await this.db.query(
          `UPDATE items
           SET stock = GREATEST(0, stock + $1),
               updated_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [deltaQuantity, itemId]
        );
        return result.rows[0] || null;
      }
      ```
      - **¿Qué hace exactamente `GREATEST(0, stock + $1)` y por qué es tan importante?**
        1. **Atomicidad contra condiciones de carrera (*Race Conditions*):** Si dos cajeros venden al mismo milisegundo un café cuando quedaban 10 en stock, si hiciéramos la resta en JavaScript (`10 - 1 = 9`), ambos guardarían `9` y se perdería un descuento. Al hacer `stock + $1` directamente dentro del motor PostgreSQL (donde `$1` es negativo al vender, ej. `-2`, y positivo al anular pedido, ej. `+2`), PostgreSQL bloquea la fila microsegundos y aplica ambas restas en serie (`10 ➔ 8 ➔ 7`).
        2. **Piso de seguridad en cero:** `GREATEST(0, ...)` devuelve el número mayor entre `0` y el resultado de `stock + $1`. Garantiza matemáticamente que el inventario **jamás pueda caer a números negativos** (ej. `-3` bolsas de café).
  13. **`deleteItem(id)`:** `DELETE FROM items WHERE id = $1 RETURNING *`.

---

### D) `OrderRepository.js` (Tabla `orders`)
- **Ubicación:** [OrderRepository.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/repositories/OrderRepository.js)
- **Quién lo llama:** `OperationalService`, `BenchmarkService` y `AiService`.
- **Todos sus métodos uno por uno:**
  1. **`toOrder(row)` (*Data Mapper* — Líneas 44–69):**  
     En PostgreSQL las columnas se escriben en `snake_case` (`usuario_id`, `empleado_id`, `created_at`), mientras que en JavaScript usamos objetos de dominio en `camelCase` (`usuarioId`, `empleadoId`, `createdAt`). `toOrder(row)` toma la fila cruda de SQL, instancia `new Order(row.id, row.customer, row.products || [], row.status)` y le hidrata `createdAt`, `canal`, `usuarioId`, `empleadoId`, `subtotal`, `descuento`, `impuestos` y `total` (si un pedido viejo no tenía `subtotal` o `total` guardado en columna, lo calcula al vuelo con `order.totalAmount()`).
  2. **`create(customer, products)`:** Inserta un pedido básico convirtiendo el arreglo de productos con `JSON.stringify(products)` en estado `'Requested'` y lo pasa por `this.toOrder(...)`.
  3. **`createExtended({ customer, products, status, usuarioId, empleadoId, canal, subtotal, descuento, impuestos, total })` (Líneas 112–146):**  
     Es el método que usa el ERP Multicanal. Ejecuta `INSERT INTO orders` con los **10 parámetros** (`$1..$10`), serializando `JSON.stringify(products)`, y retorna `this.toOrder(result.rows[0])`.
  4. **`findById(id)`:** `SELECT * FROM orders WHERE id = $1`. Si `rows.length === 0` devuelve `null`; si existe devuelve `this.toOrder(result.rows[0])`.
  5. **`findAll(page = 1, pageSize = 20)` (Paginación SQL con `LIMIT` y `OFFSET` — Líneas 176–204):**
     ```js
     const offset = (page - 1) * pageSize;
     const result = await this.db.query(
       'SELECT * FROM orders ORDER BY id ASC LIMIT $1 OFFSET $2',
       [pageSize, offset]
     );
     const countResult = await this.db.query('SELECT COUNT(*) FROM orders');
     const total = parseInt(countResult.rows[0].count, 10);
     ```
     - **¿Cómo funciona la fórmula `(page - 1) * pageSize`?** Si pides la página `1` de tamaño `10`, `(1 - 1) * 10 = 0` (no se salta ninguno y trae los primeros 10). Si pides la página `2`, `(2 - 1) * 10 = 10` (se salta los primeros 10 con `OFFSET 10` y trae del 11 al 20 con `LIMIT 10`).
     - Calcula `totalPages: Math.ceil(total / pageSize)` (`Math.ceil` redondea hacia arriba: si hay 21 pedidos en páginas de 10, da `3` páginas).
  6. **`findAllUnpaginated()`:** `SELECT * FROM orders ORDER BY id ASC`. Trae todos los pedidos hidratados para resúmenes estadísticos, benchmarks Big-O y entrenamiento de IA.
  7. **`findByStatus(status)`:** `SELECT * FROM orders WHERE status = $1 ORDER BY id ASC` (orden FIFO: el primero que pidió es el primero en salir).
  8. **`updateStatus(id, status)`:** `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`. Devuelve la entidad `Order` actualizada o `null` si no existe.

---

### E) `BillingRepository.js` (Tablas `facturas`, `pagos` y `reportes_calidad`)
- **Ubicación:** [BillingRepository.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/infrastructure/database/repositories/BillingRepository.js)
- **Quién lo llama:** `OperationalService`, `DataQualityService`, `BenchmarkService` y `AiService`.
- **Todos sus métodos explicados uno por uno:**

  #### Bloque Facturas:
  1. **`listInvoices()` (Líneas 54–68):**
     ```sql
     SELECT f.*,
       u.nombre AS cliente_nombre,
       u.email AS cliente_email,
       e.nombre AS empleado_nombre
     FROM facturas f
     LEFT JOIN usuarios u ON f.usuario_id = u.id
     LEFT JOIN usuarios e ON f.empleado_id = e.id
     ORDER BY f.id ASC
     ```
     **Detalle brillante para el profesor:** Hace un **doble `LEFT JOIN` hacia la misma tabla `usuarios`** poniéndole dos apodos distintos (`u` para el cliente y `e` para el empleado cajero), y ordena estrictamente `ORDER BY f.id ASC` porque para verificar una cadena de hashes debes recorrer los eslabones en el orden exacto en que nacieron.
  2. **`findInvoiceById(id)`:** Mismo doble `LEFT JOIN` filtrando `WHERE f.id = $1`.
  3. **`getLastInvoiceHash()` (Líneas 104–111):**
     ```js
     const result = await this.db.query(
       'SELECT hash_actual FROM facturas ORDER BY id DESC LIMIT 1'
     );
     return result.rows[0]?.hash_actual || GENESIS_INVOICE_HASH;
     ```
     Busca el `hash_actual` de la última factura creada (`ORDER BY id DESC LIMIT 1`). Si la tabla está vacía y vamos a crear la factura #1 de la historia, devuelve `GENESIS_INVOICE_HASH` (el bloque génesis de 64 caracteres).
  4. **`getNextInvoiceConsecutive()` (Líneas 121–130):**
     ```js
     const result = await this.db.query(
       'SELECT COUNT(*)::int AS total, COALESCE(MAX(id), 0)::int AS max_id FROM facturas'
     );
     const nextNum = Math.max(result.rows[0].total, result.rows[0].max_id) + 1;
     return `FAC-${String(nextNum).padStart(6, '0')}`;
     ```
     Calcula el mayor entre la cantidad de filas y el `MAX(id)` más `1` (así aunque se hubiera borrado una fila en pruebas, jamás repite un número consecutivo), y usa `.padStart(6, '0')` para rellenar con ceros a la izquierda: `4` ➔ `'FAC-000004'`.
  5. **`createInvoice({ ...14 campos })`:** Inserta los 14 campos fiscales y criptográficos (`prev_hash`, `hash_actual`) en `facturas` con `RETURNING *`.
  6. **`updateInvoiceStatus(id, estado)`:** Cambia el estado (ej. a `'Pagada'` o `'Anulada'`) y actualiza `updated_at = NOW()`.
  7. **`updateInvoiceChainFields(id, { total, descuento, porcentajeDescuento, impuestos, prevHash, hashActual, estado })`:** Usado por el simulador de ataque y el restaurador de cadena (`restoreIntegrityChain`) con `COALESCE`.

  #### Bloque Pagos y Reportes de Calidad:
  8. **`listPayments()`:** Une `pagos p` con `facturas f` (para traer `factura_numero` y `factura_total`) y con `usuarios u` (`cliente_nombre`, `cliente_email`), ordenado por `p.id ASC`.
  9. **`findPaymentById(id)`:** `SELECT * FROM pagos WHERE id = $1`.
  10. **`getLastPaymentHash()`:** `SELECT hash_actual FROM pagos ORDER BY id DESC LIMIT 1`, o `GENESIS_PAYMENT_HASH` si aún no hay pagos.
  11. **`getAllReceiptReferences()` (Líneas 323–330):**
      ```js
      const result = await this.db.query('SELECT referencia_comprobante FROM pagos');
      return new Set(
        result.rows.map((r) => String(r.referencia_comprobante || '').trim()).filter(Boolean)
      );
      ```
      **¿Por qué devuelve un `new Set(...)` y no un arreglo `Array`?** Porque cuando validamos si un comprobante bancario ya fue usado antes, buscar en un `Array` con `.includes()` cuesta $O(n)$, mientras que buscar en un `Set` con `.has(ref)` cuesta **$O(1)$ instantáneo**, sin importar si hay 10 o 100.000 pagos.
  12. **`createPayment({ ...12 campos })`:** Inserta el pago serializando `JSON.stringify(comprobanteMetadata)` hacia la columna `JSONB` y guardando `comprobante_hash`, `prev_hash` y `hash_actual`.
  13. **`updatePaymentChainFields(id, { ... })`:** Actualiza campos y hashes de un pago con `COALESCE`.
  14. **`saveQualityReport({ puntajeCalidad, totalRegistros, problemasDetectados, registrosCorregidos, detalle })`:** Guarda en `reportes_calidad` una foto histórica de la auditoría de calidad con `JSON.stringify(detalle)`.
  15. **`listQualityReports(limit = 10)`:** Devuelve las últimas `10` auditorías ordenadas de la más nueva a la más antigua (`ORDER BY id DESC LIMIT $1`).

---

# 🏪 BLOQUE 4: MÓDULOS OPERATIVOS ERP — BACKEND Y FRONTEND (15%)

Este es el corazón operativo del proyecto (**15% de la nota**). Aquí verás cómo el backend (`OperationalService.js`, `OperationalController.js`, `operational.routes.js` e `index.js`) y el frontend React (`main.jsx`, `App.jsx`, `api.js` y `OperationalERP.jsx`) trabajan como un reloj suizo.

---

## 4.1 Servicio Central: `src/application/operational/OperationalService.js`
- **Ubicación exacta:** [OperationalService.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/application/operational/OperationalService.js)
- **Capa:** Aplicación — Casos de Uso (`src/application/operational/`).
- **Dependencias que recibe por `constructor` desde `src/container.js` (Líneas 91–111):**
  - `userRepository`, `catalogRepository`, `orderRepository`, `billingRepository`, `aiService`, `secret` (`HMAC_SECRET`) y `logger`.
  - Incluye también `setAiService(aiService)` (Líneas 118–120) por si en algún test se desea enlazar el servicio de IA después de crear la instancia.

### 🔍 Recorrido COMPLETO método por método (24 métodos en total — CERO saltos)

#### Grupo 1: Usuarios con Roles (`'cliente'`, `'empleado'`, `'admin'`)

1. **`listUsers()` (Líneas 131–133):**
   - **Quién lo dispara:** `GET /operational/users` (`OperationalController.listUsers`) y `GET /operational/summary`.
   - **Qué hace:** Delega en `this.userRepository.listAll()`.

2. **`createUser(payload = {})` (Líneas 143–178):**
   - **Quién lo dispara:** `POST /operational/users` (`OperationalController.createUser`).
   - **Paso a paso:**
     1. **Validación única de negocio:** Si no enviaron ni `payload.nombre` ni `payload.email`, lanza `new ValidationError('nombre o email son obligatorios para crear un usuario')`.
     2. **Limpieza canónica:** Llama a `cleanUserInput(payload)` (de `dataCleaner.js`), que quita espacios dobles, pone mayúsculas iniciales al nombre, pasa el correo a minúsculas y asegura que `rol` sea `'cliente'`, `'empleado'` o `'admin'`.
     3. **Deduplicación inteligente por email:** Si `!payload.allowDuplicateForTest`, busca `findByEmail(cleanData.email)`. Si ese correo **ya existía**, en lugar de fallar o crear un clon sucio, actualiza el usuario existente con `userRepository.update(existingByEmail.id, cleanData)` y devuelve `{ user: updated, deduplicated: true, wasCleaned, warnings: [...] }`.
     4. Si es nuevo, lo inserta con `userRepository.create(cleanData)` y devuelve `{ user: created, deduplicated: false, wasCleaned, warnings }`.

3. **`updateUser(id, payload = {})` (Líneas 188–200):**
   - **Quién lo dispara:** `PUT /operational/users/:id` (`OperationalController.updateUser`).
   - **Paso a paso:** Verifica `findById(id)`; si no existe lanza `new NotFoundError('Usuario no encontrado')` (404). Fusiona `{ ...existing, ...payload }`, limpia con `cleanUserInput(merged)` y guarda con `userRepository.update(id, cleanData)`.

4. **`deleteUser(id)` (Líneas 209–214):**
   - **Quién lo dispara:** `DELETE /operational/users/:id` (`OperationalController.deleteUser`).
   - **Paso a paso:** Llama a `userRepository.delete(id)`. Si devolvió `null` (no existía), lanza `new NotFoundError('Usuario no encontrado')`; si existía, retorna el registro borrado.

---

#### Grupo 2: Categorías del Catálogo (con Normalización y Unificación)

5. **`listCategories()` (Líneas 226–228):**
   - **Quién lo dispara:** `GET /operational/categories` y `GET /operational/summary`.
   - **Qué hace:** Retorna `this.catalogRepository.listCategories()` (incluyendo `total_items` por categoría).

6. **`createCategory(payload = {})` (Líneas 238–277):**
   - **Quién lo dispara:** `POST /operational/categories` (y también internamente `createItem` si le mandan un nombre de categoría nuevo).
   - **Paso a paso:**
     1. Si `!payload.nombre`, lanza `ValidationError('El nombre de la categoría es obligatorio')`.
     2. Llama a `unifyCategoryName(payload.nombre)`: si alguien escribe `"bebidas calientes cafe"`, el diccionario de sinónimos lo convierte automáticamente en `displayName: 'Café Caliente'` y `canonicalKey: 'cafe caliente'`.
     3. Busca `findCategoryByNormalizedName(unified.canonicalKey)`. Si ya existe, la reutiliza (`deduplicated: true`) sin crear basura duplicada.
     4. Si no existe, la crea en PostgreSQL con `catalogRepository.createCategory(...)`.

7. **`updateCategory(id, payload = {})` (Líneas 287–309):**
   - **Quién lo dispara:** `PUT /operational/categories/:id`.
   - **Paso a paso:** Verifica que exista con `findCategoryById(id)` (si no, `NotFoundError`). Si mandaron nuevo `nombre`, recalcula `unifyCategoryName(payload.nombre)` y actualiza con `catalogRepository.updateCategory(...)`.

8. **`deleteCategory(id)` (Líneas 318–323):**
   - **Quién lo dispara:** `DELETE /operational/categories/:id`.
   - **Paso a paso:** Borra con `catalogRepository.deleteCategory(id)`; si devuelve `null`, lanza `NotFoundError('Categoría no encontrada')`.

---

#### Grupo 3: Ítems / Productos e Inventario

9. **`listItems()` (Líneas 335–337):**
   - **Quién lo dispara:** `GET /operational/items` y `GET /operational/summary`.
   - **Qué hace:** Retorna `this.catalogRepository.listItems()`.

10. **`createItem(payload = {})` (Líneas 346–402):**
    - **Quién lo dispara:** `POST /operational/items`.
    - **Paso a paso:**
      1. Si no viene `payload.nombre` ni `payload.name`, lanza `ValidationError('El nombre del ítem es obligatorio')`.
      2. Llama a `cleanItemInput(payload)`: limpia formatos sucios de precio como `"$ 12.500,00"` ➔ `12500`, autogenera un `sku` limpio si venía vacío y normaliza el nombre.
      3. Si no enviaron `categoriaId` pero sí `categoriaNombre`, llama a `this.createCategory({ nombre: cleanData.categoriaNombre })` para enlazar su `id`.
      4. **Deduplicación con suma de stock:** Busca `findItemByNormalizedName(cleanData.nombreNormalizado)`. Si el producto **ya existe**, en vez de duplicarlo le suma las nuevas unidades al stock existente: `stock: Number(existing.stock || 0) + Number(cleanData.stock || 0)` y devuelve `deduplicated: true`.
      5. Si es nuevo, lo inserta con `catalogRepository.createItem(...)`.

11. **`updateItem(id, payload = {})` (Líneas 412–439):**
    - **Quién lo dispara:** `PUT /operational/items/:id`.
    - **Paso a paso:** Verifica `findItemById(id)` (`NotFoundError` si no existe), fusiona los cambios respetando los valores actuales con el operador `??`, limpia con `cleanItemInput(merged)` y guarda con `catalogRepository.updateItem(...)`.

12. **`deleteItem(id)` (Líneas 448–453):**
    - **Quién lo dispara:** `DELETE /operational/items/:id`.
    - **Paso a paso:** Ejecuta `catalogRepository.deleteItem(id)`; si no existía lanza `NotFoundError('Ítem no encontrado')`.

---

#### Grupo 4: Pedidos Multicanal con Stock en Tiempo Real e IVA 19%

13. **`listOperationalOrders(page = 1, pageSize = 20)` (Líneas 467–496):**
    - **Quién lo dispara:** `GET /operational/orders?page=1&pageSize=10`.
    - **Paso a paso:**
      1. Asegura rangos válidos: `parsedPage >= 1` y `parsedPageSize` entre `1` y `100`.
      2. Lanza en paralelo con `Promise.all` dos lecturas: `orderRepository.findAll(parsedPage, parsedPageSize)` y `orderRepository.findAllUnpaginated()`.
      3. Recorre `allOrders` en una sola pasada $O(n)$ acumulando cuántos pedidos y cuánto dinero hay en cada uno de los 4 estados (`Requested`, `In Progress`, `Delivered`, `Cancelled`) dentro de `statusSummary` para pintar las 4 tarjetas superiores del frontend.

14. **`updateOperationalOrderStatus(orderId, status)` (Líneas 507–526):**
    - **Quién lo dispara:** `PATCH /operational/orders/:id/status` (el selector desplegable de estado en la tabla de pedidos).
    - **Paso a paso:**
      1. Comprueba `if (!VALID_ORDER_STATUSES.includes(status))` ➔ si mandan un estado inventado, lanza `ValidationError`.
      2. **Detalle inteligente:** Si el estado elegido es `ORDER_STATUS.CANCELLED` (`'Cancelled'`), redirige automáticamente a `return this.cancelOrder(orderId)` para que no solo cambie el texto, sino que también **devuelva las unidades al inventario**.
      3. Verifica que el pedido exista (`findById(orderId)`) y actualiza con `orderRepository.updateStatus(orderId, status)`.

15. **⭐ `createOperationalOrder(payload = {})` (¡Flujo estrella del ERP! — Líneas 537–663):**
    - **Quién lo dispara:** `POST /operational/orders` (botón *"Crear Pedido y Descontar Inventario"*).
    - **Paso a paso exacto:**
      1. **Valida que haya productos:** Lee `rawItems = payload.items || payload.products || []`. Si el arreglo está vacío, lanza `ValidationError('El pedido debe incluir al menos un ítem')`.
      2. **Normaliza canal y cliente:** Convierte el canal con `normalizeChannel(...)` hacia `'presencial'`, `'web'`, `'app'` o `'domicilio'`. Si viene `usuarioId`, busca al usuario en `userRepository.findById(usuarioId)` para obtener su nombre real (`customerName`).
      3. **Ciclo `for (const entry of rawItems)` de verificación y descuento de stock (Líneas 563–613):**
         - Calcula `quantity = Math.max(1, parseInt(entry.quantity ?? entry.cantidad ?? 1, 10) || 1)`.
         - Busca el producto en el catálogo por `itemId` (`findItemById`) o por nombre normalizado (`findItemByNormalizedName`).
         - **Verifica existencias:** `if (Number(catalogItem.stock) < quantity)` ➔ lanza `ValidationError("Stock insuficiente para '...' (Disponible: X, Solicitado: Y)")`.
         - **Descuenta el stock atómicamente en PostgreSQL:** Llama a `await this.catalogRepository.adjustStock(catalogItem.id, -quantity)` (nota el signo menos `-quantity`).
         - Guarda el recibo del movimiento de kardex en `stockAdjustments` (`previousStock`, `deducted`, `remainingStock`).
         - **Seguridad antifraude de precios:** Guarda en `normalizedProducts` el precio oficial de la base de datos (`Number(catalogItem.precio)`), ignorando cualquier precio manipulado que pudiera enviar un atacante desde el navegador.
      4. **Liquidación financiera con IVA 19% (Líneas 616–629):**
         - `subtotal`: Suma `price * quantity` de todos los productos con `.reduce(...)`.
         - `porcentajeDescuento`: Lo acota entre `0` y `80`%.
         - `descuento = Number(((subtotal * porcentajeDescuento) / 100).toFixed(2))`.
         - `baseGravable = Math.max(0, subtotal - descuento)`.
         - `impuestos = Number((baseGravable * 0.19).toFixed(2))` (IVA colombiano del **19%** calculado sobre la base gravable neta).
         - `total = Number((baseGravable + impuestos).toFixed(2))`.
      5. **Persistencia del pedido:** Llama a `this.orderRepository.createExtended({ ... })`.
      6. **Facturación automática opcional (Líneas 646–656):** Si el cajero dejó marcado el checkbox `payload.autoGenerateInvoice === true`, llama enseguida a `await this.generateInvoice({ pedidoId: order.id, usuarioId, empleadoId, canal, porcentajeDescuento })` y devuelve `{ order, stockAdjustments, invoice }`.

16. **⭐ `cancelOrder(orderId)` (Reintegro automático de inventario — Líneas 672–702):**
    - **Quién lo dispara:** `POST /operational/orders/:id/cancel` (botón *"Anular (+Stock)"*).
    - **Paso a paso:**
      1. Busca el pedido con `orderRepository.findById(orderId)`; si no existe lanza `NotFoundError('Pedido no encontrado')`.
      2. **Ciclo de devolución de stock:** Recorre `for (const prod of order.products || [])`. Por cada producto que tenga `prod.itemId`, llama a `this.catalogRepository.adjustStock(prod.itemId, Number(prod.quantity || 1))` (con número **positivo**, sumando las unidades de vuelta a la bodega) y anota el resultado en `restoredStock`.
      3. Cambia el estado del pedido en PostgreSQL a `'Cancelled'` con `orderRepository.updateStatus(orderId, 'Cancelled')` y retorna `{ order: updatedOrder, restoredStock }`.

---

#### Grupo 5: Facturación Consecutiva con Alerta >30%, Hash Chain e IA Keras

17. **`listInvoices()` (Líneas 714–716):**
    - **Quién lo dispara:** `GET /operational/invoices` y `GET /operational/summary`.
    - **Qué hace:** Retorna `this.billingRepository.listInvoices()`.

18. **⭐ `generateInvoice(payload = {})` (Líneas 727–836):**
    - **Quién lo dispara:** `POST /operational/invoices` (formulario de facturación, botón rápido *"Facturar"* en un pedido, o automáticamente desde `createOperationalOrder`).
    - **Paso a paso:**
      1. Si viene `payload.pedidoId`, busca el pedido (`findById`); si no existe lanza `NotFoundError`.
      2. Determina `subtotal` (del `payload` o del `pedido`). Si `subtotal <= 0`, lanza `ValidationError('El subtotal de la factura debe ser mayor a 0')`.
      3. Liquida `porcentajeDescuento` (tope 90%), `descuento`, `effectiveDiscountPct`, `baseGravable`, `impuestos` (`19%` por defecto) y `total`.
      4. Pide a `BillingRepository` dos datos clave:
         - `numeroConsecutivo = await this.billingRepository.getNextInvoiceConsecutive()` (ej. `'FAC-000004'`).
         - `prevHash = await this.billingRepository.getLastInvoiceHash()` (el hash de `'FAC-000003'` o el génesis).
      5. **Firma el eslabón criptográfico:** Llama a `computeInvoiceChainHash({ numeroConsecutivo, pedidoId, usuarioId, canal, subtotal, descuento, impuestos, total, prevHash }, this.secret)` obteniendo `hashActual` (64 caracteres hexadecimales HMAC-SHA256).
      6. Guarda en BD con `billingRepository.createInvoice({ ..., estado: 'Emitida', prevHash, hashActual })`.
      7. **Regla de Control Interno (> 30% descuento):**
         ```js
         if (effectiveDiscountPct > 30) {
           warnings.push(
             `ALERTA DE FRAUDE / CONTROL: Descuento abusivo del ${effectiveDiscountPct}% aplicado en factura ${numeroConsecutivo}`
           );
         }
         ```
      8. **Clasificación en vivo con Red Neuronal Keras (`AiService`):** Si `this.aiService` está inyectado, llama a `await this.aiService.classifyOperation({ monto: total, fecha: invoice.created_at, metodoPago: 'Tarjeta', firmaValida: true, frecuencia: 1, porcentajeDescuento: effectiveDiscountPct, canal })` y devuelve `{ invoice, warnings, aiClassification }`.

19. **`cancelInvoice(invoiceId, reason = 'Solicitud de anulación')` (Líneas 847–864):**
    - **Quién lo dispara:** `POST /operational/invoices/:id/cancel` (botón *"Anular"* en tabla de facturas).
    - **Paso a paso:** Verifica `findInvoiceById(invoiceId)` (`NotFoundError` si no existe). Cambia su estado a `'Anulada'` (`updateInvoiceStatus`). Evalúa `const isSuspicious = Number(invoice.total) >= 50000 || invoice.estado === 'Pagada'`: si anulan una factura grande ($\ge \$50.000$) o una que **ya estaba pagada**, devuelve `suspiciousAlert` para encender un banner amarillo de auditoría en React.

---

#### Grupo 6: Pagos con Verificación de Comprobante, Hash Chain e IA Keras

20. **`listPayments()` (Líneas 876–878):**
    - **Quién lo dispara:** `GET /operational/payments` y `GET /operational/summary`.

21. **⭐ `processPayment(payload = {})` (Líneas 889–1003):**
    - **Quién lo dispara:** `POST /operational/payments` (formulario *"Procesar Pago y Adjuntar Comprobante"*).
    - **Paso a paso:**
      1. Valida que venga `payload.facturaId` (`ValidationError` si falta) y que la factura exista en BD (`findInvoiceById`, `NotFoundError` si no existe).
      2. Prepara `monto`, `metodoPago`, `referenciaComprobante` y el objeto `comprobanteMetadata` (`entidad`, `archivoNombre`, `montoComprobante`, `observaciones`).
      3. Trae el `Set` de todas las referencias usadas antes: `existingReceiptRefs = await this.billingRepository.getAllReceiptReferences()`.
      4. **Valida el comprobante en el Dominio:** Llama a `validatePaymentReceipt({ payment, invoice, existingReceiptRefs, secret: this.secret })`, que revisa que la referencia no sea repetida, que el monto coincida exactamente con `invoice.total`, que la factura no esté anulada y calcula `comprobanteHash`.
      5. Obtiene `prevHash = await this.billingRepository.getLastPaymentHash()` y firma el eslabón de la cadena de pagos con `computePaymentChainHash(...)`.
      6. Define `estadoPago = receiptCheck.isValid ? 'Aprobado' : 'Sospechoso'` y guarda el registro en `pagos` (`createPayment`) **incluso si es sospechoso**, para que quede evidencia forense del intento de fraude.
      7. **Transición automática de estados:** Únicamente si `receiptCheck.isValid === true`, marca la factura como `'Pagada'` (`updateInvoiceStatus`) y, si tenía `pedidoId`, marca el pedido como `'Delivered'` (`orderRepository.updateStatus`).
      8. Pasa el pago por la red neuronal `this.aiService.classifyOperation(...)` y devuelve `{ payment, receiptValidation: receiptCheck, aiClassification }`.

---

#### Grupo 7: Integridad Criptográfica (también ubicado al final de `OperationalService.js`)
*(Aunque profundizarás la matemática de hashes en la sección de Calidad e Integridad, dejamos documentados estos 3 métodos porque viven dentro de `OperationalService.js`):*
22. **`verifyIntegrity()` (Líneas 1017–1041):** Lee todas las facturas y pagos con `Promise.all`, ejecuta `verifyInvoiceChain` y `verifyPaymentChain` desde los hashes génesis y devuelve `isSystemIntegrityValid` (`true` solo si ambas cadenas tienen 0 eslabones rotos).
23. **`simulateTampering({ type = 'invoice_amount' })` (Líneas 1052–1077):** Simula un ataque interno a PostgreSQL sumándole `75000` al total de la primera factura (o metiendo `'COMP-FALSO-ALTERADO-999'` al último pago) sin recalcular el HMAC, y llama a `verifyIntegrity()` para demostrar que la alarma criptográfica salta de inmediato.
24. **`restoreIntegrityChain()` (Líneas 1086–1199):** Recorre todas las facturas desde `GENESIS_INVOICE_HASH` recalculando los montos legítimos desde `subtotal` y re-firmando cada `hashActual`, luego hace lo mismo con todos los pagos desde `GENESIS_PAYMENT_HASH`, y retorna `verifyIntegrity()` en verde.

---

## 4.2 Controlador y Rutas HTTP del ERP (`src/interfaces/http/`)

### A) `src/interfaces/http/controllers/OperationalController.js`
- **Ubicación:** [OperationalController.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/controllers/OperationalController.js)
- **Responsabilidad Única:** Traducir HTTP ➔ Servicio ➔ JSON. No tiene ni un solo cálculo de IVA, ni SQL, ni `if` repetidos de negocio.
- **Detalle técnico clave (*Arrow Methods*):** Todos sus métodos están escritos como `listUsers = async (_req, res) => { ... }`. Al usar funciones flecha como propiedades de clase, `this` queda amarrado para siempre a la instancia del controlador, lo que permite escribir en las rutas `asyncHandler(controller.listUsers)` limpio y directo.
- **Códigos HTTP que devuelve:**
  - `res.status(201).json(result)` (**201 Created**) cuando crea recursos nuevos: `createUser`, `createCategory`, `createItem`, `createOperationalOrder`, `createInvoice`, `processPayment`, `seedDirtyData`.
  - `res.json(...)` (**200 OK**) en lecturas, actualizaciones, cambios de estado y anulaciones.
- **Método especial `getExecutiveSummary` (Líneas 298–343):**  
  Dispara `GET /operational/summary`. Ejecuta un `Promise.all` de **9 consultas simultáneas** (`listUsers`, `listCategories`, `listItems`, `listInvoices`, `listPayments`, `getQualityReport`, `verifyIntegrity`, `getUserBehaviorAnomalies`, `getModelsStatus`), suma `totalRevenue` excluyendo facturas con `estado === 'Anulada'` y entrega una radiografía ejecutiva completa del negocio.

### B) `src/interfaces/http/routes/operational.routes.js` e `index.js`
- **Ubicaciones:** [operational.routes.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/routes/operational.routes.js) y [index.js](file:///Users/cesarjulioberrio/Documents/Appresso/src/interfaces/http/routes/index.js)
- **`routes/index.js`:** Es el enrutador raíz que monta en `src/app.js` los dos bloques de rutas activos del proyecto: `createFraudRoutes(controllers.fraudController)` y `createOperationalRoutes(controllers.operationalController)`.
- **Mapa exacto de Endpoints ERP en `operational.routes.js`:**
  - Crea primero `const validateId = requirePositiveIntParam('id')` (reutilizado en todas las rutas con `:id`).
  - **Resumen:** `GET /operational/summary`
  - **Usuarios:** `GET /operational/users`, `POST /operational/users` (`requireJsonBody`), `PUT /operational/users/:id` (`validateId`, `requireJsonBody`), `DELETE /operational/users/:id` (`validateId`).
  - **Categorías:** `GET /operational/categories`, `POST /operational/categories` (`requireJsonBody`), `PUT /operational/categories/:id` (`validateId`, `requireJsonBody`), `DELETE /operational/categories/:id` (`validateId`).
  - **Ítems/Stock:** `GET /operational/items`, `POST /operational/items` (`requireJsonBody`), `PUT /operational/items/:id` (`validateId`, `requireJsonBody`), `DELETE /operational/items/:id` (`validateId`).
  - **Pedidos Multicanal:** `GET /operational/orders`, `POST /operational/orders` (`requireJsonBody`), `PATCH /operational/orders/:id/status` (`validateId`, `requireJsonBody`), `POST /operational/orders/:id/cancel` (`validateId`).
  - **Facturas:** `GET /operational/invoices`, `POST /operational/invoices` (`requireJsonBody`), `POST /operational/invoices/:id/cancel` (`validateId`).
  - **Pagos:** `GET /operational/payments`, `POST /operational/payments` (`requireJsonBody`).
  - *(Además monta las rutas `/operational/quality/*`, `/operational/integrity/*`, `/operational/benchmarks` y `/ai/*`).*

---

## 4.3 Frontend React del ERP (`frontend/src/`)

Ahora veamos qué pasa en el navegador web cuando el profesor mira la pantalla.

### A) `frontend/src/main.jsx` (Punto de arranque del navegador)
- **Ubicación:** [main.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/main.jsx)
- **Qué hace línea por línea:**
  1. Importa `StrictMode` de `'react'`, `createRoot` de `'react-dom/client'`, los estilos `./index.css` (TailwindCSS) y el componente `App` desde `./App.jsx`.
  2. `createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)`: Busca en `frontend/index.html` la etiqueta `<div id="root"></div>` y dibuja toda nuestra aplicación React adentro. `<StrictMode>` es un vigilante solo de desarrollo que avisa si algún componente tiene malas prácticas.

### B) `frontend/src/App.jsx` (Menú Hamburguesa y Navegación de las 5 Vistas)
- **Ubicación:** [App.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/App.jsx)
- **Sus 2 estados `useState` (Líneas 27–30):**
  - `const [activeView, setActiveView] = useState('erp')`: Guarda qué pantalla estamos viendo. Arranca por defecto en `'erp'` (*Módulos Operativos*), por eso es lo primero que se ve al abrir la web.
  - `const [isMenuOpen, setIsMenuOpen] = useState(false)`: Controla si el cajón lateral izquierdo está abierto (`true`) o cerrado (`false`).
- **Arreglo `views` (Líneas 33–59):** Define las 5 secciones del proyecto (`'erp'`, `'quality_integrity'`, `'benchmarks'`, `'ai_center'`, `'fraud'`). Cuando haces clic en una opción del menú lateral, llama a `setActiveView(view.id)` y `setIsMenuOpen(false)`, cambiando de pantalla instantáneamente sin recargar el navegador (*Single Page Application — SPA*).

### C) `frontend/src/api.js` (Puente HTTP centralizado hacia Express)
- **Ubicación:** [api.js](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/api.js)
- **Línea 20:** `const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';`
- **Función maestra `apiRequest(path, options = {})` (Líneas 28–40):**
  ```js
  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Error en la petición al servidor');
    }
    return data;
  }
  ```
  - **¿Por qué existe `apiRequest`?** Para no repetir `fetch`, `headers: { 'Content-Type': 'application/json' }` ni el manejo de errores en 25 funciones distintas. Si Express devuelve HTTP `400` (por ejemplo, *"Stock insuficiente para Croissant"*), `response.ok` es `false` y `apiRequest` lanza un `new Error(data.message || data.error)`, que el componente atrapa en su `catch` para mostrar la alerta roja arriba en la pantalla.

---

### D) `frontend/src/components/OperationalERP.jsx` (Explicación completa de la vista ERP)
- **Ubicación:** [OperationalERP.jsx](file:///Users/cesarjulioberrio/Documents/Appresso/frontend/src/components/OperationalERP.jsx)

#### 1. Las 4 Sub-pestañas (`subTab` — Líneas 56 y 462–467)
Controladas por `const [subTab, setSubTab] = useState('pos')`:
1. `'pos'` ➔ **1. Pedidos Multicanal & Stock** (Formulario de pedidos, tabla de stock en vivo e historial paginado con cambios de estado y anulación).
2. `'billing'` ➔ **2. Facturación & Pagos (Hash Chain)** (Formulario de emisión de facturas, formulario de registro de pagos con comprobante, y tablas de facturas y pagos).
3. `'catalog'` ➔ **3. Categorías e Ítems (Inventario)** (Formularios de creación y listas con botón Eliminar para categorías y productos).
4. `'users'` ➔ **4. Usuarios y Roles** (Formulario de alta y directorio de clientes, empleados y administradores).

#### 2. Todos los estados `useState` de `OperationalERP.jsx` (Líneas 56–123)
- **Datos traídos de PostgreSQL:** `users`, `categories`, `items`, `ordersData` (`{ orders, total, page, pageSize, totalPages, statusSummary }`), `invoices`, `payments`.
- **Notificación superior:** `feedback` (`null` o `{ type: 'success'|'warning'|'error', title, details }`), pintado en verde, ámbar o rojo en las líneas 490–518.
- **Formularios controlados:** `orderForm` (con arreglo dinámico `lines: [{ itemId, quantity }]` y `autoGenerateInvoice: true`), `invoiceForm`, `paymentForm` (con referencia autogenerada `COMP-...`), `catForm`, `itemForm` y `userForm`.

#### 3. Carga automática `loadAll` y `notify` (Líneas 131–166)
- `loadAll = useCallback(async (pageToLoad = 1) => { ... }, [])`: Dispara **6 peticiones GET simultáneas** con `Promise.all` (`fetchOperationalUsers`, `fetchCategories`, `fetchCatalogItems`, `fetchOperationalOrders(pageToLoad, 10)`, `fetchInvoices`, `fetchPayments`) y guarda todo en los estados de React.
- `useEffect(() => { loadAll(); }, [loadAll])`: Hace que apenas se abra la pantalla, `loadAll()` corra automáticamente.
- `notify(type, title, details)`: Muestra el banner de respuesta y vuelve a llamar `loadAll()` para que todas las tablas y el stock en pantalla se refresquen al instante.

#### 4. ¿Qué ocurre línea por línea en cada operación del usuario?

- **Operación A — Crear un Pedido Multicanal (`handleCreateMultichannelOrder`, Líneas 196–232):**
  1. `e.preventDefault()` evita que el navegador recargue toda la página al enviar el `<form>`.
  2. Limpia las líneas `validLines` convirtiendo `itemId` y `quantity` a `Number`.
  3. Llama a `createMultichannelOrder(...)` ➔ `POST /operational/orders`.
  4. Con la respuesta del backend (`res`), construye los mensajes `stockMsgs` mostrando cuánto stock había antes y cuánto quedó (`Inventario 'Cappuccino': 95 -> 93 (-2 uds)`), y si `res.invoice` vino creada muestra también el consecutivo `FAC-...`, el total con IVA y los primeros 16 caracteres del `hash_actual`.
  5. Llama a `notify('success', ...)` que pinta el banner verde y recarga la tabla de inventario y de pedidos.

- **Operación B — Cambiar estado de un pedido (`handleOrderStatusChange`, Líneas 239–246 y 823–831):**
  1. En cada fila de la tabla de pedidos (cuando no está `Cancelled`), hay un `<select value={ord.status}>` con opciones `Requested`, `In Progress` y `Delivered`.
  2. Al cambiar la opción, dispara `onChange` ➔ `updateOperationalOrderStatus(ord.id, e.target.value)` ➔ `PATCH /operational/orders/:id/status`.
  3. `notify('success', ...)` refresca las tarjetas superiores de conteo por estado (`statusSummary`).

- **Operación C — Anular pedido y devolver stock (`handleCancelOperationalOrder`, Líneas 252–266):**
  1. Al pulsar el botón rojo *"Anular (+Stock)"*, llama a `cancelOperationalOrder(orderId)` ➔ `POST /operational/orders/:id/cancel`.
  2. Recibe `res.restoredStock` desde `OperationalService.cancelOrder`, formatea cuántas unidades volvieron a sumarse en cada producto y muestra un banner ámbar (`warning`) refrescando el inventario en vivo.

- **Operación D — Facturar y Anular Factura (`handleQuickInvoiceFromOrder`, `handleGenerateInvoice` y `handleCancelInvoice`, Líneas 272–342):**
  1. Si un pedido aún no tiene factura activa (`!alreadyInvoiced`, verificado en línea 793 con `invoices.some(...)`), muestra el botón *"Facturar"* que llama a `generateInvoice` (`POST /operational/invoices`).
  2. En la Pestaña 2 (`billing`), `handleGenerateInvoice` envía `subtotal`, `porcentajeDescuento` y `porcentajeImpuesto`, recibe la factura con `hash_actual`, `prev_hash`, `warnings` (si el descuento superó el 30%) y `aiClassification` (la probabilidad de fraude calculada por Keras), y los lista todos en el banner.
  3. Al pulsar *"Anular"* sobre una factura en la tabla (línea 1133), `handleCancelInvoice` dispara `POST /operational/invoices/:id/cancel`. Si el backend devolvió `res.suspiciousAlert` (porque era $\ge \$50.000$ o ya estaba `Pagada`), el banner cambia a color ámbar de advertencia.

- **Operación E — Procesar Pago con Comprobante (`handleProcessPayment`, Líneas 351–397):**
  1. Cuando seleccionas una factura en el `<select>` (líneas 995–1002), React autocompleta automáticamente `monto` con `Number(inv.total)` para comodidad del cajero (aunque puedes cambiarlo a propósito para demostrar cómo el sistema atrapa un comprobante con monto adulterado).
  2. Al enviar el formulario, llama a `processPayment` (`POST /operational/payments`).
  3. Lee `const valid = res.receiptValidation?.isValid`: si es `true`, muestra banner verde *"Pago procesado y comprobante verificado criptográficamente"*, la factura pasa a `Pagada` y el pedido pasa a `Delivered`; si es `false` (ej. referencia repetida o monto distinto), muestra banner ámbar *"Pago registrado con ALERTA DE COMPROBANTE SOSPECHOSO"* y en la tabla aparece la etiqueta roja `Sospechoso`.

---

# 🎤 BLOQUE 5: SIMULACRO DE 10 PREGUNTAS DE PROFESOR PARA CÉSAR JULIO BERRIO

Practica leyendo estas 10 respuestas en voz alta. Están diseñadas exactamente con el estilo de pregunta directa de sustentación (*"¿Qué archivo hace esto y qué hace esta línea?"*).

---

### ❓ Pregunta 1: *"César, muéstreme en `src/config/env.js` qué hace exactamente la línea `module.exports = Object.freeze(config);` y qué pasa si borro `HMAC_SECRET` del archivo `.env`."*
> **Respuesta palabra por palabra:**  
> *"Profesor, esa línea está al final de `src/config/env.js` (línea 74) y congela en memoria todo el objeto `config` —además de que adentro también congelamos `config.db` y `config.log`— para que sea **inmutable**: ningún archivo del proyecto puede sobrescribir por accidente el puerto o la llave secreta mientras el servidor está corriendo. Y si borramos `HMAC_SECRET` del `.env`, en las líneas 34 a 41 aplicamos el patrón **Fail-Fast**: el filtro `required.filter((key) => !process.env[key])` detecta que falta `HMAC_SECRET` y lanza un `Error` inmediato en el milisegundo cero antes de siquiera intentar abrir Express o conectarse a PostgreSQL."*

---

### ❓ Pregunta 2: *"¿Por qué tienen `src/server.js` y `src/app.js` en dos archivos separados? ¿Qué pasa cuando presiono `Ctrl + C` en la terminal?"*
> **Respuesta palabra por palabra:**  
> *"Los separamos por Responsabilidad Única y para facilitar las pruebas automatizadas: `src/app.js` construye la cadena de 7 middlewares de Express sin abrir ningún puerto de red, mientras que `src/server.js` verifica las migraciones iniciales y abre el puerto 3000 con `app.listen`. Así los tests pueden importar `app.js` en puertos efímeros sin chocar con el puerto 3000. Cuando usted presiona `Ctrl + C`, el sistema operativo envía la señal `SIGINT`, que captura `src/server.js` en la línea 74 ejecutando `shutdown('SIGINT')`: primero llama a `server.close(...)` para no recibir peticiones nuevas esperando a que terminen las ventas en curso, luego ejecuta `await db.close()` para drenar y cerrar limpiamente el pool de PostgreSQL, y finalmente sale con `process.exit(0)`."*

---

### ❓ Pregunta 3: *"Explíqueme qué es `src/container.js` y por qué `OperationalService` no hace `require('../infrastructure/database/connection')` directamente."*
> **Respuesta palabra por palabra:**  
> *"`src/container.js` es nuestra Raíz de Composición donde aplicamos **Inyección de Dependencias** e **Inversión de Dependencias (DIP)**. `OperationalService` pertenece a la capa de Aplicación (lógica de negocio) y no debe estar acoplado al driver `pg` de PostgreSQL. Por eso `buildContainer()` en `src/container.js` es el único lugar que instancia los 7 repositorios SQL con `{ db }`, se los inyecta por constructor a los 7 servicios, e inyecta los servicios en los 2 controladores (`FraudController` y `OperationalController`). Gracias a eso, en `services.test.js` podemos probar toda la lógica de negocio en milisegundos pasándole repositorios falsos en memoria."*

---

### ❓ Pregunta 4: *"En entregas anteriores suele haber validaciones repetidas en varios archivos. ¿Cómo me garantiza usted que aquí NO hay validaciones redundantes?"*
> **Respuesta palabra por palabra:**  
> *"Porque separamos tajantemente dos fronteras sin repetir ni un solo `if`: en `src/interfaces/http/validators/httpValidator.js` solo validamos **transporte HTTP** (`requireJsonBody` revisa que `req.body` sea un objeto JSON plano y no un arreglo ni nulo, y `requirePositiveIntParam` revisa con `Number.isSafeInteger` que `:id` en la URL sea un entero positivo). En cambio, todas las **reglas de negocio** —como revisar que un pedido tenga al menos un ítem, que haya stock suficiente, que el estado esté en `VALID_ORDER_STATUSES` o que el subtotal sea mayor a cero— viven **una única vez** dentro de `OperationalService.js` y la capa de Dominio."*

---

### ❓ Pregunta 5: *"¿Qué hace exactamente este bloque en `src/interfaces/http/middlewares/errorHandler.js`: `if (handledError && handledError.code === '23505')` y cómo manejan un error 500?"*
> **Respuesta palabra por palabra:**  
> *"`'23505'` es el código oficial SQLSTATE de PostgreSQL cuando se viola una restricción `UNIQUE` (por ejemplo, una transacción con `idTxn` repetido). En lugar de repetir `try/catch` en los servicios buscando ese código de base de datos, `errorHandler.js` lo intercepta en un solo lugar (líneas 30–35) y lo transforma en un `ConflictError` operacional que responde HTTP **409 Conflict**. Y si ocurre un error inesperado no operacional (`isOperational !== true`), registramos el `stack` completo internamente con `logger.error` en `logs/error-*.log`, pero al navegador solo le devolvemos HTTP **500** con `'Error interno del servidor'` y el `requestId`, evitando filtrar rutas internas o trazas sensibles del servidor."*

---

### ❓ Pregunta 6: *"¿Cómo logran que todos los logs de una misma compra tengan el mismo `requestId` sin pasarlo como parámetro, y cómo protegen correos y secretos en `logger.js`?"*
> **Respuesta palabra por palabra:**  
> *"Usamos `AsyncLocalStorage` del módulo nativo `async_hooks` de Node.js en `src/infrastructure/logging/requestContext.js`. Cuando entra la petición HTTP, el middleware `requestContext.js` genera un UUID con `crypto.randomUUID()` y envuelve `next()` dentro de `runWithContext({ requestId }, ...)`. Luego, en `src/infrastructure/logging/logger.js`, el formato `injectRequestContext` lee `getContext()` y estampa ese `requestId` en cada log automáticamente. Para la seguridad, `redactSensitive` revisa el conjunto `SENSITIVE_KEYS` (`password`, `secret`, `hmacSecret`, `hash`) ocultando sus valores con `[REDACTED]`, y aplica `maskEmail` sobre `email` y `user` para transformar por ejemplo `'laura.gomez@appresso.co'` en `'la***@appresso.co'`."*

---

### ❓ Pregunta 7: *"Abra `CatalogRepository.js` en el método `adjustStock`. ¿Qué hace exactamente la línea `SET stock = GREATEST(0, stock + $1)`?"*
> **Respuesta palabra por palabra:**  
> *"Está en `src/infrastructure/database/repositories/CatalogRepository.js`, línea 298. Cumple tres funciones críticas en una sola sentencia SQL parametrizada: primero, usa `$1` y `$2` para impedir inyección SQL; segundo, hace la suma o resta (`stock + $1`, donde `$1` es negativo al crear un pedido y positivo al anularlo) **atómicamente dentro de PostgreSQL**, evitando condiciones de carrera si dos cajeros venden el mismo producto al mismo tiempo; y tercero, `GREATEST(0, ...)` toma el máximo entre cero y el resultado, garantizando que el stock jamás pueda quedar negativo."*

---

### ❓ Pregunta 8: *"Explíqueme paso a paso qué ocurre en el backend cuando crean un pedido multicanal en `POST /operational/orders`."*
> **Respuesta palabra por palabra:**  
> *"Primero pasa por `requireJsonBody` en `operational.routes.js`, llega a `OperationalController.createOperationalOrder` y entra a `OperationalService.createOperationalOrder`. Allí valida que venga al menos un ítem, normaliza el canal (`presencial`, `web`, `app` o `domicilio`), recorre cada línea buscando el producto en `CatalogRepository`, verifica que `catalogItem.stock >= quantity`, descuenta las unidades con `adjustStock(id, -quantity)` y toma el precio oficial del catálogo. Después calcula `subtotal`, resta el `descuento` para hallar la `baseGravable`, calcula el **IVA del 19%** (`baseGravable * 0.19`) y el `total`, guarda el pedido con `orderRepository.createExtended` y, si `autoGenerateInvoice` viene en `true`, llama a `generateInvoice` para emitir de una vez la factura consecutiva con su hash encadenado."*

---

### ❓ Pregunta 9: *"¿Qué pasa exactamente cuando alguien anula un pedido vs cuando alguien anula una factura?"*
> **Respuesta palabra por palabra:**  
> *"Son dos flujos distintos en `OperationalService.js`: cuando anulan un **pedido** (`POST /operational/orders/:id/cancel` o seleccionando `Cancelled` en `PATCH /operational/orders/:id/status`), se ejecuta `cancelOrder(orderId)`, que recorre cada producto del pedido llamando a `catalogRepository.adjustStock(prod.itemId, +prod.quantity)` para **reintegrar las unidades al inventario** y cambia el pedido a `'Cancelled'`. En cambio, cuando anulan una **factura** (`POST /operational/invoices/:id/cancel`), se ejecuta `cancelInvoice(invoiceId, reason)`, que cambia el estado en la tabla `facturas` a `'Anulada'` sin borrar la fila (para no romper la cadena histórica de consecutivos y hashes) y dispara una alerta `suspiciousAlert` si la factura era mayor o igual a \$50.000 o si ya figuraba como `'Pagada'`."*

---

### ❓ Pregunta 10: *"En el frontend React (`OperationalERP.jsx`), ¿cómo se cargan los datos al abrir la vista y cómo sabe la tabla de pedidos si muestra o no el botón 'Facturar'?"*
> **Respuesta palabra por palabra:**  
> *"En `frontend/src/components/OperationalERP.jsx`, al montarse el componente se dispara `useEffect` llamando a `loadAll()`, que ejecuta un `Promise.all` con 6 funciones de `frontend/src/api.js` (`fetchOperationalUsers`, `fetchCategories`, `fetchCatalogItems`, `fetchOperationalOrders`, `fetchInvoices` y `fetchPayments`) guardando las respuestas en sus estados `useState`. Luego, al dibujar cada fila de la tabla de pedidos (línea 793), calcula `const alreadyInvoiced = invoices.some((inv) => Number(inv.pedido_id) === Number(ord.id) && inv.estado !== 'Anulada')`. Solo si `!alreadyInvoiced && ord.status !== 'Cancelled'`, React renderiza el botón `'Facturar'`, evitando facturar dos veces el mismo pedido."*

---
**Fin del Tomo 1 — Guía Maestra Completa para César Julio Berrio.**
