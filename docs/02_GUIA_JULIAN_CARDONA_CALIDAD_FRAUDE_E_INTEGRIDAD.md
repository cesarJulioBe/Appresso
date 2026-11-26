# 📘 TOMO 2 — GUÍA MAESTRA DE SUSTENTACIÓN: CALIDAD DE DATOS, INTEGRIDAD CRIPTOGRÁFICA (BLOCKCHAIN LIGERA) Y MONITOREO ANTIFRAUDE

**Estudiante responsable:** Julián Cardona Atehortúa  
**Proyecto:** Plataforma Operativa Multicanal y Antifraude — **Appresso**  
**Propósito de este documento:** Explicar **absolutamente todos los archivos, diccionarios, funciones y líneas de código** de tus tres módulos de sustentación en español sencillo y cotidiano, como si nunca hubieras programado antes, para que puedas responder con total seguridad cualquier pregunta del profesor sobre **qué hace cada archivo, en qué carpeta vive, cuándo se dispara y qué entra y qué sale en cada línea**.

---

## 🗺️ Mapa General de tus 3 Bloques en la Sustentación

Cuando te toque hablar en la exposición, tú eres el guardián de **la limpieza de los datos y la seguridad financiera** de Appresso. Tus tres grandes responsabilidades conectan todo el sistema así:

1. **Bloque 1 — Limpieza, Normalización y Calidad de Datos (10% de la rúbrica):**
   - Evita que la base de datos se llene de basura humana (nombres con espacios dobles, tildes mezcladas, precios negativos o escritos como `"$ 12.500,00"`, correos con `@@` o `,com`, categorías repetidas en inglés/español y clientes registrados dos veces).
   - **Archivos a tu cargo:**
     - `src/domain/quality/dataCleaner.js` (el motor matemático/lingüístico puro, sin base de datos).
     - `src/application/quality/DataQualityService.js` (el servicio que audita PostgreSQL, calcula el puntaje `qualityScore` de 0 a 100% y fusiona duplicados sin romper llaves foráneas).

2. **Bloque 2 — Integridad Criptográfica con Hash Encadenado tipo Blockchain en Facturas y Pagos (10% de la rúbrica):**
   - Garantiza que **ni siquiera un administrador tramposo o un hacker con acceso directo a PostgreSQL** pueda cambiar el valor de una factura emitida o meter un recibo de pago falso o repetido sin que el sistema encienda una alarma roja inmediata.
   - **Archivos a tu cargo:**
     - `src/domain/integrity/hashChain.js` (sellos HMAC-SHA256 encadenados `prev_hash -> hash_actual` y validador de comprobantes).
     - `src/application/operational/OperationalService.js` (métodos `generateInvoice`, `processPayment`, `verifyIntegrity`, `simulateTampering` y `restoreIntegrityChain`).
     - `frontend/src/components/DataQualityAndIntegrity.jsx` (la pantalla visual con los 5 botones de demostración y los eslabones verdes/rojos).

3. **Bloque 3 — Monitoreo Antifraude de Transacciones en Tiempo Real (HMAC-SHA256 + Ventana Deslizante por Franja Horaria):**
   - Recibe ráfagas de transacciones (por ejemplo, scripts de 300 o 700 compras seguidas), verifica en tiempo constante que nadie haya alterado el mensaje en tránsito (`timingSafeEqual`), revisa qué hora del día es (mañana, tarde-noche o noche-madrugada) y cuenta en memoria RAM cuántas compras lleva ese mismo correo en los últimos $N$ segundos (`SlidingWindow`).
   - **Archivos a tu cargo:**
     - Dominio puro (`src/domain/fraud/`): `hashUtils.js`, `validateTransaction.js`, `validateTransactionHash.js`, `getThresholdByTime.js`, `SlidingWindow.js` y `detectAnomaly.js`.
     - Repositorios SQL (`src/infrastructure/database/repositories/`): `TransactionRepository.js`, `AnomalyRepository.js` y `ThresholdRepository.js`.
     - Servicios de Aplicación (`src/application/fraud/`): `TransactionService.js`, `FraudReportService.js` y `ThresholdService.js`.
     - Capa HTTP y Pantalla React: `src/interfaces/http/controllers/FraudController.js`, `src/interfaces/http/routes/fraud.routes.js` y `frontend/src/components/FraudDetection.jsx`.

---

# 🧹 CAPÍTULO 1: LIMPIEZA, NORMALIZACIÓN Y CALIDAD DE DATOS (10% DE LA RÚBRICA)

Imagina que en una cafetería real trabajan cinco cajeros distintos:
- Uno escribe la categoría `"Café Caliente"`, otro escribe `"  cafes   calientes "` y otro pone `"Hot Coffee"`.
- Uno escribe el precio `12500`, otro escribe `"$ 12.500,00"`, otro mete el dedo mal y pone `"-8500"` o `"8.5"`.
- Una clienta llamada Laura Gómez compra hoy en tienda con su cédula `CC 10.203.040` y mañana pide por domicilio escribiendo `"   laura    GOMEZ  "` con otro correo mal escrito (`laura@@gmail,com`).

Si guardamos eso crudo en PostgreSQL, cuando la gerencia pregunte *"¿cuánto vendimos en Café Caliente?"* o *"¿cuántas unidades quedan de Cappuccino?"*, los reportes saldrán partidos en pedazos y el inventario estará mal. Para resolverlo existe la dupla **`dataCleaner.js`** + **`DataQualityService.js`**.

---

## 1.1 Archivo 1: `src/domain/quality/dataCleaner.js` (Líneas 1 a 714)

- **¿En qué carpeta está?** En `src/domain/quality/dataCleaner.js` (**Capa de Dominio Puro**).
- **¿Por qué decimos "Dominio Puro"?** Porque este archivo **NO importa Express, ni HTTP, ni PostgreSQL (`pg`)**. Solo recibe datos en memoria (textos, números, listas), los limpia con lógica pura de JavaScript y devuelve objetos limpios. Eso hace que sea rapidísimo y fácil de probar en tests unitarios.
- **¿Quién lo llama y cuándo se dispara?**
  1. **`DataQualityService`** (`src/application/quality/DataQualityService.js`): cuando abrimos la pestaña *"Calidad e Integridad"* (`GET /operational/quality/report`) o cuando pulsamos el botón negro *"Ejecutar Limpieza y Normalización Automática"* (`POST /operational/quality/clean`).
  2. **`OperationalService`** (`src/application/operational/OperationalService.js`): **en tiempo real (preventivo)** cada vez que alguien crea o edita un usuario, una categoría, un producto del menú, un pedido o una factura, limpiando el dato *antes* de que toque PostgreSQL.

Vamos a revisar **absolutamente todo su contenido de arriba abajo**.

---

### A. Los 3 Diccionarios de Sinónimos (Líneas 28–81)

En JavaScript, un objeto `{ clave: 'valor' }` funciona internamente como una **Tabla Hash**, lo que significa que buscar una palabra ahí adentro tarda tiempo constante **`O(1)`** (tarda exactamente lo mismo si el diccionario tiene 5 palabras o 50.000 palabras, porque va directo a la casilla de memoria sin recorrer una lista una por una).

#### 1. `CATEGORY_SYNONYMS` (Líneas 28–49)
```javascript
const CATEGORY_SYNONYMS = {
  'cafe caliente': 'Café Caliente',
  'cafes calientes': 'Café Caliente',
  'bebidas calientes cafe': 'Café Caliente',
  'bebida caliente': 'Café Caliente',
  'hot coffee': 'Café Caliente',
  'cafe frio': 'Café Frío',
  'cafes frios': 'Café Frío',
  'bebidas frias': 'Café Frío',
  'cold brew': 'Café Frío',
  'pasteleria': 'Pastelería y Panadería',
  'panaderia': 'Pastelería y Panadería',
  'pasteleria y panaderia': 'Pastelería y Panadería',
  'postres': 'Pastelería y Panadería',
  'reposteria': 'Pastelería y Panadería',
  'desayunos': 'Desayunos y Brunch',
  'desayunos y brunch': 'Desayunos y Brunch',
  'brunch': 'Desayunos y Brunch',
  'accesorios': 'Accesorios y Café en Grano',
  'cafe en grano': 'Accesorios y Café en Grano',
  'accesorios y cafe en grano': 'Accesorios y Café en Grano',
};
```
- **¿Qué hace?** Traduce cualquier forma coloquial, en plural o en inglés hacia una de las **5 categorías oficiales** del menú de Appresso (`Café Caliente`, `Café Frío`, `Pastelería y Panadería`, `Desayunos y Brunch`, `Accesorios y Café en Grano`).
- **Detalle clave si el profesor pregunta:** Observa que todas las llaves de la izquierda están **en minúsculas y sin tildes** (`'cafe frio'`, `'pasteleria'`). ¿Por qué? Porque antes de buscar en el diccionario siempre pasamos la entrada por `toCanonicalKey()`, que le quita tildes y mayúsculas. Así una sola entrada `'cafe caliente'` atrapa `"CAFÉ CALIENTE"`, `"Café caliente"`, `"cafe   caliente"`, etc.

#### 2. `ROLE_SYNONYMS` (Líneas 52–64)
```javascript
const ROLE_SYNONYMS = {
  cliente: 'cliente',
  customer: 'cliente',
  comprador: 'cliente',
  empleado: 'empleado',
  employee: 'empleado',
  cajero: 'empleado',
  barista: 'empleado',
  vendedor: 'empleado',
  admin: 'admin',
  administrador: 'admin',
  gerente: 'admin',
};
```
- **¿Qué hace?** En PostgreSQL la tabla `usuarios` solo maneja 3 roles de seguridad oficiales: `'cliente'`, `'empleado'` y `'admin'`. Si un formulario externo manda `"Barista"`, `"Cajero"`, `"Gerente"` o `"Customer"`, este diccionario lo traduce en `O(1)` al rol oficial correspondiente.

#### 3. `CHANNEL_SYNONYMS` (Líneas 67–81)
```javascript
const CHANNEL_SYNONYMS = {
  presencial: 'presencial',
  tienda: 'presencial',
  local: 'presencial',
  pos: 'presencial',
  web: 'web',
  pagina: 'web',
  online: 'web',
  app: 'app',
  movil: 'app',
  aplicacion: 'app',
  domicilio: 'domicilio',
  delivery: 'domicilio',
  reparto: 'domicilio',
};
```
- **¿Qué hace?** Homologa el canal comercial por donde entró el pedido hacia uno de los **4 canales multicanal oficiales**: `'presencial'`, `'web'`, `'app'` o `'domicilio'`. Si alguien envía `"POS"` o `"Tienda"` -> sale `'presencial'`. Si envía `"Delivery"` -> sale `'domicilio'`.

---

### B. Función 1: `toCanonicalKey(input)` (Líneas 97–113)

Esta es la función más importante de todo el módulo de calidad. Convierte cualquier texto desordenado en una **"llave canónica"** (una huella de texto limpia, sin tildes, en minúsculas y sin símbolos) para poder comparar si dos cosas son la misma.

```javascript
function toCanonicalKey(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**Explicación línea por línea con ejemplo real paso a paso:**  
Supongamos que entra `input = "   ¡¡Café   Frío-Especial #1!!  "`:

1. **Línea 99 (`if (input === null || input === undefined) return '';`):**
   - **¿Qué hace?** Es un guardia de seguridad inicial. Si alguien llama `toCanonicalKey(null)` o `toCanonicalKey(undefined)`, devuelve texto vacío `''` de inmediato.
   - **¿Por qué es vital?** Porque si no estuviera esta línea, `String(null)` se convertiría en la palabra literal `"null"` de 4 letras, y el sistema creería que el cliente se llama `"null"`.
2. **Línea 100 (`String(input)`):**
   - Convierte el dato en texto por si llegó un número (ej. `10203040` -> `"10203040"`).
3. **Línea 102 (`.normalize('NFD')`):**
   - `NFD` significa *Normalization Form Canonical Decomposition* (Descomposición Canónica Unicode).
   - Para el computador, la letra `'é'` es un solo carácter pegado. `.normalize('NFD')` **desarma** cada letra con tilde o virgulilla en **dos piezas separadas**: la letra base normal (`'e'`) seguida del "sombrerito" de la tilde (`'\u0301'`). Igual pasa con `'í'` -> `'i'` + `'\u0301'` y con `'ñ'` -> `'n'` + `'\u0303'`.
   - Nuestro ejemplo pasa a ser internamente: `"   ¡¡Cafe´   Fri´o-Especial #1!!  "`.
4. **Línea 104 (`.replace(/[\u0300-\u036f]/g, '')`):**
   - En la tabla mundial Unicode, todos los "sombreritos" (tildes agudas, graves, diéresis `ü`, virgulilla de la `ñ`) viven juntos entre el código hexadecimal `\u0300` y el `\u036f`.
   - Esta expresión regular con bandera `g` (*global*, es decir, en toda la frase) **borra todos esos sombreritos** y deja intactas las letras base.
   - Nuestro ejemplo queda: `"   ¡¡Cafe   Frio-Especial #1!!  "`.
5. **Línea 106 (`.toLowerCase()`):**
   - Pasa absolutamente todas las letras a minúscula.
   - Nuestro ejemplo queda: `"   ¡¡cafe   frio-especial #1!!  "`.
6. **Línea 108 (`.replace(/[^a-z0-9\s]/g, ' ')`):**
   - Dentro de los corchetes `[...]`, el símbolo `^` al principio significa **"TODO LO QUE NO SEA"**: letras `a-z`, números `0-9` o espacios `\s`.
   - Es decir: signos de exclamación `¡!`, guiones `-`, numeral `#`, puntos `.` o comas `,` se **reemplazan por un espacio en blanco `' '`**. (Nota: se reemplaza por espacio y no por vacío para que `"Frio-Especial"` quede `"frio especial"` separado y no pegado `"frioespecial"`).
   - Nuestro ejemplo queda: `"     cafe   frio especial  1    "`.
7. **Línea 110 (`.replace(/\s+/g, ' ')`):**
   - `\s+` significa *"uno o más espacios en blanco seguidos (espacios, tabulaciones o saltos de línea)"*. Si hay 5 espacios seguidos, los aplasta en **un único espacio `' '`**.
   - Nuestro ejemplo queda: `" cafe frio especial 1 "`.
8. **Línea 112 (`.trim()`):**
   - Corta los espacios sobrantes de las puntas (al inicio y al final).
   - **Resultado final que sale:** `"cafe frio especial 1"`.
- **Complejidad Big-O:** $O(L)$ donde $L$ es el largo del texto (recorre la palabra un número fijo de veces).

---

### C. Función 2: `normalizeDisplayString(input)` (Líneas 121–148)

Mientras que `toCanonicalKey` quita tildes para comparar internamente en la base de datos, **`normalizeDisplayString` deja el nombre bonito y elegante para mostrárselo al cliente en pantalla o en la factura**, respetando las tildes legítimas del español (`Café`, `Gómez`, `Pastelería`) y las reglas gramaticales de mayúsculas (*Title Case*).

```javascript
function normalizeDisplayString(input) {
  if (input === null || input === undefined) return '';
  const collapsed = String(input)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!collapsed) return '';

  return collapsed
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (['de', 'del', 'la', 'el', 'y', 'en', 'con', 'al'].includes(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/^([a-záéíóúñ])/, (m) => m.toUpperCase());
}
```

**Explicación línea por línea con ejemplo real:**  
Supongamos que entra `input = "   el   CAFÉ\tde   la   MAÑANA  "`:

1. **Línea 123:** Si entra `null` o `undefined`, devuelve `''`.
2. **Líneas 125–128 (`collapsed`):**
   - `.replace(/[\r\n\t]+/g, ' ')` cambia cualquier salto de renglón (`Enter`) o tabulación (`\t`) por espacio normal.
   - `.replace(/\s+/g, ' ').trim()` colapsa espacios dobles/triples y recorta los bordes.
   - Nuestro ejemplo queda en `collapsed = "el CAFÉ de la MAÑANA"`.
3. **Línea 131 (`if (!collapsed) return '';`):** Si alguien solo metió espacios `"     "`, al recortar queda vacío y devuelve `''` sin seguir procesando.
4. **Línea 135 (`.split(' ')`):** Parte la frase por cada espacio en un arreglo de palabras: `["el", "CAFÉ", "de", "la", "MAÑANA"]`.
5. **Líneas 136–144 (`.map((word) => ...)`):** Recorre cada palabra:
   - **Línea 137 (`const lower = word.toLowerCase()`):** Baja la palabra a minúsculas (`"el"`, `"café"`, `"de"`, `"la"`, `"mañana"`).
   - **Líneas 139–141:** Pregunta si la palabra está en la lista de conectores del español `['de', 'del', 'la', 'el', 'y', 'en', 'con', 'al']`. Si sí está, la deja en minúscula (porque en español se escribe *"Pastelería y Panadería"*, no *"Pastelería Y Panadería"*, ni *"Dulce De Leche"*).
   - **Línea 143 (`lower.charAt(0).toUpperCase() + lower.slice(1)`):** Si es un sustantivo o adjetivo, toma la primera letra (`charAt(0)`), la sube a mayúscula (`'C'`) y le pega el resto de la palabra desde la posición 1 (`'afé'`) -> `"Café"`, `"Mañana"`.
6. **Línea 145 (`.join(' ')`):** Vuelve a unir las palabras con un espacio: `"el Café de la Mañana"`.
7. **Línea 147 (`.replace(/^([a-záéíóúñ])/, (m) => m.toUpperCase())`):**
   - **¡Truco brillante!** ¿Qué pasó porque la frase empezaba con el artículo `"el"`? Quedó en minúscula al principio (`"el Café..."`). El símbolo `^` significa *"únicamente al puro inicio de toda la frase"*. Si la primera letra de toda la frase quedó minúscula (incluso si tiene tilde como `'á'` o `'ñ'`), la convierte en mayúscula.
   - **Resultado final que sale:** `"El Café de la Mañana"`.

---

### D. Función 3: `unifyCategoryName(rawCategory)` (Líneas 156–194)

Unifica nombres de categorías sucias o sinónimas y nos dice si venía mal escrita (`wasInconsistent: true`) y por qué (`reason`).

```javascript
function unifyCategoryName(rawCategory) {
  const key = toCanonicalKey(rawCategory);
  if (!key) {
    return {
      canonicalKey: 'general',
      displayName: 'General',
      wasInconsistent: true,
      reason: 'Categoría vacía normalizada a General',
    };
  }

  if (CATEGORY_SYNONYMS[key]) {
    const unified = CATEGORY_SYNONYMS[key];
    const unifiedKey = toCanonicalKey(unified);
    const rawTrimmed = String(rawCategory).trim();
    return {
      canonicalKey: unifiedKey,
      displayName: unified,
      wasInconsistent: rawTrimmed !== unified,
      reason: rawTrimmed !== unified ? `Unificada '${rawTrimmed}' -> '${unified}'` : null,
    };
  }

  const displayName = normalizeDisplayString(rawCategory);
  return {
    canonicalKey: key,
    displayName,
    wasInconsistent: String(rawCategory).trim() !== displayName,
    reason:
      String(rawCategory).trim() !== displayName
        ? `Formato normalizado '${rawCategory}' -> '${displayName}'`
        : null,
  };
}
```

**Los 3 caminos posibles de esta función:**
1. **Camino 1 — Categoría vacía (Líneas 158–167):**
   - Si entra `""` o `"   ---  "`, `toCanonicalKey` devuelve `""`.
   - En vez de estallar o guardar vacío, la bautiza automáticamente como `'General'` (`canonicalKey: 'general'`), marca `wasInconsistent: true` y explica la razón.
2. **Camino 2 — Coincide con un sinónimo del diccionario (Líneas 170–181):**
   - Supongamos que entra `"   bebidas   calientes  cafe  "` (exactamente lo que inyecta el botón de datos sucios).
   - Línea 158: `key` vale `'bebidas calientes cafe'`.
   - Línea 170: `CATEGORY_SYNONYMS['bebidas calientes cafe']` existe y devuelve `unified = 'Café Caliente'`.
   - Línea 172: Calcula la llave canónica del nombre oficial: `toCanonicalKey('Café Caliente')` -> `unifiedKey = 'cafe caliente'`. (¡Fíjate qué importante! Así tanto `"Hot Coffee"` como `"bebidas calientes cafe"` terminan teniendo la misma llave `'cafe caliente'` para fusionarse).
   - Línea 178: Compara si lo que entró sin bordes (`rawTrimmed`) ya era idéntico a `'Café Caliente'`. Como no lo era, devuelve `wasInconsistent: true` y `reason: "Unificada 'bebidas   calientes  cafe' -> 'Café Caliente'"`.
3. **Camino 3 — Categoría nueva personalizada (Líneas 184–193):**
   - Si el administrador inventa una categoría nueva como `"   tés   ORIENTALES  "` que no está en `CATEGORY_SYNONYMS`, pasa por `normalizeDisplayString` -> `"Tés Orientales"`, con llave `'tes orientales'`, marcando `wasInconsistent: true` porque tenía espacios y mayúsculas desordenadas.

---

### E. Función 4: `parseAndCleanPrice(rawPrice, bounds)` (Líneas 207–322)

En Colombia es súper común que la gente mezcle el punto de miles con la coma decimal (`"$ 12.500,00"`), o al revés en formato gringo (`"12,500.00"`), o escriba `"8.5"` queriendo decir ocho mil quinientos pesos, o meta un signo menos `"-8500"`, o digite dos ceros de más (`980000` por un café). Esta función arregla **todos esos casos**.

**Parámetros por defecto (Línea 207):**
- `defaultPrice = 5000` (precio de respaldo si alguien manda vacío, `0` o `"gratis"`).
- `minPrice = 100` (ningún producto real cuesta menos de \$100 COP).
- `maxPrice = 5000000` (tope máximo general; nota: cuando `DataQualityService.runAutoClean()` la llama para productos de cafetería, le pasa límites aún más estrictos: `{ defaultPrice: 6500, minPrice: 500, maxPrice: 250000 }`).

**Recorrido línea por línea de las 2 rutas:**

#### Ruta A: Cuando `rawPrice` ya llega como un `number` de JavaScript (Líneas 214–240)
- **Línea 214 (`typeof rawPrice === 'number' && Number.isFinite(rawPrice)`):** Entra aquí si llegó un número real como `-8500`, `0` o `980000` (no texto ni `NaN` ni `Infinity`).
- **Líneas 217–221 (Negativos):** Si `val < 0` (ej. `-8500`), guarda la queja en `issues`, le saca el valor absoluto `Math.abs(val)` -> `8500` y prende la bandera `wasDirty = true`.
- **Líneas 223–227 (Cero o menor al mínimo):** Si `val === 0 || val < minPrice` (ej. el Cappuccino sucio que entra con precio `0`), lo reemplaza por `defaultPrice` (`5000` o `6500`), anota el hallazgo en `issues` y marca `wasDirty = true`.
- **Líneas 229–233 (Exceso del techo máximo):** Si `val > maxPrice` (ej. el Latte sucio de `980000` cuando `maxPrice` es `250000`), lo recorta al tope máximo (`250000`) y marca `wasDirty = true`.
- **Línea 236 (`Math.round(val * 100) / 100`):** Redondea matemáticamente a máximo 2 decimales (multiplica por 100, redondea al entero más cercano y divide entre 100) y retorna `{ cleanPrice, wasDirty, issues }`.

#### Ruta B: Cuando `rawPrice` llega como texto (`string`), `null` o `undefined` (Líneas 243–321)
Veamos qué hace con cadenas difíciles:
1. **Líneas 243–250 (Texto vacío):** Convierte `rawPrice ?? ''` a string y le aplica `.trim()`. Si quedó vacío `""`, retorna `defaultPrice` (`5000`), `wasDirty: true` y el mensaje de precio vacío.
2. **Líneas 253–257 (Detección de signo menos en texto):** Si `rawStr.includes('-')` (ej. `"-12.500"`), marca `wasDirty = true` y agrega `"Signo negativo detectado..."` a `issues`. (Al quitar símbolos en la línea 266, el `-` desaparecerá quedando positivo automáticamente).
3. **Líneas 260–263 (Detección de basura visual):** `/[^0-9.]/.test(rawStr)` revisa si hay cualquier cosa distinta a dígitos o punto (como `$`, `COP`, espacios o comas). Si la hay, marca `wasDirty = true` y registra que se limpió el formato.
4. **Línea 266 (`let normalized = rawStr.replace(/[^0-9.,]/g, '');`):** Borra letras, espacios, signos `$` y signos `-`, dejando **únicamente números, puntos y comas**. Ejemplo: `"$ 12.500,50 COP"` se vuelve `"12.500,50"`.
5. **Líneas 268–270 (Formato Colombiano / Europeo):**
   - Expresión regular: `/^\d{1,3}(\.\d{3})+(,\d+)?$/`
   - Significa: *"De 1 a 3 dígitos al inicio, seguidos de uno o más grupos de punto + 3 dígitos exactos (miles), y opcionalmente una coma con decimales al final"*.
   - Ejemplo: `"12.500,50"` cumple el patrón -> `.replace(/\./g, '')` quita los puntos de miles (`"12500,50"`) y `.replace(',', '.')` cambia la coma decimal por punto de programación (`"12500.50"`).
6. **Líneas 271–273 (Formato Anglosajón / Estadounidense):**
   - Expresión regular: `/^\d{1,3}(,\d{3})+(\.\d+)?$/`
   - Ejemplo: `"12,500.50"` cumple el patrón -> `.replace(/,/g, '')` quita las comas de miles y deja el punto decimal intacto (`"12500.50"`).
7. **Líneas 274–289 (Separadores repetidos por error de dedo, ej. `"12..500"` o `"12,,50"`):**
   - `normalized.split(/[.,]+/).filter(Boolean)` parte por puntos o comas: `"12..500"` se parte en `["12", "500"]`.
   - Mira el último pedazo (`lastPart`): si tiene **exactamente 3 dígitos** (`"500"`), deduce que eran miles y pega todo sin punto -> `"12500"`. Si tiene 1 o 2 dígitos (`"50"`), deduce que eran centavos y lo une con punto -> `"12.50"`.
8. **Líneas 292–297 (`parseFloat` y palabras como `"gratis"`):**
   - Convierte `normalized` a número con `parseFloat(normalized)`. Si alguien escribió `"gratis"`, `normalized` quedó `""`, `parseFloat("")` da `NaN` (`!Number.isFinite(parsed)`), así que asigna `defaultPrice` (`5000`) y marca `wasDirty = true`.
9. **Líneas 298–308 (Heurística colombiana del `"8.5"` -> `8500`):**
   - Si el número dio menor que `minPrice` (`100`), por ejemplo escribieron `"8.5"` en la carta de un menú colombiano (donde la gente abrevia \$8.500 como `8.5`), la línea 300 pregunta: `if (parsed < 100 && rawStr.includes('.'))`. Como `8.5 < 100` y tenía punto, **lo multiplica por 1000** (`8.5 * 1000 = 8500`) y anota la corrección. Si era simplemente `"50"` sin punto, lo sube al piso `minPrice` (`100`).
10. **Líneas 309–314:** Si supera `maxPrice`, lo recorta a `maxPrice`.
11. **Líneas 317–321:** Devuelve `{ cleanPrice: Math.round(parsed * 100) / 100, wasDirty, issues }`.

---

### F. Funciones 5, 6 y 7: `normalizeEmail`, `normalizeRole` y `normalizeChannel` (Líneas 333–390)

#### 5. `normalizeEmail(rawEmail, fallbackName = 'usuario')` (Líneas 333–368)
Corrige los errores de teclado más comunes al escribir un correo:
- **Líneas 335–341:** Pasa todo a minúsculas (`.toLowerCase()`), borra cualquier espacio interno (`.replace(/\s+/g, '')`), convierte arrobas repetidas `@@` o `@@@` en una sola `@` (`.replace(/@@+/g, '@')`), arregla `.com.com` al final dejándolo en `.com`, y arregla cuando presionaron coma en vez de punto `,com` dejándolo en `.com`.
- **Líneas 344–351 (Correo irrecuperable o sin `@`):** Si mandaron `""` o `"no tiene correo"`, toma el nombre del cliente (`fallbackName`, ej. `"Laura Gómez"`), lo pasa por `toCanonicalKey` (`"laura gomez"`), cambia espacios por puntos (`"laura.gomez"`) y le fabrica un correo institucional válido: `"laura.gomez@appresso.co"`, marcando `wasDirty: true`.
- **Líneas 354–357 (Dominio incompleto sin punto):** Parte en `[local, domain] = str.split('@')`. Si escribieron `"juan@gmail"` (olvidaron el `.com`), la línea 356 ve que `domain` no incluye `'.'` y le completa `"gmail.com"`.
- **Líneas 360–367:** Retorna `{ email: cleanEmail, wasDirty, issue }`.

#### 6. `normalizeRole(rawRole)` (Líneas 376–379)
```javascript
function normalizeRole(rawRole) {
  const key = toCanonicalKey(rawRole);
  return ROLE_SYNONYMS[key] || 'cliente';
}
```
Convierte la entrada en llave canónica (ej. `"  Cajero "` -> `'cajero'`), busca en `ROLE_SYNONYMS` (-> `'empleado'`), y si escribieron algo desconocido o vacío devuelve por seguridad el rol de menor privilegio: `'cliente'`.

#### 7. `normalizeChannel(rawChannel)` (Líneas 387–390)
```javascript
function normalizeChannel(rawChannel) {
  const key = toCanonicalKey(rawChannel);
  return CHANNEL_SYNONYMS[key] || 'presencial';
}
```
Convierte el canal en llave canónica (ej. `"Delivery"` -> `'delivery'`), busca en `CHANNEL_SYNONYMS` (-> `'domicilio'`), y si no existe devuelve `'presencial'` por defecto.

---

### G. Funciones de Auditoría Masiva en Colecciones: `detectDuplicateItems`, `detectDuplicateUsers` y `detectInconsistentCategories` (Líneas 398–601)

¡Ojo aquí! El profesor suele preguntar **por qué estas funciones son `O(n)` y no `O(n²)`**.  
- Si comparáramos cada producto contra todos los demás con dos ciclos `for` anidados, con 10.000 productos haríamos $10.000 \times 10.000 = 100.000.000$ de comparaciones (`O(n²)`).
- En cambio, aquí usamos estructuras **`Map` (Tablas Hash)**: damos **una sola pasada** guardando cada elemento en un "cajón" etiquetado con su llave canónica. Si dos registros caen en el mismo cajón, ¡bingo, son duplicados! Eso toma tiempo lineal **`O(n)`**.

#### 8. `detectDuplicateItems(items = [])` (Líneas 398–469)
1. **Líneas 400–406:** Crea dos mapas Hash vacíos (`byNameKey = new Map()` y `bySkuKey = new Map()`) y dos arreglos de resultados (`duplicateGroups` y `priceIssues`).
2. **Líneas 409–440 (Primera pasada `for (const item of items)`):**
   - Saca la llave canónica del nombre (`nameKey = toCanonicalKey(item.nombre || item.name)`), ej. tanto `"Cappuccino Artesanal"` como `"   cappuccino    ARTESANAL  "` producen `'cappuccino artesanal'`.
   - Evalúa el precio con `parseAndCleanPrice(item.precio ?? item.price)`.
   - **Líneas 415–423:** Si `priceCheck.wasDirty` es verdadero, o `Number(item.precio) <= 0`, o `Number(item.precio) > 500000`, mete el ítem en `priceIssues` indicando cuánto tenía (`precioOriginal`) y cuánto sugiere el limpiador (`precioSugerido`).
   - **Líneas 426–439:** Mete el ítem en el cajón `byNameKey.get(nameKey)` (creando el arreglo `[]` si aún no existía) y también en `bySkuKey`.
3. **Líneas 443–460 (Segunda pasada sobre los cajones de `byNameKey`):**
   - Si un cajón tiene más de 1 producto (`if (group.length > 1)`), significa que hay duplicados.
   - Designa al primero que existía (`group[0].id`) como `primaryId` (el registro maestro que sobrevivirá) y al resto (`group.slice(1).map(i => i.id)`) como `duplicateIds` (los repetidos que deben fusionarse).
4. **Líneas 464–468:** Devuelve los grupos, la suma total de ítems sobrantes (`totalDuplicateItems` calculada con `.reduce(...)`) y `priceIssues`.

#### 9. `detectDuplicateUsers(users = [])` (Líneas 478–543) — Explicando `Map`, `Set` y la Firma de IDs
Un cliente duplicado es más escurridizo: a veces repite el **correo**, a veces usa otro correo pero la misma **cédula (`documento`)**, y a veces se registra dos veces con el mismo **nombre completo**.
1. **Líneas 480–485:** Crea **tres `Map`** (`byEmail`, `byName`, `byDocument`) y un **`Set` llamado `seenPairs`**.
   - *¿Qué diferencia hay entre `Map` y `Set`?* Un `Map` guarda pares `clave -> valor` (como una guía telefónica). Un `Set` es un conjunto matemático que solo guarda valores únicos sin repetir y responde `seenPairs.has(x)` en `O(1)`.
2. **Líneas 488–507:** Recorre cada usuario una sola vez:
   - Calcula su correo limpio (`emailKey`), su nombre canónico (`nameKey`) y su documento canónico (`docKey`).
   - Lo indexa en `byEmail`.
   - Lo indexa en `byName` solo si el nombre tiene al menos 3 letras (`nameKey.length >= 3`, para no juntar usuarios cuyo nombre sea solo `"A"`).
   - Lo indexa en `byDocument` solo si el documento tiene al menos 4 caracteres (`docKey.length >= 4`, ignorando guiones vacíos).
3. **Líneas 510–532 (`registerGroup` y la firma determinista de IDs):**
   - Imagina que Laura (ID `2` e ID `15`) tiene **el mismo nombre Y la misma cédula**. Aparecerá duplicada en `byDocument` y también en `byName`. ¡No queremos contarla como 2 problemas distintos!
   - Por eso la línea 513 toma los IDs del grupo, los ordena de menor a mayor (`.sort((a, b) => a - b)`) y los une con guion en la línea 514: `signature = ids.join('-')` -> `"2-15"`.
   - Línea 515: `if (seenPairs.has("2-15")) return;` Si esa pareja exacta ya fue reportada por un criterio más fuerte, se salta. Si no, la guarda en `seenPairs.add("2-15")` y agrega el grupo dejando `ids[0]` (el ID más antiguo, `#2`) como `primaryId` y `ids.slice(1)` (`[#15]`) como `duplicateIds`.
4. **Líneas 535–537:** Ejecuta `registerGroup` en orden de certeza legal: primero por `email_normalizado`, segundo por `documento` y tercero por `nombre_normalizado`.

#### 10. `detectInconsistentCategories(categories = [])` (Líneas 552–601)
1. **Líneas 558–578:** Recorre cada categoría y llama `unifyCategoryName(cat.nombre)`.
   - Si `unified.wasInconsistent` es `true` (ej. `"   bebidas   calientes  cafe  "`), la agrega a `formattingIssues`.
   - Además, mete la categoría en el mapa `byCanonical` usando `unified.canonicalKey` (`'cafe caliente'`).
2. **Líneas 581–592:** Revisa `byCanonical`. Como en la base de datos ya existía `"Café Caliente"` (ID #1) y además inyectamos `"   bebidas   calientes  cafe  "` (ID #6), ¡ambas cayeron en el cajón `'cafe caliente'`! Como `group.length > 1`, arma un grupo en `duplicateCategoryGroups` con `primaryId: 1` y `duplicateIds: [6]`.
3. **Líneas 594–600:** Suma los problemas de formato más las categorías duplicadas en `totalInconsistentCategories`.

---

### H. Funciones Preventivas de Entrada: `cleanUserInput` y `cleanItemInput` (Líneas 609–714)

Estas dos funciones son los "porteros" que llaman los formularios en tiempo real cuando alguien crea un usuario o un producto nuevo:

#### 11. `cleanUserInput(payload = {})` (Líneas 609–649)
- **Líneas 612–617:** Lee `payload.nombre ?? payload.name ?? ''`, lo formatea en Title Case con `normalizeDisplayString` (o `'Usuario Sin Nombre'` si estaba vacío) y si cambió respecto al original agrega una advertencia en `warnings`.
- **Líneas 620–623:** Limpia el correo con `normalizeEmail(payload.email, nombre)`.
- **Línea 626:** Normaliza el rol con `normalizeRole(payload.rol ?? payload.role)`.
- **Líneas 628–630 (Limpieza de cédula/documento):** `String(payload.documento).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()`. Si alguien escribe `"c.c. 10.203.040-1"`, borra puntos, espacios y guiones y lo sube a mayúsculas -> `"CC102030401"`.
- **Líneas 632–634 (Limpieza de teléfono):** `String(payload.telefono).replace(/[^0-9+]/g, '')`. Deja solo números y el signo `+` internacional (ej. `"+57 (300) 111-2233"` -> `"+573001112233"`).
- **Líneas 636–648:** Retorna `cleanData` (incluyendo `nombreNormalizado: toCanonicalKey(nombre)`), el arreglo `warnings` y `wasCleaned: warnings.length > 0`.

#### 12. `cleanItemInput(payload = {})` (Líneas 657–698)
- **Líneas 659–663:** Formatea el nombre del producto con `normalizeDisplayString` (o `'Producto General'`).
- **Líneas 666–669:** Limpia el precio con `parseAndCleanPrice(payload.precio ?? payload.price)` y copia sus `issues` en `warnings`.
- **Líneas 672–677:** Toma el stock (`payload.stock ?? 20`), lo convierte a entero con `parseInt(rawStock, 10)` y si mandaron texto inválido o stock negativo (`-5`), lo corrige a `0` dejando constancia en `warnings`.
- **Líneas 680–682 (Generador automático de SKU):** Si el usuario envió SKU, lo pasa a mayúsculas y cambia espacios por guiones (`"cap 01"` -> `"CAP-01"`). Si **no** envió SKU, fabrica uno único tomando las primeras 6 letras del nombre canónico en mayúsculas más los últimos 4 dígitos del reloj en milisegundos (`Date.now().toString().slice(-4)`), por ejemplo: `"SKU-CAPPUC-4821"`.
- **Líneas 684–698:** Retorna `{ cleanData, warnings, wasCleaned }`. Finalmente, las **líneas 701–714** exportan las 12 funciones con `module.exports`.

---

## 1.2 Archivo 2: `src/application/quality/DataQualityService.js` (Líneas 1 a 443)

- **¿En qué carpeta está?** En `src/application/quality/DataQualityService.js` (**Capa de Aplicación — Casos de Uso**).
- **¿Qué diferencia tiene con `dataCleaner.js`?** `dataCleaner.js` no sabe que existe PostgreSQL. En cambio, `DataQualityService` es el "director de orquesta": lee las tablas reales de PostgreSQL usando los repositorios, les pasa los datos a `dataCleaner.js`, calcula el puntaje de salud de la empresa y ejecuta las fusiones y limpiezas reales en la base de datos.
- **¿Qué recibe en su `constructor` (Líneas 46–63) desde `src/container.js`?**
  - `userRepository` (tabla `usuarios`),
  - `catalogRepository` (tablas `categorias` e `items`),
  - `billingRepository` (tablas `facturas`, `pagos` y `reportes_calidad`),
  - `db` (conexión SQL directa para actualizar llaves foráneas antes de borrar duplicados),
  - `logger` (para registrar eventos en consola/logs).

Veamos sus **3 métodos** paso a paso y línea por línea:

---

### A. Método 1: `async getQualityReport()` (Líneas 74–171)

- **¿Cuándo se dispara?**
  1. Cuando entras a la vista *"Calidad e Integridad"* (`GET /operational/quality/report`).
  2. Cuando cargas el Resumen Ejecutivo (`GET /operational/summary`).
  3. Justo **antes** y justo **después** de correr la limpieza automática (`runAutoClean`), para poder comparar cómo subió el puntaje (por ejemplo, de `81.25%` a `100%`).

**Explicación línea por línea:**
1. **Líneas 76–83 (`Promise.all` en paralelo):**
   ```javascript
   const [users, categories, items, invoices, payments, history] = await Promise.all([
     this.userRepository.listAll(),
     this.catalogRepository.listCategories(),
     this.catalogRepository.listItems(),
     this.billingRepository.listInvoices(),
     this.billingRepository.listPayments(),
     this.billingRepository.listQualityReports(5),
   ]);
   ```
   En lugar de esperar una consulta tras otra en fila india, lanza las 6 consultas a PostgreSQL **al mismo tiempo** con `Promise.all`, trayendo todos los usuarios, categorías, productos, facturas, pagos y los últimos 5 reportes históricos de auditoría.
2. **Líneas 86–88 (Detectores de dominio):**
   Llama a `detectDuplicateItems(items)`, `detectDuplicateUsers(users)` y `detectInconsistentCategories(categories)` de `dataCleaner.js`.
3. **Líneas 91–99 (Strings mal formateados):**
   - `unformattedItems`: filtra productos cuyo `nombre` actual en BD no coincida con `normalizeDisplayString(i.nombre)` (por ejemplo `"   cappuccino    ARTESANAL  "` != `"Cappuccino Artesanal"`).
   - `unformattedUsers`: filtra usuarios cuyo nombre no esté en Title Case limpio o cuyo email marque `wasDirty === true` en `normalizeEmail`.
4. **Líneas 102–107 (Anomalías operativas contables):**
   - `abusiveDiscountInvoices`: facturas con `porcentaje_descuento > 30` (política antifraude interna de Appresso: ningún cajero debe dar más del 30% de descuento).
   - `suspiciousPayments`: pagos donde `comprobante_valido === false` o `estado === 'Sospechoso'`.
5. **Líneas 110–122 (`totalRecords` y `totalIssues`):**
   - **`totalRecords`** = suma de filas de las 5 tablas (`users.length + categories.length + items.length + invoices.length + payments.length`).
   - **`totalIssues`** = suma de las **8 bolsas de defectos**:
     1. `itemAnalysis.totalDuplicateItems` (ítems repetidos),
     2. `itemAnalysis.priceIssues.length` (precios en \$0, negativos o exagerados),
     3. `unformattedItems.length` (nombres de productos sucios),
     4. `userAnalysis.totalDuplicateUsers` (clientes duplicados),
     5. `unformattedUsers.length` (nombres o correos de usuarios sucios),
     6. `categoryAnalysis.totalInconsistentCategories` (categorías mal escritas + categorías duplicadas),
     7. `abusiveDiscountInvoices.length` (descuentos > 30%),
     8. `suspiciousPayments.length` (pagos con recibo falso/sospechoso).
6. **Líneas 125–129 (¡FÓRMULA EXACTA DEL `qualityScore`! — Pregunta fija de profesor):**
   ```javascript
   const rawScore =
     totalRecords > 0
       ? Math.max(0, 100 - (totalIssues / Math.max(1, totalRecords)) * 100)
       : 100;
   const qualityScore = Number(rawScore.toFixed(2));
   ```
   En notación matemática sencilla:
   $$\text{qualityScore} = \max\left(0,\; 100 - \left(\frac{\text{totalIssues}}{\text{totalRecords}}\right) \times 100\right)$$
   - **Ejemplo numérico real:** Si en las 5 tablas hay en total `totalRecords = 40` registros y se detectan `totalIssues = 6` problemas, entonces $\frac{6}{40} \times 100 = 15\%$, y $100 - 15 = 85.00\%$.
   - *¿Por qué tiene `Math.max(0, ...)`?* Porque un solo registro muy sucio puede tener **dos** problemas a la vez (por ejemplo, un producto que tiene el nombre mal escrito **y además** tiene el precio en `0`). Si hubiera más defectos que filas totales, la resta daría negativa; `Math.max(0, ...)` garantiza que el puntaje nunca baje de `0%`.
   - *¿Y si la base de datos está recién instalada con 0 registros?* El ternario `totalRecords > 0 ? ... : 100` evita dividir por cero y devuelve `100%`.
7. **Líneas 132–170 (Clasificación semáforo y desglose `breakdown`):**
   - Si `qualityScore >= 95` -> `'Óptima'` (se pinta verde en React).
   - Si `qualityScore >= 80` -> `'Aceptable (Requiere Limpieza)'` (se pinta amarillo/ámbar).
   - Si es menor a `80` -> `'Crítica (Datos Sucios Detectados)'` (se pinta rojo).
   - Devuelve todos los conteos detallados dentro de `breakdown` y el historial `recentAuditLogs`.

---

### B. Método 2: `async runAutoClean()` (Líneas 181–374)

- **¿Cuándo se dispara?** Cuando el usuario hace clic en el botón negro **"Ejecutar Limpieza y Normalización Automática"** (`POST /operational/quality/clean`).
- **¿Por qué no basta con hacer `DELETE` a lo loco?** ¡Cuidado! En una base de datos relacional (PostgreSQL), si borras una categoría duplicada que ya tenía productos amarrados, o borras un cliente duplicado que ya tenía pedidos, facturas, pagos o transacciones amarradas, PostgreSQL lanzaría un **error de llave foránea (`FOREIGN KEY constraint`)** o perderías el historial de ventas. Por eso `runAutoClean` hace **fusión referencial en 5 fases ordenadas**:

#### Fase Preliminar (Líneas 183–187)
- Toma la foto inicial `beforeReport = await this.getQualityReport()` para saber cuántos errores había antes y qué puntaje teníamos.
- Inicializa `actionsLog = []` (la lista de frases que se mostrará en el recuadro verde en pantalla) y `recordsCorrected = 0`.

#### Fase 1 — Limpieza y Fusión de Categorías (Líneas 190–231)
1. Trae todas las categorías y crea `canonicalCatMap = new Map()`.
2. Por cada categoría `cat`, calcula `unified = unifyCategoryName(cat.nombre)`.
3. **Si esa `canonicalKey` NO ha aparecido antes (`!canonicalCatMap.has(...)`, Líneas 197–215):**
   - La guarda en el mapa como la **categoría maestra oficial**.
   - Si su nombre o su `nombre_normalizado` estaban feos, llama `updateCategory(cat.id, ...)` para dejarla impecable, suma `recordsCorrected++` y agrega el mensaje a `actionsLog`.
4. **Si esa `canonicalKey` YA existía en el mapa (`else`, Líneas 216–230 — Categoría Duplicada):**
   - Recupera la categoría maestra original: `primaryCat = canonicalCatMap.get(unified.canonicalKey)` (ej. `'Café Caliente'`, ID `#1`).
   - **Líneas 220–223 (Reasignación SQL antes de borrar):**
     ```javascript
     await this.db.query(
       'UPDATE items SET categoria_id = $1 WHERE categoria_id = $2',
       [primaryCat.id, cat.id]
     );
     ```
     Mueve todos los productos que apuntaban a la categoría repetida (`cat.id`) para que ahora apunten a la categoría maestra (`primaryCat.id`).
   - **Línea 225:** Ahora que la categoría repetida quedó sin hijos huérfanos, la elimina limpia y seguramente con `await this.catalogRepository.deleteCategory(cat.id)`.
   - Suma `recordsCorrected++` y escribe en `actionsLog`: *"Categoría duplicada '...' fusionada con 'Café Caliente'"*.

#### Fase 2 — Limpieza de Precios, Nombres y Suma de Stock en Ítems Duplicados (Líneas 234–280)
1. Trae todos los productos (`listItems()`) y crea `canonicalItemMap = new Map()`.
2. Por cada producto `item`:
   - Limpia su nombre (`cleanName = normalizeDisplayString(item.nombre)`) y saca su `canonicalKey`.
   - Limpia su precio con reglas estrictas de cafetería (`defaultPrice: 6500`, `minPrice: 500`, `maxPrice: 250000`). Así, el Cappuccino en `$0` sube automáticamente a `$6.500` y el Latte inflado de `$980.000` se corrige al tope de `$250.000`.
3. **Si es la primera vez que vemos ese producto (`!canonicalItemMap.has(canonicalKey)`, Líneas 249–268):**
   - Lo guarda como ítem maestro. Si el nombre, la clave normalizada o el precio cambiaron (`needsUpdate`), actualiza la fila con `updateItem`, suma `recordsCorrected++` y lo anota en `actionsLog`.
4. **Si el producto está duplicado (`else`, Líneas 269–279):**
   - Ejemplo: Ya existía `"Cappuccino Artesanal"` (ID `#1` con 40 unidades de stock) y encontramos `"   cappuccino    ARTESANAL  "` (ID `#12` con 15 unidades de stock).
   - **Líneas 272–273:** Calcula `addedStock = Math.max(0, Number(item.stock || 0))` (`15`) y llama `await this.catalogRepository.adjustStock(primaryItem.id, addedStock)` para **sumarle esas 15 unidades al producto maestro** (`40 + 15 = 55` en stock). ¡Así no se pierde mercancía real de la bodega!
   - **Línea 274:** Borra el ítem repetido con `deleteItem(item.id)`, incrementa `recordsCorrected++` y registra la unificación en `actionsLog`.

#### Fase 3 — Normalización y Fusión Referencial de Clientes Duplicados (Líneas 283–346)
1. Trae todos los usuarios (`listAll()`) y crea `seenUserKeys = new Map()`.
2. Por cada usuario:
   - Limpia su nombre (`cleanName`) y su correo (`emailCheck = normalizeEmail(user.email, cleanName)`).
   - **Líneas 293–296 (Llave fuerte de identidad `dedupKey`):** Si el usuario tiene cédula/documento de 5 o más caracteres (ej. `'CC10203040'`), su llave es `'doc:cc10203040'`; si no tiene cédula registrada, usa `'name:' + canonicalName`.
3. **Si NO hemos visto ni su `dedupKey` ni su `email` (`Líneas 298–317`):**
   - Registra ambas llaves (`dedupKey` y `'email:' + emailCheck.email`) apuntando a este usuario maestro.
   - Si tenía el nombre o correo sucios, lo actualiza en BD (`this.userRepository.update(...)`).
4. **Si YA existía por cédula, nombre o correo (`else`, Líneas 318–345 — Fusión en 4 tablas SQL):**
   - Recupera al usuario original `primaryUser`.
   - Antes de borrar al clon (`user.id`), ejecuta **4 sentencias `UPDATE` parametrizadas** en PostgreSQL (Líneas 323–338):
     1. `UPDATE orders SET usuario_id = $1 WHERE usuario_id = $2` (le pasa sus pedidos al usuario principal),
     2. `UPDATE facturas SET usuario_id = $1 WHERE usuario_id = $2` (le pasa sus facturas),
     3. `UPDATE pagos SET usuario_id = $1 WHERE usuario_id = $2` (le pasa sus pagos),
     4. `UPDATE transacciones SET usuario_id = $1 WHERE usuario_id = $2` (le pasa su historial antifraude).
   - **Línea 339:** Ahora sí borra al usuario duplicado con `await this.userRepository.delete(user.id)` sin perder ni un peso de historia contable.

#### Fases 4 y 5 — Nuevo Puntaje y Acta Histórica en `reportes_calidad` (Líneas 349–373)
- **Línea 349:** Toma la foto final `afterReport = await this.getQualityReport()`.
- **Líneas 352–362:** Guarda un registro permanente de auditoría en la tabla `reportes_calidad` mediante `this.billingRepository.saveQualityReport(...)` con el puntaje final, total de registros, problemas detectados antes, registros corregidos y el JSON `detalle` con `previousScore`, `newScore` y todo el `actionsLog`.
- **Líneas 365–373:** Retorna todo el paquete al controlador HTTP para que React actualice los indicadores al instante.

---

### C. Método 3: `async seedDirtyData()` (Líneas 385–440)

- **¿Cuándo se dispara?** Cuando en plena sustentación pulsas el botón amarillo **"Inyectar Datos Sucios de Prueba"** (`POST /operational/quality/seed-dirty`).
- **¿Por qué existe si `OperationalService` ya limpia todo al crear?** Porque como `OperationalService` es preventivo y limpia en la entrada, la base de datos siempre estaría en 100%. Para demostrarle en vivo al profesor cómo funciona el detector y limpiador ante bases de datos heredadas o migraciones sucias, `seedDirtyData()` escribe **directamente en los repositorios** saltándose la limpieza preventiva:
  1. **Línea 387 (`suffix`):** Saca los últimos 4 dígitos de `Date.now()` (ej. `'7391'`) para que puedas oprimir el botón 5 veces seguidas en la exposición sin que choque por SKU o correo único.
  2. **Líneas 390–395 (`dirtyCat`):** Inserta la categoría `'   bebidas   calientes  cafe  '` (espacios múltiples + sinónimo de `'Café Caliente'`).
  3. **Líneas 398–406 (`dirtyItem1`):** Inserta `'   cappuccino    ARTESANAL  '` (duplicado de Cappuccino, mayúsculas revueltas y **precio `0`**) con `15` de stock.
  4. **Líneas 409–417 (`dirtyItem2`):** Inserta `'   latte   vainilla   caramel '` con **precio inflado `980000`** (\$980.000 COP por un café, simulando ceros digitados de más).
  5. **Líneas 420–428 (`dirtyUser`):** Inserta `'   laura    GOMEZ   '` compartiendo exactamente el mismo documento `'CC10203040'` de la clienta Laura Gómez que ya existe en el sistema.
  6. **Líneas 431–439:** Llama a `this.getQualityReport()` para devolver inmediatamente el puntaje caído y los contadores encendidos.


---

# 🔐 CAPÍTULO 2: INTEGRIDAD CRIPTOGRÁFICA CON HASH ENCADENADO TIPO BLOCKCHAIN EN FACTURAS Y PAGOS (10% DE LA RÚBRICA)

Antes de mirar una sola línea de código, entendamos **desde cero** los 3 conceptos criptográficos que hacen funcionar este módulo, usando una analogía de la vida cotidiana que puedes contarle tal cual al profesor.

---

## 2.1 Explicación desde Cero: Hash SHA-256, HMAC y Cadena de Hashes

### 1. ¿Qué es un Hash SHA-256? (La "licuadora" de huella digital)
Imagina una licuadora mágica matemática:
- Tú le metes cualquier texto adentro (corto como `"Hola"` o largo como un libro entero de 500 páginas) y la licuadora **siempre escupe un código exacto de 64 letras y números hexadecimales** (del `0` al `9` y de la `a` a la `f`, que equivalen a 256 bits).
- Tiene tres superpoderes:
  1. **Es determinista:** Si metes exactamente la misma factura hoy y dentro de 10 años, sale **exactamente el mismo código de 64 caracteres**.
  2. **Efecto avalancha:** Si alguien cambia **un solo centavo** (por ejemplo, cambia `total: "50000.00"` por `total: "50000.01"`), el código de 64 caracteres que sale **cambia por completo de pies a cabeza** (no se parece ni en una letra al anterior).
  3. **Es irreversible (de una sola vía):** Así como de un batido no puedes volver a sacar la fresa entera, mirando el código de 64 letras nadie puede devolver el cálculo para saber qué decía el documento original.

### 2. ¿Qué es un HMAC-SHA256 con llave secreta (`HMAC_SECRET`)? (El anillo de lacre real)
Si solo usáramos un SHA-256 normal sin contraseña, habría un peligro: si un hacker entra directo a PostgreSQL, podría cambiar el total de una factura de `$120.000` a `$20.000`, **calcular él mismo el nuevo SHA-256** (porque SHA-256 es una fórmula pública) y sobrescribir también la columna `hash_actual`. ¡Y nadie se daría cuenta!

Aquí entra **HMAC** (*Hash-based Message Authentication Code*):
- Antes de licuar los datos de la factura, el servidor mezcla los datos con una **contraseña ultrasecreta (`HMAC_SECRET`)** que **NO vive en la base de datos**, sino únicamente en la memoria privada del servidor backend (`.env`).
- **Analogía:** Es como cerrar una carta contable con cera caliente y estamparle el **anillo de sello del Rey**. Aunque un ladrón logre entrar a la bóveda de PostgreSQL y borre un número con corrector, **como no tiene el anillo secreto `HMAC_SECRET`**, le es matemáticamente imposible fabricar un sello nuevo válido para el número alterado.

### 3. ¿Qué es una Cadena de Hashes (*Hash Chain* / Blockchain ligera)? (El libro contable cosido)
Todavía quedaba una última trampa posible: ¿qué tal si alguien borra una factura entera del medio o cambia el orden de las páginas?  
Para impedirlo, **amarramos cada factura con la factura inmediatamente anterior**:

- **Factura #1:** Se sella mezclando sus datos + una semilla inicial fija llamada **Bloque Génesis** (`0000...0000`, 64 ceros) -> Esto produce el `Hash #1` (digamos `a8f3...`).
- **Factura #2:** Dentro de sus datos incluye obligatoriamente `prevHash = Hash #1` (`a8f3...`) -> Al sellarla, produce el `Hash #2` (digamos `91c4...`).
- **Factura #3:** Dentro de sus datos incluye obligatoriamente `prevHash = Hash #2` (`91c4...`) -> Al sellarla, produce el `Hash #3`.

**¿Qué pasa si alguien toca la Factura #1 en PostgreSQL?**
1. El sello de la Factura #1 deja de cuadrar con sus propios números (**Eslabón #1 ROTO**).
2. Si el atacante intentara cambiar el `hash_actual` de la Factura #1, entonces el `prev_hash` que quedó escrito dentro de la Factura #2 ya no coincidiría con la Factura #1 (**efecto dominó** que delata la trampa en toda la cadena hacia adelante).

Exactamente el mismo mecanismo protege **dos cadenas independientes** en Appresso:
- La **Cadena de Facturas** (arranca en 64 ceros `0000...`).
- La **Cadena de Pagos y Comprobantes** (arranca en 64 unos `1111...`).

---

## 2.2 Archivo 1: `src/domain/integrity/hashChain.js` (Líneas 1 a 464)

- **¿En qué carpeta está?** En `src/domain/integrity/hashChain.js` (**Capa de Dominio Puro**).
- **Dependencias (Líneas 29–31):** Solo usa el módulo nativo `crypto` de Node.js y el comparador seguro `safeCompareHashes` de `../fraud/hashUtils`. Cero SQL y cero Express.
- **¿Quién lo invoca?** `OperationalService` (`src/application/operational/OperationalService.js`) al emitir facturas, registrar pagos, auditar integridad, simular ataques y restaurar cadenas.

Analicemos **cada constante y cada función línea por línea**:

---

### A. Constantes Génesis y `formatAmount` (Líneas 34–48)

```javascript
const GENESIS_INVOICE_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const GENESIS_PAYMENT_HASH = '1111111111111111111111111111111111111111111111111111111111111111';

function formatAmount(value) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}
```
- **Líneas 34 y 36 (`GENESIS_INVOICE_HASH` y `GENESIS_PAYMENT_HASH`):**
  - La primera factura de la historia no tiene una "factura anterior". Para no dejar `prev_hash` vacío o `null`, toda cadena tipo blockchain arranca de un **Bloque Génesis** conocido de 64 caracteres: 64 ceros para facturas y 64 unos para pagos (separados para que un hash de factura jamás pueda confundirse con uno de pago).
- **Líneas 45–48 (`formatAmount(value)` — ¡PREGUNTA DE ORO DEL PROFESOR!):**
  - **¿Por qué es vital `.toFixed(2)` con columnas `NUMERIC(12,2)` de PostgreSQL?**
  - Mira lo que ocurre sin esta función:
    1. Cuando creas una factura en JavaScript, el total es el número `50000`.
    2. Cuando lo guardas en PostgreSQL en una columna `NUMERIC(12, 2)` y luego lo vuelves a leer con `SELECT * FROM facturas`, el driver `pg` de PostgreSQL te devuelve el texto **`"50000.00"`** (para no perder precisión decimal).
    3. Recuerda el efecto avalancha de SHA-256: licuar `50000` produce un hash **completamente distinto** a licuar `"50000.00"`. ¡Todas las facturas parecerían alteradas al leerlas de la base de datos!
  - Con `formatAmount(value)`, tanto `50000` (número al crear) como `"50000.00"` (texto leído de PostgreSQL) se convierten exactamente en el mismo string **`"50000.00"`** con 2 decimales fijos antes de firmar. Así el hash al crear y el hash al verificar cuadran bit por bit.

---

### B. Firma Encadenada de Facturas: `buildInvoiceCanonicalPayload` y `computeInvoiceChainHash` (Líneas 60–93)

#### 1. `buildInvoiceCanonicalPayload(invoice)` (Líneas 60–77)
```javascript
function buildInvoiceCanonicalPayload(invoice) {
  const canonical = {
    canal: String(invoice.canal || 'presencial'),
    descuento: formatAmount(invoice.descuento),
    impuestos: formatAmount(invoice.impuestos),
    numeroConsecutivo: String(invoice.numeroConsecutivo ?? invoice.numero_consecutivo ?? ''),
    pedidoId: Number(invoice.pedidoId ?? invoice.pedido_id ?? 0),
    prevHash: String(invoice.prevHash ?? invoice.prev_hash ?? GENESIS_INVOICE_HASH),
    subtotal: formatAmount(invoice.subtotal),
    total: formatAmount(invoice.total),
    usuarioId: Number(invoice.usuarioId ?? invoice.usuario_id ?? 0),
  };

  return JSON.stringify(canonical, Object.keys(canonical).sort());
}
```
- **Líneas 62–73:** Arma el objeto plano con los **9 campos contables críticos** de la factura.
  - Fíjate cómo usa el operador `??` (ej. `invoice.numeroConsecutivo ?? invoice.numero_consecutivo`) para soportar tanto objetos en `camelCase` (cuando se está creando en JavaScript) como filas en `snake_case` (cuando vienen leídas de PostgreSQL).
  - En la **línea 69** mete `prevHash` adentro del paquete que se va a firmar. Eso es lo que "cose" esta factura con la anterior.
- **Línea 76 (`JSON.stringify(canonical, Object.keys(canonical).sort())`):**
  - Ordena las 9 llaves en estricto orden alfabético (`canal`, `descuento`, `impuestos`, `numeroConsecutivo`, `pedidoId`, `prevHash`, `subtotal`, `total`, `usuarioId`) y las convierte en un texto JSON compacto sin espacios.
  - **Ejemplo de lo que sale:**
    `'{"canal":"presencial","descuento":"0.00","impuestos":"2280.00","numeroConsecutivo":"FAC-0001","pedidoId":1,"prevHash":"0000...0000","subtotal":"12000.00","total":"14280.00","usuarioId":2}'`

#### 2. `computeInvoiceChainHash(invoice, secret)` (Líneas 86–93)
```javascript
function computeInvoiceChainHash(invoice, secret) {
  if (!secret) throw new Error('HMAC_SECRET es requerido para calcular el hash de la factura');
  const payload = buildInvoiceCanonicalPayload(invoice);
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}
```
- **Línea 88:** Verifica que exista `secret` (`HMAC_SECRET`); si no hay llave, lanza error y se niega a emitir una factura insegura.
- **Línea 89:** Obtiene el texto JSON canónico.
- **Línea 92:** Crea el firmador `crypto.createHmac('sha256', secret)`, le inyecta el texto en formato `'utf8'` (`.update(...)`) y extrae el sello hexadecimal de 64 caracteres (`.digest('hex')`).

---

### C. Firma y Validación Anti-Fraude de Comprobantes de Pago: `computeReceiptHash` y `validatePaymentReceipt` (Líneas 101–217)

En un pago no solo protegemos la fila de la tabla `pagos`, sino también **el recibo o comprobante bancario adjunto** (por ejemplo, el voucher de transferencia Bancolombia o Nequi que presenta el cliente).

#### 3. `computeReceiptHash(receiptData = {}, secret)` (Líneas 101–122)
- **Línea 102:** Exige que `secret` exista.
- **Líneas 105–117:** Toma los 5 datos del soporte bancario:
  - `entidad`: limpia bordes y sube a mayúsculas (ej. `'BANCOLOMBIA'` o por defecto `'PASARELA_APPRESSO'`).
  - `facturaId`: número de ID de la factura que dice estar pagando.
  - `metodoPago`: ej. `'Tarjeta'`, `'Transferencia'`, `'Efectivo'`.
  - `montoComprobante`: formateado a 2 decimales con `formatAmount(...)`.
  - `referencia`: el código único de aprobación del voucher (ej. `'COMP-849201'`).
- **Líneas 120–121:** Ordena las 5 llaves alfabéticamente y calcula su HMAC-SHA256 de 64 caracteres.

#### 4. `validatePaymentReceipt({ payment, invoice, existingReceiptRefs, secret })` (Líneas 135–217)
**¡Pregunta clásica de sustentación!** Esta función aplica **las validaciones documentales y criptográficas anti-fraude** sobre cada recibo de pago antes de darlo por válido:

1. **Validación 1 — Referencia presente y con longitud mínima (Líneas 143–150):**
   - Extrae `ref = String(payment.referenciaComprobante ?? ...).trim()`.
   - `if (!ref || ref.length < 4)` -> Rechaza comprobantes vacíos o con textos ridículos como `"1"` o `"ok"`, agregando `'Referencia de comprobante ausente o demasiado corta'`.
2. **Validación 2 — Detección léxica de comprobantes apócrifos o de ataque (Líneas 153–155):**
   - `if (/FALSO|FAKE|INVALID|ALTERADO|TEST_FRAUD/i.test(ref))` (la `i` ignora mayúsculas/minúsculas).
   - Si el comprobante contiene marcadores de adulteración (como `'COMP-FALSO-ALTERADO-999'` en el simulador de ataque), lo atrapa y registra `'Comprobante marcado con firma/referencia fraudulenta (...)'`.
3. **Validación 3 — Protección Anti-Replay / No reutilización de recibos (Líneas 158–160):**
   - Un fraude muy común en cafeterías y restaurantes es que un cliente tome captura de pantalla de una transferencia Nequi real de ayer y quiera usar **el mismo comprobante para pagar otro pedido hoy** (*Replay Attack*).
   - `existingReceiptRefs` es un `Set` con todas las referencias históricas ya usadas en la cafetería. `existingReceiptRefs.has(ref)` revisa en tiempo instantáneo **`O(1)`** si ese código ya fue gastado antes. Si ya existe, dispara `'Comprobante reutilizado: la referencia ... ya fue usada en otro pago'`.
4. **Validación 4 — Coherencia interna entre monto del pago y monto del recibo (Líneas 163–175):**
   - Compara cuánto dice pagar la operación (`paymentAmount`) contra cuánto dice el PDF/metadata del comprobante (`receiptDeclaredAmount`).
   - `if (Math.abs(paymentAmount - receiptDeclaredAmount) > 0.01)`: usa una tolerancia de 1 centavo (`0.01`) para evitar errores de coma flotante en computadores, y si difieren (ej. quiere pagar \$50.000 con un recibo de \$5.000), lo bloquea.
5. **Validación 5 — Conciliación contable contra el Total y Estado de la Factura (Líneas 178–188):**
   - Si existe la factura asociada (`if (invoice)`):
     - Verifica que el pago cuadre al centavo con `invoice.total` (`Math.abs(paymentAmount - invoiceTotal) > 0.01`).
     - Verifica que nadie intente registrar un pago sobre una factura que ya estaba `'Anulada'` (`if (invoice.estado === 'Anulada')`).
6. **Validación 6 — Verificación criptográfica del sello del comprobante en tiempo constante (Líneas 191–209):**
   - Recalcula cuál debería ser el hash legítimo del recibo (`expectedReceiptHash = computeReceiptHash(..., secret)`).
   - Si el pago ya traía un `comprobanteHash` guardado o externo (`providedHash`), los compara con `!safeCompareHashes(providedHash, expectedReceiptHash)`. Si no coinciden, agrega `'El hash criptográfico del comprobante fue alterado o es apócrifo'`.
- **Retorno (Líneas 211–216):** Devuelve `isValid: issues.length === 0` (`true` solo si pasó **todas** las pruebas sin una sola queja), `comprobanteHash`, `expectedReceiptHash` y el arreglo `issues`.

---

### D. Firma Encadenada de Pagos: `buildPaymentCanonicalPayload` y `computePaymentChainHash` (Líneas 225–255)

#### 5. `buildPaymentCanonicalPayload(payment)` (Líneas 225–242)
Arma el objeto determinista con las **8 propiedades clave del pago**: `comprobanteHash`, `facturaId`, `metodoPago`, `monto` (con `formatAmount`), `pedidoId`, `prevHash` (con respaldo en `GENESIS_PAYMENT_HASH` de 64 unos), `referenciaComprobante` y `usuarioId`, y lo serializa con `Object.keys(canonical).sort()`.
- **Detalle genial para mencionar al profesor (Línea 228):** Como `comprobanteHash` va metido adentro del payload del pago, quedan **doblemente blindados**: si alguien altera el comprobante adjunto, cambia `comprobanteHash` y automáticamente se rompe también el `hash_actual` de la cadena de pagos.

#### 6. `computePaymentChainHash(payment, secret)` (Líneas 251–255)
Verifica `if (!secret)`, llama a `buildPaymentCanonicalPayload(payment)` y retorna su HMAC-SHA256 hexadecimal de 64 caracteres.

---

### E. Los Dos Auditores Completos de Cadena: `verifyInvoiceChain` y `verifyPaymentChain` (Líneas 265–450)

Estas dos funciones son las que recorren toda la historia de la empresa desde el registro #1 hasta el último para dictaminar si alguien tocó la base de datos.

#### 7. `verifyInvoiceChain(invoices = [], secret)` (Líneas 265–348)
1. **Línea 267 (`const ordered = [...invoices].sort((a, b) => Number(a.id) - Number(b.id));`):**
   - Crea una copia (`[...invoices]`) para no desordenar el arreglo original y la ordena por `id` de menor a mayor ($1, 2, 3, \dots$), reconstruyendo el orden exacto en que se emitieron las facturas. Complejidad de este paso: $O(n \log n)$.
2. **Línea 269 (`let expectedPrevHash = GENESIS_INVOICE_HASH;`):**
   - Antes de mirar la Factura #1, sabemos que su `prev_hash` **tiene que ser** los 64 ceros del bloque génesis.
3. **Líneas 274–336 (Ciclo `for` eslabón por eslabón, $O(n)$):**
   - **Línea 280 (`prevLinkValid`):** Comprueba `storedPrevHash === expectedPrevHash`. ¿Esta factura sí apunta al sello exacto de la factura anterior?
   - **Líneas 282–286 (`payloadHashValid`):** Vuelve a calcular el HMAC con los números que hay hoy en la base de datos (`recomputedHash = computeInvoiceChainHash(...)`) y lo compara de forma segura con el sello que se guardó el día que nació la factura (`safeCompareHashes(storedHash, recomputedHash)`). Si alguien le sumó \$75.000 al `total` en SQL, `recomputedHash` dará distinto a `storedHash` y `payloadHashValid` dará **`false`**.
   - **Líneas 288–290 (Controles contables extra):** Revisa si es una anulación sospechosa (`estado === 'Anulada'` y `total >= 100000`) o un descuento abusivo (`porcentaje_descuento > 30`).
   - **Línea 293 (`isIntact`):** Un eslabón solo está sano (`true`) si se cumplen las 3 cosas a la vez: `prevLinkValid && payloadHashValid && inv.estado !== 'Alterada'`.
   - **Líneas 295–332:** Arma el objeto `linkReport` con todos los hashes y mensajes claros en `warnings` (que luego pinta React). Si `!isIntact`, también lo mete en `brokenLinks`.
   - **Línea 335 (`expectedPrevHash = storedHash || recomputedHash;`):** Actualiza el puntero para que la siguiente vuelta del ciclo (`i + 1`) exija como `prev_hash` el hash de esta factura.
4. **Líneas 338–347:** Devuelve el resumen completo con `totalRecords`, `intactCount`, `CompromisedCount`, `isChainValid: brokenLinks.length === 0`, `brokenLinks` y `links`.

#### 8. `verifyPaymentChain(payments = [], invoicesById = new Map(), secret)` (Líneas 360–450)
Funciona igual que el de facturas, pero **además audita todos los comprobantes y atrapa recibos repetidos en tiempo real**:
1. **Línea 361:** Ordena una copia de los pagos por `id` ascendente ($O(n \log n)$).
2. **Línea 364:** Empieza esperando `expectedPrevHash = GENESIS_PAYMENT_HASH` (64 unos).
3. **Línea 366 (`const seenRefs = new Set();`):** Crea una memoria vacía de referencias vistas hasta el momento.
4. **Líneas 370–438 (Ciclo `for` sobre cada pago):**
   - **Línea 376:** Busca en `O(1)` la factura que pagó este recibo usando `invoicesById.get(Number(pay.factura_id))`.
   - **Líneas 379–384:** Pasa el pago por `validatePaymentReceipt` entregándole `seenRefs`. Si el Pago #5 intenta reusar el mismo número de comprobante del Pago #2, `seenRefs` ya lo tendrá adentro y ¡lo atrapa!
   - **Líneas 387–388:** Mete la referencia actual en `seenRefs.add(ref)` para vigilar todos los pagos futuros.
   - **Líneas 391–396:** Verifica el enlace `prevLinkValid` y recalcula el HMAC del pago (`payloadHashValid`).
   - **Líneas 398–402 (`isIntact`):** Exige que **las 4 condiciones sean verdaderas**: `prevLinkValid && payloadHashValid && receiptCheck.isValid && pay.comprobante_valido !== false`.
   - **Línea 437:** Avanza `expectedPrevHash` para el siguiente eslabón.
5. **Líneas 440–449:** Retorna `totalRecords`, `intactCount`, `compromisedCount`, `isChainValid`, `brokenLinks` y `links`.

---

## 2.3 Métodos de Integridad en `src/application/operational/OperationalService.js`

En `OperationalService.js` es donde las cadenas nacen (cuando se factura o se paga) y donde viven los **3 métodos de auditoría, ataque simulado y restauración** (Sección 7 del archivo, Líneas 1005–1200).

### Preludio rápido: ¿Cuándo nace cada eslabón?
- **Al crear una factura (`generateInvoice`, Líneas 769–807):** Pide a PostgreSQL el último hash guardado (`prevHash = await this.billingRepository.getLastInvoiceHash()`, que devuelve los 64 ceros si no hay facturas aún), calcula `hashActual = computeInvoiceChainHash(..., this.secret)` y guarda ambos (`prevHash` y `hashActual`) en la tabla `facturas`.
- **Al registrar un pago (`processPayment`, Líneas 920–974):** Trae todas las referencias usadas (`getAllReceiptReferences()`), valida el recibo con `validatePaymentReceipt(...)`, pide el último hash de pagos (`getLastPaymentHash()`), calcula `hashActual = computePaymentChainHash(..., this.secret)` y guarda el pago en `pagos` (marcándolo `'Aprobado'` si el recibo fue válido o `'Sospechoso'` si falló, dejando siempre rastro forense).

Ahora veamos **línea por línea** los 3 métodos de integridad que el profesor te va a preguntar:

---

### A. Método 1: `async verifyIntegrity()` (Líneas 1017–1041)

- **¿Cuándo se dispara?** Al abrir la pantalla (`GET /operational/integrity/verify`), al pedir el resumen ejecutivo (`GET /operational/summary`) y justo al terminar un ataque simulado o una restauración.

```javascript
async verifyIntegrity() {
  const [invoices, payments] = await Promise.all([
    this.billingRepository.listInvoices(),
    this.billingRepository.listPayments(),
  ]);

  const invoicesById = new Map(invoices.map((inv) => [Number(inv.id), inv]));
  const invoiceChainReport = verifyInvoiceChain(invoices, this.secret);
  const paymentChainReport = verifyPaymentChain(payments, invoicesById, this.secret);

  const isSystemIntegrityValid =
    invoiceChainReport.isChainValid && paymentChainReport.isChainValid;

  return {
    isSystemIntegrityValid,
    checkedAt: new Date().toISOString(),
    invoices: invoiceChainReport,
    payments: paymentChainReport,
  };
}
```
- **Líneas 1019–1022:** Trae en paralelo todas las facturas y todos los pagos desde PostgreSQL.
- **Línea 1025:** Indexa las facturas en un `Map` (`id -> factura`) en tiempo `O(n)` para que `verifyPaymentChain` pueda cruzar cada pago contra su factura en `O(1)` sin hacer ciclos anidados.
- **Líneas 1027 y 1029:** Ejecuta `verifyInvoiceChain` y `verifyPaymentChain` pasándoles `this.secret` (`HMAC_SECRET`).
- **Líneas 1032–1033 (`isSystemIntegrityValid`):** Es el semáforo maestro de todo el sistema: solo da `true` (banner verde en pantalla) si **tanto** la cadena de facturas **como** la cadena de pagos tienen 0 eslabones rotos.

---

### B. Método 2: `async simulateTampering({ type = 'invoice_amount' } = {})` (Líneas 1052–1077)

- **¿Cuándo se dispara?** Cuando en la sustentación oprimes cualquiera de los dos botones rojos (`POST /operational/integrity/tamper-demo`):
  1. Botón **"Simular Factura Alterada"** -> envía `{ type: 'invoice_amount' }`.
  2. Botón **"Simular Comprobante Falso"** -> envía `{ type: 'fake_receipt' }`.

**Explicación línea por línea:**
- **Líneas 1053–1054:** Carga las facturas y pagos actuales.
- **Caso A — Si `type === 'fake_receipt'` y hay pagos (Líneas 1056–1063):**
  - Toma el último pago registrado (`targetPayment = payments[payments.length - 1]`).
  - Llama directamente a `updatePaymentChainFields` en PostgreSQL cambiando `referenciaComprobante` por `'COMP-FALSO-ALTERADO-999'`, poniendo `comprobanteValido: false` y `estado: 'Sospechoso'`, **SIN recalcular `hash_actual`** (porque un atacante en la base de datos no conoce `HMAC_SECRET`).
- **Caso B — Si `type === 'invoice_amount'` (o por defecto) y hay facturas (Líneas 1064–1073):**
  - Toma la primera factura de la cadena (`targetInvoice = invoices[0]`).
  - Le infla el total sumándole \$75.000 pesos (`alteredTotal = Number(targetInvoice.total) + 75000`), le mete un descuento abusivo de `45%` (`> 30%`) y marca `estado: 'Alterada'`, **dejando quieto su `hash_actual` original**.
- **Línea 1076 (`return this.verifyIntegrity();`):** Inmediatamente corre el auditor criptográfico. Como el total en la base de datos ahora es \$75.000 más caro que cuando se selló, el HMAC recalculado cambia por completo, no coincide con `storedHash` y el panel se pone **ROJO** mostrando el `hash_actual` guardado vs el `esperado`.

---

### C. Método 3: `async restoreIntegrityChain()` (Líneas 1086–1199)

- **¿Cuándo se dispara?** Cuando oprimes el botón verde **"Restaurar y Recalcular Cadena"** (`POST /operational/integrity/restore`) después de mostrarle el ataque al profesor.
- **¿Cómo sabe cuál era el valor real de la factura alterada?** ¡Porque el ataque alteró `total` y `porcentaje_descuento`, pero el `subtotal` original de los productos vendidos sigue intacto!

**Explicación línea por línea:**
1. **Parte 1 — Reconstrucción de la Cadena de Facturas (Líneas 1088–1131):**
   - Arranca el puntero `prevInvHash = GENESIS_INVOICE_HASH` (64 ceros).
   - Recorre cada factura `inv` en orden:
     - **Líneas 1093–1100:** Toma el `subtotal` limpio. Si tenía el descuento fraudulento de `45%` (`rawPct > 30`), lo sanea a un descuento comercial legítimo de `5%`. Con eso recalcula matemáticamente `descuento`, `base = subtotal - descuento`, `impuestos` (19% IVA) y el `total` verdadero, y si su estado era `'Alterada'` lo devuelve a `'Pagada'`.
     - **Líneas 1103–1116:** Firma de nuevo el eslabón limpio con `newHash = computeInvoiceChainHash(..., this.secret)` amarrándolo a `prevInvHash`.
     - **Líneas 1119–1127:** Guarda los valores limpios y el nuevo par `(prevInvHash, newHash)` en PostgreSQL.
     - **Línea 1130 (`prevInvHash = newHash`):** Pasa este nuevo sello como `prevHash` para coser la siguiente factura.
2. **Parte 2 — Reconstrucción de la Cadena de Pagos (Líneas 1134–1195):**
   - Vuelve a leer las facturas recién reparadas (`refreshedInvoices`), las mete en un `Map` (`invMap`) y arranca `prevPayHash = GENESIS_PAYMENT_HASH` (64 unos).
   - Recorre cada pago `pay`:
     - **Línea 1143:** Iguala el monto del pago al total restaurado de su factura (`cleanAmount`).
     - **Líneas 1145–1147:** Si la referencia tenía las palabras `'FALSO|FAKE|INVALID|ALTERADO'`, la reemplaza por una referencia limpia restaurada tipo `'COMP-REST-0001'` (`padStart(4, '0')`).
     - **Líneas 1156–1180:** Recalcula primero el sello limpio del recibo (`cleanReceiptHash = computeReceiptHash(...)`) y luego el sello encadenado del pago (`newPayHash = computePaymentChainHash(...)`) amarrado a `prevPayHash`.
     - **Líneas 1183–1194:** Actualiza la fila en `pagos` con estado `'Aprobado'`, `comprobanteValido: true` y avanza `prevPayHash = newPayHash`.
3. **Línea 1198 (`return this.verifyIntegrity();`):** Ejecuta la verificación final para devolverle al frontend la confirmación de que **100% de las facturas y pagos volvieron a estar íntegros**.

---

## 2.4 Archivo 3 (Frontend): `frontend/src/components/DataQualityAndIntegrity.jsx` (Líneas 1 a 417)

- **¿Dónde vive y cuándo aparece en pantalla?** Está en `frontend/src/components/DataQualityAndIntegrity.jsx` y se renderiza dentro de `App.jsx` cuando haces clic en la pestaña **"Calidad e Integridad"** (`activeView === 'quality_integrity'`). Recibe una propiedad `onDataChanged` para avisarle al resto de la aplicación que refresque los contadores globales cuando limpias datos o simulas un ataque.

### A. Los 4 Estados de React (`useState`, Líneas 30–41)
En React, un `useState` es una "cajita de memoria visual": cada vez que cambiamos su valor con `set...`, React vuelve a dibujar automáticamente la pantalla sin recargar el navegador:
1. **`[quality, setQuality] = useState(null)` (Línea 32):** Guarda el objeto del reporte de calidad (`qualityScore`, `status` y el `breakdown` de duplicados/precios/categorías).
2. **`[cleanResult, setCleanResult] = useState(null)` (Línea 35):** Guarda el resultado después de oprimir el botón de limpieza automática (`previousScore`, `newScore`, `recordsCorrected` y la lista `actionsLog`). Cuando es `null`, la caja verde de bitácora permanece oculta.
3. **`[integrity, setIntegrity] = useState(null)` (Línea 38):** Guarda el dictamen completo de `verifyIntegrity()` (el booleano `isSystemIntegrityValid` y los arreglos `invoices.links` y `payments.links`).
4. **`[loading, setLoading] = useState(false)` (Línea 41):** Se pone en `true` mientras viaja una petición al backend para deshabilitar (`disabled={loading}`) los 5 botones y evitar que alguien haga doble clic desesperado.

### B. Carga Inicial en Paralelo: `loadData` y `useEffect` (Líneas 48–64)
- **`loadData` (Líneas 48–59):** Usa `Promise.all([fetchQualityReport(), verifyChainIntegrity()])` de `frontend/src/api.js` para disparar al mismo tiempo:
  - `GET /operational/quality/report` -> guarda en `setQuality(qRes)`.
  - `GET /operational/integrity/verify` -> guarda en `setIntegrity(iRes)`.
- **`useEffect` (Líneas 62–64):** Llama a `loadData()` automáticamente apenas se abre la vista por primera vez.

### C. Tabla Exacta de los 5 Botones en Pantalla (Qué función y qué Endpoint HTTP dispara cada uno)

Si el profesor señala la pantalla y te pregunta *"¿qué pasa por debajo cuando le das clic a ese botón?"*, aquí tienes la ruta completa de los **5 botones**:

| # | Texto exacto del botón en pantalla | Líneas JSX | Manejador en React | Función en `api.js` | Ruta HTTP en Backend | Método de Servicio ejecutado |
| :-: | :--- | :-: | :--- | :--- | :--- | :--- |
| **1** | **Inyectar Datos Sucios de Prueba** (amarillo) | 147–154 | `handleSeedDirty` (L. 71) | `seedDirtyTestData()` | `POST /operational/quality/seed-dirty` | `DataQualityService.seedDirtyData()` |
| **2** | **Ejecutar Limpieza y Normalización Automática** (negro) | 155–162 | `handleRunClean` (L. 88) | `runDataAutoClean()` | `POST /operational/quality/clean` | `DataQualityService.runAutoClean()` |
| **3** | **Simular Factura Alterada** (rojo izq.) | 261–268 | `handleSimulateTamper('invoice_amount')` (L. 105) | `simulateChainTampering('invoice_amount')` | `POST /operational/integrity/tamper-demo` | `OperationalService.simulateTampering({ type: 'invoice_amount' })` |
| **4** | **Simular Comprobante Falso** (rojo der.) | 270–277 | `handleSimulateTamper('fake_receipt')` (L. 105) | `simulateChainTampering('fake_receipt')` | `POST /operational/integrity/tamper-demo` | `OperationalService.simulateTampering({ type: 'fake_receipt' })` |
| **5** | **Restaurar y Recalcular Cadena** (verde) | 278–285 | `handleRestoreIntegrity` (L. 121) | `restoreChainIntegrity()` | `POST /operational/integrity/restore` | `OperationalService.restoreIntegrityChain()` |

### D. ¿Cómo se pintan los colores Semáforo y los Eslabones Verdes/Rojos en el JSX? (Líneas 167–413)

1. **Color del Puntaje de Calidad (Líneas 171–178):**
   - Si `quality.qualityScore >= 95` -> clase `text-emerald-700` (verde esmeralda).
   - Si `>= 80` -> `text-amber-700` (amarillo alerta).
   - Si `< 80` -> `text-red-700` (rojo crítico).
2. **Caja de Bitácora de Limpieza (Líneas 229–244):**
   - Solo se muestra si `cleanResult` existe: imprime cuántos registros se corrigieron (`cleanResult.recordsCorrected`), cómo subió el puntaje (`previousScore% -> newScore%`) y dibuja con `.map(...)` cada renglón de `cleanResult.actionsLog`.
3. **Banner Maestro de Integridad Criptográfica (Líneas 292–312):**
   - Mira el booleano `integrity.isSystemIntegrityValid`:
     - Si es `true`: pinta borde y fondo verde (`border-emerald-300 bg-emerald-50`) con el título `"CADENA CRIPTOGRÁFICA 100% ÍNTEGRA Y VERIFICADA"`.
     - Si es `false`: pinta borde y fondo rojo (`border-red-300 bg-red-50`) con `"ALERTA DE SEGURIDAD: SE DETECTÓ ALTERACIÓN EN LA CADENA DE HASHES O COMPROBANTES"`.
4. **Tarjetas de cada Eslabón de Facturas (`integrity.invoices.links.map`, Líneas 321–361) y de Pagos (`integrity.payments.links.map`, Líneas 372–408):**
   - Cada tarjeta evalúa `link.isIntact`:
     - **Si `link.isIntact === true`:** Tarjeta gris limpia (`border-neutral-200 bg-neutral-50`) con pastilla verde (`bg-emerald-100 text-emerald-800`) que dice **`HASH VÁLIDO`** (en facturas) o **`COMPROBANTE VÁLIDO`** (en pagos).
     - **Si `link.isIntact === false`:** Tarjeta roja de alarma (`border-red-400 bg-red-50`) con pastilla roja (`bg-red-200 text-red-900`) que dice **`ALTERADA`** (en facturas) o **`FRAUDE / FALSO`** (en pagos).
   - **Recorte visual `.slice(0, 32)` (Líneas 346–351):** Como un hash de 64 caracteres es muy ancho, muestra los primeros 32 caracteres seguidos de `...` para `prev_hash` y `hash_actual`. Y si `!link.payloadHashValid` (es decir, alteraron los montos de la factura), **aparece una tercera línea roja** mostrando `esperado : {link.recomputedHash.slice(0, 32)}...` para que el profesor vea con sus propios ojos que el sello guardado y el sello recalculado ya no coinciden, seguido de la lista `link.warnings` en rojo.


---

# 🚨 CAPÍTULO 3: MONITOREO ANTIFRAUDE DE TRANSACCIONES (HMAC-SHA256 + VENTANA DESLIZANTE POR FRANJA HORARIA)

Imagina que un estafador se roba los datos de la tarjeta de crédito de un cliente de Appresso y pone un robot automático a comprar 15 bonos o pedidos seguidos a las 2:00 de la mañana en menos de 3 segundos, antes de que el banco bloquee el plástico. O imagina que alguien intercepta una petición en internet y cambia `"value": 5000` por `"value": 500000` manteniendo la firma vieja.

El **Motor Antifraude de Appresso** frena ambos ataques en milisegundos combinando **tres escudos en memoria**:
1. **Escudo 1 — Integridad de mensaje (`HMAC-SHA256` + `timingSafeEqual`):** Comprueba que nadie haya tocado ni una coma del mensaje desde que salió del originador y evita filtraciones por tiempo de respuesta (*Timing Attacks*).
2. **Escudo 2 — Reglas dinámicas según la hora del día (`getThresholdByTime`):** A las 9:00 a.m. hay mucha gente tomando café (tolera hasta 10 operaciones en la ventana), por la tarde baja a 6, y de **noche-madrugada (`20:00:01` a `05:00:00`)** se vuelve ultra estricto tolerando máximo **3 transacciones**.
3. **Escudo 3 — Ventana Deslizante en RAM por usuario (`SlidingWindow`):** Lleva un cronómetro independiente para cada correo electrónico contando cuántas transacciones ha hecho en los últimos $W$ segundos exactos, desalojando las que ya expiraron.

Vamos a estudiar **archivo por archivo y línea por línea** las 4 capas completas de este módulo: Dominio -> Repositorios SQL -> Servicios de Aplicación -> Controlador, Rutas y Pantalla React.

---

## 3.1 Archivo 1 (Dominio): `src/domain/fraud/hashUtils.js` (Líneas 1 a 135)

- **¿En qué carpeta vive?** `src/domain/fraud/hashUtils.js` (**Dominio Puro**, solo importa `const crypto = require('crypto')` en la línea 26).
- **¿Quién lo llama?** `TransactionService.simulate()` (para firmar simulaciones), `validateTransactionHash.js` (para verificar transacciones entrantes) y `hashChain.js` (que reutiliza `safeCompareHashes`).

Contiene **4 funciones esenciales**:

### A. Función 1: `assertValidSecret(secret)` (Líneas 35–40) — Diseño de Cero Redundancia (DRY)
```javascript
function assertValidSecret(secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('HMAC_SECRET no está configurada o es inválida');
  }
}
```
- **¿Qué hace?** Revisa en `O(1)` que `secret` no sea `null`, `undefined`, vacío `""` ni un número/objeto. Si falla, lanza `Error('HMAC_SECRET no está configurada o es inválida')`.
- **¿Por qué existe como función aparte?** Por el principio **DRY (*Don't Repeat Yourself* — No te repitas)**. Tanto `generateTransactionHash` como `validateTransactionHash` necesitan asegurarse de que `HMAC_SECRET` exista. En vez de copiar y pegar el mismo `if (!secret || typeof secret !== 'string')` en dos archivos distintos, vive **una única vez aquí** y ambos archivos llaman `assertValidSecret(secret)`.

### B. Función 2: `buildCanonicalPayload(transaction)` (Líneas 51–68)
```javascript
function buildCanonicalPayload(transaction) {
  if (!transaction || typeof transaction !== 'object') {
    throw new TypeError('La transacción debe ser un objeto');
  }

  const { idTxn, user, date, value, paymentMethod } = transaction;
  const data = { idTxn, user, date, value, paymentMethod };

  const sortedKeys = Object.keys(data)
    .filter((key) => data[key] !== undefined)
    .sort();

  return JSON.stringify(data, sortedKeys);
}
```
- **Líneas 52–54:** Si `transaction` es `null` o no es un objeto, lanza `TypeError`.
- **Líneas 58–59:** Extrae **únicamente las 5 llaves de negocio** (`idTxn`, `user`, `date`, `value`, `paymentMethod`). **¡Nota vital!** Deja por fuera a propósito el campo `hash` (porque obviamente no puedes meter el sello adentro del texto que vas a sellar) y cualquier campo basura extra que haya mandado el cliente.
- **Líneas 62–64 (`sortedKeys`):** Filtra las llaves que no sean `undefined` y las ordena alfabéticamente con `.sort()`, quedando siempre en el orden: `['date', 'idTxn', 'paymentMethod', 'user', 'value']`.
- **Línea 67 (`JSON.stringify(data, sortedKeys)`):**
  - *¿Por qué es obligatorio `sort()`?* Imagina que un servidor en Python envía `{"user":"a@b.com","value":5000}` y Node.js lo lee como `{"value":5000,"user":"a@b.com"}`. Son los mismos datos, pero si los conviertes a texto en distinto orden, SHA-256 daría dos hashes diferentes. Al pasar `sortedKeys` como segundo parámetro de `JSON.stringify`, equivale exactamente al estándar de Python `json.dumps(tx, sort_keys=True, separators=(",", ":"))`.
  - **Ejemplo real:**
    - Entra: `{ idTxn: 101, user: 'ana@test.com', date: '2026-05-10T08:00:00Z', value: 15000, paymentMethod: 'Tarjeta', hash: 'abc...' }`
    - Sale: `'{"date":"2026-05-10T08:00:00Z","idTxn":101,"paymentMethod":"Tarjeta","user":"ana@test.com","value":15000}'`

### C. Función 3: `generateTransactionHash(transaction, secret)` (Líneas 80–90)
```javascript
function generateTransactionHash(transaction, secret) {
  assertValidSecret(secret);
  const payload = buildCanonicalPayload(transaction);
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}
```
1. **Línea 82:** Valida el secreto con `assertValidSecret(secret)`.
2. **Línea 84:** Construye el JSON canónico ordenado.
3. **Líneas 86–89:** Calcula el HMAC-SHA256 con `secret` sobre los bytes UTF-8 del payload y devuelve el string hexadecimal en minúsculas de **64 caracteres**.

### D. Función 4: `safeCompareHashes(hashA, hashB)` (Líneas 104–127) — ¿Qué es un *Timing Attack*?
```javascript
function safeCompareHashes(hashA, hashB) {
  if (typeof hashA !== 'string' || typeof hashB !== 'string') {
    return false;
  }
  if (hashA.length !== 64 || hashB.length !== 64) {
    return false;
  }
  try {
    const bufA = Buffer.from(hashA, 'hex');
    const bufB = Buffer.from(hashB, 'hex');
    if (bufA.length !== 32 || bufB.length !== 32) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
```
- **¡PREGUNTA ESTRELLA DEL PROFESOR! ¿Por qué NO escribimos simplemente `return hashA === hashB`?**
  - **Qué es un *Timing Attack* (Ataque de Temporización):** Imagina un ladrón de cajas fuertes con un estetoscopio pegado a la puerta. El operador normal `===` de JavaScript compara letra por letra de izquierda a derecha y **apenas encuentra la primera letra distinta, se detiene de inmediato (*cortocircuito*) y devuelve `false`**.
  - Si el hash real empieza por `"a7f9..."`:
    - Cuando el hacker prueba `"0000..."`, falla en la letra 1 y el servidor responde en `10 nanosegundos`.
    - Cuando el hacker prueba `"a000..."`, la primera letra `'a'` sí acertó, falla en la letra 2 y el servidor tarda `15 nanosegundos`.
    - Midiendo millones de peticiones, ¡el hacker puede adivinar el hash letra por letra midiendo cuánto se demora el servidor en decirle que no!
  - **Cómo lo resuelve `crypto.timingSafeEqual(bufA, bufB)`:** Compara **los 32 bytes completos de principio a fin siempre**, usando operaciones matemáticas XOR sin detenerse jamás a mitad de camino. Tarda **exactamente el mismo tiempo** tanto si falló en la primera letra como si acertó 63 de las 64 letras. El ladrón con estetoscopio no escucha absolutamente ninguna diferencia.
- **Explicación de las guardas (Líneas 105–126):**
  - **Líneas 105–112:** Si alguno no es `string` o no mide exactamente `64` caracteres hexadecimales, retorna `false`.
  - **Líneas 115–120:** `Buffer.from(hash, 'hex')` traduce los 64 caracteres hexadecimales a 32 bytes binarios reales ($64 \div 2 = 32$ bytes). *¿Por qué vuelve a preguntar `if (bufA.length !== 32)` en la línea 118?* Porque si alguien mandó 64 letras `'z'` (`"zzzz..."`), `'z'` no existe en hexadecimal (`0-9, a-f`), así que `Buffer.from` aborta la lectura y crea un buffer de 0 bytes; si le pasas buffers de distinto tamaño a `timingSafeEqual`, lanzaría excepción. Esa línea lo blinda devolviendo `false` limpio.

---

## 3.2 Archivo 2 (Dominio): `src/domain/fraud/validateTransaction.js` (Líneas 1 a 80)

- **¿En qué carpeta vive?** `src/domain/fraud/validateTransaction.js` (**Dominio Puro**).
- **¿Cuándo se dispara?** Es el paso #2 de `TransactionService.receive()`, **antes** de tocar PostgreSQL o verificar criptografía. Revisa que los 6 campos de la transacción tengan el tipo y formato correctos y acumula **todos** los errores encontrados (no se detiene en el primero).

### Función auxiliar `receivedType(value)` (Líneas 1–5)
En JavaScript hay una rareza famosa: `typeof null` devuelve `'object'` y `typeof [1, 2]` también devuelve `'object'`. Para darle mensajes de error claros al usuario, esta función distingue explícitamente: si es `null` dice `'null'`, si `Array.isArray(value)` dice `'array'`, y en cualquier otro caso devuelve `typeof value` (`'string'`, `'number'`, `'boolean'`, `'undefined'`).

### Las 6 Validaciones de `validateTransaction(transaction)` (Líneas 7–78)

Desestructura `const { idTxn, user, date, value, paymentMethod, hash } = transaction;` en la línea 9 y revisa uno por uno:

1. **Validación 1 — `idTxn` (Líneas 11–17):**
   - Condición: `if (!Number.isSafeInteger(idTxn) || idTxn <= 0)`
   - Exige que `idTxn` sea un **número entero seguro** (no decimal como `1.5`, no texto como `"10"`, ni mayor a $2^{53}-1$) y estrictamente positivo (`> 0`).
2. **Validación 2 — `user` (Líneas 19–29):**
   - Condición: `typeof user !== 'string' || user.trim() !== user || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user)`
   - Exige 3 cosas: que sea texto, que **no traiga espacios sobrantes en los bordes** (`user.trim() !== user`), y que cumpla la estructura `algo@dominio.extension` sin espacios ni arrobas repetidas.
3. **Validación 3 — `date` (Líneas 31–44):**
   - Condición: `typeof date !== 'string' || date.trim() !== date || !date.includes('T') || !parsedDate || Number.isNaN(parsedDate.getTime())`
   - Exige que sea un string sin espacios en los bordes, que incluya el separador `'T'` del estándar **ISO 8601** (ej. `'2026-05-10T14:30:00Z'`, rechazando fechas ambiguas como `'10/05/2026'`) y que al convertirlo con `new Date(date)` sea una fecha real del calendario (`!Number.isNaN(parsedDate.getTime())`, rechazando `'2026-99-99T00:00:00Z'`).
4. **Validación 4 — `value` (Líneas 46–52):**
   - Condición: `if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)`
   - Exige que el monto sea tipo `number` real (no `"50000"` en comillas), finito (ni `NaN` ni `Infinity`) y mayor que cero (`> 0`).
5. **Validación 5 — `paymentMethod` (Líneas 54–64):**
   - Condición: acepta texto con contenido (`typeof paymentMethod === 'string' && paymentMethod.trim().length > 0`, ej. `'Tarjeta'`) **o** un código numérico finito (`typeof paymentMethod === 'number' && Number.isFinite(paymentMethod)`, ej. código `1` en scripts externos). Si no es ninguno de los dos, agrega error.
6. **Validación 6 — `hash` (Líneas 66–72):**
   - Condición: `if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash))`
   - Exige que el hash sea un string compuesto **exclusivamente por 64 dígitos hexadecimales** (`0-9` y `a-f` mayúsculas o minúsculas).
- **Retorno (Líneas 74–77):** `{ isValid: errors.length === 0, errors }`.

---

## 3.3 Archivo 3 (Dominio): `src/domain/fraud/validateTransactionHash.js` (Líneas 1 a 78)

- **¿En qué carpeta vive?** `src/domain/fraud/validateTransactionHash.js` (**Dominio Puro**).
- **¿Cuándo se dispara?** Es el paso #1 dentro de `detectAnomaly.js` por cada transacción recibida o simulada.

```javascript
function validateTransactionHash(transaction, secret) {
  assertValidSecret(secret);

  if (!transaction || typeof transaction !== 'object') {
    return false;
  }

  const { hash } = transaction;
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  // 1. Verificación primaria canónica (claves ordenadas alfabéticamente)
  const canonicalExpectedHash = generateTransactionHash(transaction, secret);
  if (safeCompareHashes(canonicalExpectedHash, hash)) {
    return true;
  }

  // 2. Fallback de retrocompatibilidad (orden fijo de inserción)
  const { idTxn, user, date, value, paymentMethod } = transaction;
  const legacyData = { idTxn, user, date, value, paymentMethod };
  const legacyPayload = JSON.stringify(legacyData);
  const legacyExpectedHash = crypto
    .createHmac('sha256', secret)
    .update(legacyPayload, 'utf8')
    .digest('hex');

  return safeCompareHashes(legacyExpectedHash, hash);
}
```
**Explicación línea por línea de la doble verificación:**
1. **Línea 44 (`assertValidSecret(secret)`):** Valida que exista `HMAC_SECRET` reutilizando `hashUtils.js`.
2. **Líneas 46–55:** Guardas defensivas: si `transaction` no es objeto o `hash` no es string no vacío, devuelve `false` sin romperse.
3. **Líneas 58–62 (Etapa 1 — Verificación Canónica Estándar):**
   - Calcula el hash oficial con llaves ordenadas alfabéticamente (`date, idTxn, paymentMethod, user, value`) llamando a `generateTransactionHash(transaction, secret)`.
   - Lo compara con `safeCompareHashes(canonicalExpectedHash, hash)`. Si coincide, retorna **`true`** inmediatamente.
4. **Líneas 65–74 (Etapa 2 — Fallback de Retrocompatibilidad):**
   - *¿Por qué existe este segundo intento?* Porque algunos scripts antiguos de carga de pruebas de años anteriores armaban el JSON en el orden en que se escribían los campos `{ idTxn, user, date, value, paymentMethod }` sin aplicar `sort_keys=True`.
   - Si la Etapa 1 no dio `true`, arma `legacyData` en ese orden histórico fijo, le calcula su HMAC-SHA256 con la **misma llave secreta `secret`** y lo compara con `safeCompareHashes(legacyExpectedHash, hash)`.
   - **Nota de seguridad:** Esto **NO debilita la seguridad en absoluto**, porque en ambos casos es obligatorio poseer la llave secreta `HMAC_SECRET` y que los 5 valores estén intactos; simplemente acepta cualquiera de los dos órdenes de serialización legítimos. Si alteraron `value` en 1 peso, **ambos** darán `false`.

---

## 3.4 Archivo 4 (Dominio): `src/domain/fraud/getThresholdByTime.js` (Líneas 1 a 195)

- **¿En qué carpeta vive?** `src/domain/fraud/getThresholdByTime.js` (**Dominio Puro**).
- **Responsabilidad:** Saber exactamente cuántos segundos han pasado desde medianoche para la fecha de una transacción y devolver las reglas de su franja horaria.

Revisemos todas sus piezas línea por línea:

### A. Constantes `DEFAULT_WINDOW_SECONDS` y `DEFAULT_THRESHOLDS` (Líneas 22–50)
- **Línea 22:** `DEFAULT_WINDOW_SECONDS = Number(process.env.FRAUD_WINDOW_SECONDS) || 3;` (ventana por defecto de **3 segundos**).
- **Líneas 25–50 (`DEFAULT_THRESHOLDS` con `Object.freeze`):**
  Usa `Object.freeze(...)` por fuera y por dentro para congelar la tabla y que ningún código pueda modificar por accidente los valores base:
  | Franja | `hora_inicio` | `hora_fin` | `umbral_transacciones` | `ventana_segundos` | Lógica comercial |
  | :--- | :---: | :---: | :---: | :---: | :--- |
  | `'mañana'` | `'05:00:01'` | `'12:00:00'` | **10** | **3s** | Hora pico de desayunos y cafés; mayor tolerancia. |
  | `'tarde-noche'` | `'12:00:01'` | `'20:00:00'` | **6** | **3s** | Tráfico comercial moderado de tarde. |
  | `'noche-madrugada'` | `'20:00:01'` | `'05:00:00'` | **3** | **3s** | Cafetería cerrada / horas de ataque de bots; máxima alerta. |

### B. `formatterCache` y `getFormatter(timeZone)` (Líneas 54–75)
- **¿Por qué hay un `const formatterCache = new Map()` en la línea 54?**
  - Crear `new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', ... })` en JavaScript es una operación pesada porque carga las tablas mundiales de husos horarios. Si llegan 700 transacciones en ráfaga y creáramos un formateador nuevo 700 veces, el servidor se pondría lento.
  - Con `formatterCache`, la primera transacción crea el formateador para `'America/Bogota'` y lo guarda en el `Map`; las otras 699 transacciones lo recuperan listo en **`O(1)`**.

### C. `timeToSeconds(timeStr)` (Líneas 85–91)
```javascript
function timeToSeconds(timeStr) {
  const parts = String(timeStr).split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}
```
- Convierte cualquier hora `"HH:MM:SS"` a un único número entero entre `0` (`00:00:00`) y `86399` (`23:59:59`), porque comparar dos números enteros es muchísimo más limpio y exacto que comparar textos de horas.
- **Ejemplos reales:**
  - `'05:00:00'` -> $5 \times 3600 + 0 + 0 = \mathbf{18.000}$ segundos.
  - `'20:00:01'` -> $20 \times 3600 + 0 + 1 = \mathbf{72.001}$ segundos.

### D. `isWithinRange(currentSeconds, startSeconds, endSeconds)` (Líneas 102–109) — ¡El Cruce de Medianoche!
```javascript
function isWithinRange(currentSeconds, startSeconds, endSeconds) {
  if (startSeconds <= endSeconds) {
    return currentSeconds >= startSeconds && currentSeconds <= endSeconds;
  }
  return currentSeconds >= startSeconds || currentSeconds <= endSeconds;
}
```
- **¡PREGUNTA CLÁSICA DE ALGORITMOS DEL PROFESOR!** *"Julián, ¿cómo hacen para que la franja de `20:00:01` a `05:00:00` no falle a las 2 de la mañana?"*
  - Mira los números: `startSeconds` (`20:00:01`) es **`72.001`**, mientras que `endSeconds` (`05:00:00`) es **`18.000`**. Aquí **el inicio es MAYOR que el fin** porque la franja parte el reloj a la medianoche (`00:00:00`).
  - Si usáramos un `&&` normal (`current >= 72001 && current <= 18000`), **¡ningún número del universo puede ser mayor que 72.001 y al mismo tiempo menor que 18.000!** Daría `false` siempre.
  - Por eso la función distingue los dos casos:
    1. **Franja normal del mismo día (`startSeconds <= endSeconds`, ej. mañana de `18.001` a `43.200`):** Usa **`&&` (AND)**: debe ser mayor o igual a las 5:00:01 a.m. **Y** menor o igual a las 12:00:00 m.
    2. **Franja que cruza la medianoche (`startSeconds > endSeconds`, noche-madrugada de `72.001` a `18.000`):** Usa **`||` (OR)**: pertenece a la franja si ya pasaron las 8:00:01 p.m. (`>= 72001`, por ejemplo las 11:00 p.m. que es `82800`) **O BIEN** si todavía no han dado las 5:00:00 a.m. (`<= 18000`, por ejemplo las 2:00 a.m. que es `7200`). ¡Con ese `||` cubre perfecto desde las 8 p.m. hasta las 5 a.m. del otro día!

### E. `extractSecondsOfDay(dateInput, timeZone = 'America/Bogota')` (Líneas 120–155)
1. **Líneas 121–134 (Strings ISO locales sin zona horaria, ej. `'2026-05-10T02:15:30'`):**
   - Revisa con `/([zZ]|[+-]\d{2}:?\d{2})$/.test(dateInput)` si al final trae `'Z'` o un huso como `'-05:00'`.
   - Si **no** trae zona horaria explícita, lee directamente las horas, minutos y segundos después de la `'T'` con `/T(\d{2}):(\d{2})(?::(\d{2}))?/` para respetar la hora nominal escrita sin que el reloj del servidor le reste 5 horas por accidente.
2. **Líneas 137–154 (Objetos `Date` o strings UTC con `'Z'`, ej. `'2026-05-10T07:00:00.000Z'`):**
   - Lo convierte a la hora local real de Colombia (`'America/Bogota'`, UTC-5 -> `02:00:00` de la madrugada) usando `getFormatter(timeZone).formatToParts(dateObj)`.
   - **Detalle fino en línea 146 (`Number(part.value) % 24`):** En algunos motores V8 de Node.js, la medianoche `00:00` en formato `hour12: false` devuelve `"24"`. Al hacer `24 % 24` da `0`, evitando que medianoche se convierta en el segundo `86400` fuera del día.

### F. `getThresholdByTime(dateInput, thresholds, timeZone)` (Líneas 165–195)
- **Líneas 167–168:** Si `thresholds` viene vacío o nulo, usa `DEFAULT_THRESHOLDS`.
- **Línea 171:** Saca `currentSeconds = extractSecondsOfDay(dateInput, timeZone)`.
- **Líneas 174–185:** Recorre las 3 franjas (`O(f)` donde $f=3 \implies O(1)$), convierte `hora_inicio` y `hora_fin` con `timeToSeconds`, pregunta `isWithinRange(...)` y apenas encuentra la franja devuelve `{ franja, umbral: row.umbral_transacciones, ventanaSegundos: row.ventana_segundos }`.
- **Línea 192:** Cuelga `getThresholdByTime.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS` para que otros servicios puedan leer las franjas base.

---

## 3.5 Archivo 5 (Dominio): `src/domain/fraud/SlidingWindow.js` (Líneas 1 a 94)

- **¿En qué carpeta vive?** `src/domain/fraud/SlidingWindow.js` (**Dominio Puro**).
- **¿Cómo se instancia?** Se crea **una única instancia compartida en memoria RAM** en `src/container.js` y se le inyecta a `TransactionService`, de modo que recuerda entre petición y petición cuántas compras recientes lleva cada usuario.

Veamos el código completo y luego un ejemplo con reloj segundo a segundo:

```javascript
class SlidingWindow {
  constructor() {
    this.windowsByUser = new Map();
  }

  addTransaction(userEmail, transactionDate, windowSeconds) {
    const timestampMs =
      transactionDate instanceof Date
        ? transactionDate.getTime()
        : new Date(transactionDate).getTime();

    let userWindow = this.windowsByUser.get(userEmail);
    if (!userWindow) {
      userWindow = [];
      this.windowsByUser.set(userEmail, userWindow);
    }

    if (userWindow.length === 0 || timestampMs >= userWindow[userWindow.length - 1]) {
      userWindow.push(timestampMs);
    } else {
      let idx = userWindow.length - 1;
      while (idx >= 0 && userWindow[idx] > timestampMs) {
        idx--;
      }
      userWindow.splice(idx + 1, 0, timestampMs);
    }

    const latestTimestampMs = userWindow[userWindow.length - 1];
    const windowStartMs = latestTimestampMs - windowSeconds * 1000;

    let expiredCount = 0;
    while (expiredCount < userWindow.length && userWindow[expiredCount] < windowStartMs) {
      expiredCount++;
    }
    if (expiredCount > 0) {
      userWindow.splice(0, expiredCount);
    }

    return userWindow.length;
  }
}
```

### Explicación línea por línea:
1. **Línea 29 (`this.windowsByUser = new Map()`):**
   - Es un diccionario Hash en RAM donde la **llave** es el correo del cliente (ej. `'ana@test.com'`) y el **valor** es una fila ordenada de números que representan los milisegundos exactos de sus últimas compras (`[1000, 1800, 2500]`).
   - Como cada usuario tiene su propio arreglo separado en el `Map`, que Pedro compre mucho **jamás afecta** la ventana de Ana, y buscar a Ana toma **`O(1)`**.
2. **Líneas 47–50 (`timestampMs`):** Convierte la fecha de la transacción a milisegundos Unix (1 segundo = 1.000 milisegundos).
3. **Líneas 53–57:** Busca el arreglo de ese `userEmail` en `windowsByUser`. Si es la primera vez que compra, le crea su arreglo vacío `[]` y lo guarda en el `Map`.
4. **Líneas 60–71 (Inserción manteniendo el orden cronológico):**
   - **Camino rápido `O(1)` (Líneas 60–61):** En el 99% de los casos las compras llegan en orden de reloj (`timestampMs >= último`). Simplemente la mete al final con `userWindow.push(timestampMs)`.
   - **Camino fuera de orden `O(w)` (Líneas 62–71):** ¿Qué pasa si llegan 2 peticiones por internet casi al mismo tiempo y la de las `10:00:01.200` entra un milisegundo después que la de las `10:00:01.500`? El ciclo `while` camina hacia atrás desde el final buscando el hueco exacto y la mete en su sitio cronológico con `userWindow.splice(idx + 1, 0, timestampMs)`. Así el arreglo **siempre queda garantizado de menor a mayor**.
5. **Líneas 74–76 (Cálculo de la frontera viva de la ventana):**
   - Como está ordenado de menor a mayor, el evento más reciente siempre está en la última casilla: `latestTimestampMs = userWindow[userWindow.length - 1]`.
   - La frontera de inicio es `windowStartMs = latestTimestampMs - windowSeconds * 1000`. Todo lo que haya ocurrido en `[windowStartMs, latestTimestampMs]` sigue vivo; todo lo que sea **estrictamente menor (`< windowStartMs`)** ya envejeció y debe salir.
6. **Líneas 79–86 (Purga por el frente con un solo `splice(0, expiredCount)`):**
   - Como los más viejos están todos juntos al principio del arreglo (índice `0, 1, 2...`), el `while` cuenta cuántos ya vencieron (`expiredCount`).
   - Si vencieron por ejemplo 2, hace **un solo corte limpio** `userWindow.splice(0, 2)` borrando los 2 viejos de golpe (mucho más eficiente que borrar de uno en uno).
7. **Línea 89 (`return userWindow.length`):** Devuelve cuántas transacciones quedaron vivas adentro de la ventana.

### ⏱️ Ejemplo real segundo a segundo (para dibujarlo en el tablero si el profesor pide ejemplo)
Supongamos que son las **11:00 p.m.** (franja `'noche-madrugada'`, `ventanaSegundos = 3` -> `3000 ms`, `umbral = 3`) y compra `'juli@appresso.co'`:

1. **Segundo `1.000s` (`1000 ms`) — Compra #1:**
   - Entra `1000`. Ventana viva: `[1000 - 3000, 1000] = [-2000, 1000]`.
   - Arreglo: `[1000]`. Expirados: `0`. Devuelve **`1`** (`1 < 3` -> **NORMAL**).
2. **Segundo `2.200s` (`2200 ms`) — Compra #2:**
   - Entra `2200` con `push`. Ventana viva: `[2200 - 3000, 2200] = [-800, 2200]`.
   - Arreglo: `[1000, 2200]`. ¿`1000 < -800`? No. Expirados: `0`. Devuelve **`2`** (`2 < 3` -> **NORMAL**).
3. **Segundo `4.500s` (`4500 ms`) — Compra #3 (esperó un poquito):**
   - Entra `4500` con `push` -> `[1000, 2200, 4500]`.
   - Nueva frontera inferior: `windowStartMs = 4500 - 3000 = 1500 ms`.
   - El `while` revisa desde el frente:
     - Índice 0 (`1000`): ¿`1000 < 1500`? **¡SÍ!** `expiredCount = 1` (hace 3.5 segundos que ocurrió, ya salió de la ventana de 3s).
     - Índice 1 (`2200`): ¿`2200 < 1500`? **NO** (ocurrió hace 2.3 segundos, sigue viva). Se detiene el `while`.
   - `userWindow.splice(0, 1)` desaloja el `1000`. Queda `[2200, 4500]`.
   - Devuelve **`2`** (`2 < 3` -> **NORMAL**, ¡se salvó porque la primera ya había expirado!).
4. **Segundo `4.900s` (`4900 ms`) — Compra #4 (ráfaga rápida):**
   - Entra `4900` -> `[2200, 4500, 4900]`.
   - Frontera inferior: `4900 - 3000 = 1900 ms`.
   - ¿`2200 < 1900`? **NO**. Ninguna ha expirado (`expiredCount = 0`).
   - Quedan las 3 vivas `[2200, 4500, 4900]`. Devuelve **`3`** (`3 >= 3` -> **¡ALERTA `POSIBLE_FRAUDE`!**).

---

## 3.6 Archivo 6 (Dominio): `src/domain/fraud/detectAnomaly.js` (Líneas 1 a 96)

Este archivo es el **cerebro puro** que une las piezas anteriores en 4 pasos exactos:

```javascript
function detectAnomaly(
  transaction,
  slidingWindow,
  thresholds = getThresholdByTime.DEFAULT_THRESHOLDS,
  secret,
  detectionDate = null,
  timeZone = 'America/Bogota'
) {
  // Paso 1: Verifica firma HMAC-SHA256 antes de tocar la ventana deslizante
  const isHashValid = validateTransactionHash(transaction, secret);
  if (!isHashValid) {
    return {
      isHashValid: false,
      isAnomaly: false,
      reason: 'El hash no coincide con los datos recibidos',
    };
  }

  // Paso 2: Resuelve la fecha y la franja horaria aplicable
  const rawDate = detectionDate || transaction.date;
  const transactionDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
  const thresholdInfo = getThresholdByTime(rawDate, thresholds, timeZone);

  if (!thresholdInfo) {
    return { isHashValid, isAnomaly: false, reason: 'No se encontró franja horaria configurada' };
  }

  const { umbral, ventanaSegundos, franja } = thresholdInfo;

  // Paso 3: Inserta y purga en la ventana deslizante del usuario
  const transactionCount = slidingWindow.addTransaction(
    transaction.user,
    transactionDate,
    ventanaSegundos
  );

  // Paso 4: Evalúa si alcanzó o superó el umbral de su franja
  const isAnomaly = transactionCount >= umbral;

  return {
    isHashValid,
    isAnomaly,
    franja,
    umbral,
    ventanaSegundos,
    transactionCount,
    tipo: isAnomaly ? 'POSIBLE_FRAUDE' : 'NORMAL',
  };
}
```
- **¡Detalle crucial en las líneas 48–56 (Pregunta de trampa)!**
  - *¿Por qué valida `validateTransactionHash` ANTES de llamar a `slidingWindow.addTransaction`?*
  - ¡Porque si un atacante externo manda 10 transacciones falsas con el correo de un cliente real pero **sin conocer `HMAC_SECRET`** (hash malo), y las metiéramos en `SlidingWindow`, le llenaríamos la ventana al cliente inocente y cuando el cliente real quiera comprar un café le saldría bloqueo por fraude (*Denegación de Servicio*)! Al cortar en la línea 50 cuando `!isHashValid`, las peticiones apócrifas **no contaminan** la ventana en RAM del usuario legítimo.
- **Línea 81 (`const isAnomaly = transactionCount >= umbral;`):** Nota que es **mayor o igual (`>=`)**. Si el umbral de madrugada es `3`, la 1ª y la 2ª son `'NORMAL'`, y en la **3ª transacción dentro de los 3 segundos** ya salta `'POSIBLE_FRAUDE'`.

---

## 3.7 Los 3 Repositorios SQL de Infraestructura (`src/infrastructure/database/repositories/`)

Estos tres archivos viven en la **Capa de Infraestructura** y su única misión es ejecutar sentencias SQL seguras (con `$1, $2...` contra inyección SQL) sobre PostgreSQL:

### A. `TransactionRepository.js` (Líneas 1 a 118 — Tabla `transacciones`)
Recibe `{ db }` en su `constructor` (Línea 28) y expone **4 métodos**:
1. **`create({ idTxn, usuarioId, valor, fechaTxn, hash, metodoPago, estado = 'Procesada' })` (Líneas 49–58):**
   - Ejecuta `INSERT INTO transacciones (id_txn, usuario_id, valor, fecha_txn, hash, metodo_pago, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *` y devuelve `result.rows[0]`.
2. **`findByExternalId(idTxn)` (Líneas 69–77):**
   - Ejecuta `SELECT * FROM transacciones WHERE id_txn = $1` y devuelve la fila o `null`. Sirve para **idempotencia** (impedir que la misma transacción `idTxn` se procese dos veces si la red reintenta el envío).
3. **`findAll()` (Líneas 88–100):**
   ```sql
   SELECT t.*, u.email,
     CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS es_anomalia
   FROM transacciones t
   JOIN usuarios u ON t.usuario_id = u.id
   LEFT JOIN anomalias a ON a.transaccion_id = t.id
   ORDER BY t.fecha_txn ASC
   ```
   - **Explicación sencilla del SQL:** Une cada transacción con la tabla `usuarios` (`JOIN`) para traer el correo `u.email`, y hace un `LEFT JOIN` (unión opcional) con la tabla `anomalias`. Si esa transacción tiene fila en `anomalias` (`a.id IS NOT NULL`), calcula al vuelo `es_anomalia = true`; si no tiene anomalía, devuelve `es_anomalia = false`. Así React sabe si pintar el chip rojo `'Anómala'` o verde `'Exitosa'` en un solo viaje a la base de datos.
4. **`countAll()` (Líneas 109–114):**
   - Ejecuta `SELECT COUNT(*) FROM transacciones` y convierte el texto devuelto por PostgreSQL a entero con `parseInt(result.rows[0].count, 10)`.

### B. `AnomalyRepository.js` (Líneas 1 a 95 — Tabla `anomalias`)
Recibe `{ db }` en su `constructor` (Línea 28) y expone **3 métodos**:
1. **`create({ transaccionId, tipo, nivel, cantidadTransacciones, ventanaSegundos })` (Líneas 46–55):**
   - Ejecuta `INSERT INTO anomalias (transaccion_id, tipo, nivel, cantidad_transacciones, ventana_segundos) VALUES ($1, $2, $3, $4, $5) RETURNING *`.
2. **`findAll()` (Líneas 66–77):**
   - Hace doble `JOIN` (`anomalias -> transacciones -> usuarios`) trayendo `a.*, t.usuario_id, t.valor, t.fecha_txn, u.email` ordenadas de la más reciente a la más vieja (`ORDER BY a.fecha_creacion DESC`).
3. **`countAll()` (Líneas 86–91):**
   - Ejecuta `SELECT COUNT(*) FROM anomalias` y lo pasa por `parseInt(..., 10)`.

### C. `ThresholdRepository.js` (Líneas 1 a 68 — Tabla `umbrales_horarios`)
Recibe `{ db }` en su `constructor` (Línea 26) y expone **2 métodos**:
1. **`findAll()` (Líneas 38–43):**
   - Ejecuta `SELECT * FROM umbrales_horarios` devolviendo las filas de configuración horaria guardadas en disco.
2. **`updateThreshold(franja, umbralTransacciones, ventanaSegundos)` (Líneas 56–64):**
   - Ejecuta `UPDATE umbrales_horarios SET umbral_transacciones = $1, ventana_segundos = $2 WHERE franja = $3 RETURNING *` y devuelve `result.rows[0] || null` (si mandaron un nombre de franja inexistente devuelve `null`).


---

## 3.8 Los 3 Servicios de Aplicación (`src/application/fraud/`)

Ahora subimos a la **Capa de Aplicación (`src/application/fraud/`)**, donde se coordinan el dominio puro y los repositorios SQL.

---

### A. `TransactionService.js` (Líneas 1 a 438)

Es el servicio más importante del módulo antifraude. Recibe en su `constructor` (Líneas 54–86): `userRepository`, `transactionRepository`, `anomalyRepository`, `thresholdService`, `thresholds`, `slidingWindow`, `secret` (`HMAC_SECRET`), `timeZone` (`'America/Bogota'`), `clock` (`() => new Date()`) y `logger`.

Revisemos **todos sus métodos uno por uno**:

#### 1. Método privado `#getActiveThresholds()` (Líneas 93–100)
- En JavaScript moderno, el símbolo `#` al inicio significa **método 100% privado** (nadie fuera de la clase puede llamarlo).
- Pregunta si existe `this.thresholdService`: si sí, lee `this.thresholdService.getThresholdsInMemory()` en **`O(1)` directo desde la RAM** sin hacer ningún `SELECT` a PostgreSQL en cada transacción (vital cuando entran 700 transacciones seguidas). Si no hay `thresholdService` (ej. en un test unitario aislado), usa `this.thresholds` o `DEFAULT_THRESHOLDS`.

#### 2. Método estático `static normalizeInput(body = {})` (Líneas 109–124)
```javascript
static normalizeInput(body = {}) {
  const idTxn = body.idTxn;
  const user = body.user ?? body.email;
  const date = body.date ?? body.fechaTxn ?? body.fecha_txn;
  const value = body.value ?? body.valor;
  const paymentMethod = body.paymentMethod ?? body.metodoPago ?? body.metodo_pago;
  const hash = body.hash;

  return { idTxn, user, date, value, paymentMethod, hash };
}
```
- **¿Qué hace?** Funciona como un traductor universal bilingüe: si un script manda `email`, `fecha_txn`, `valor` y `metodo_pago` en español, o manda `user`, `date`, `value` y `paymentMethod` en inglés, los unifica siempre en las 6 llaves estándar antes de validar.

#### 3. Método privado `async #persistTransactionAndAnomaly({...})` (Líneas 133–167)
Evita repetir código de guardado entre transacciones reales, transacciones con hash malo y simulaciones:
1. **Línea 144 (`const usuario = await this.userRepository.findOrCreate(user)`):** Busca en la tabla `usuarios` el correo `user`; si es un correo nuevo que nunca había comprado, lo crea automáticamente y nos devuelve su `usuario.id` numérico.
2. **Líneas 146–154:** Inserta la fila en la tabla `transacciones` con su `estado` (`'Procesada'` o `'Hash inválido'`).
3. **Líneas 157–163:** Si `anomalyData` no es `null`, inserta también la alerta en la tabla `anomalias` apuntando a `transaccionId: savedTransaction.id`.
4. **Línea 166:** Retorna `{ savedTransaction, savedAnomaly }`.

#### 4. Método principal `async receive(rawInput)` (Líneas 186–333) — Los 10 Pasos Exactos
- **¿Cuándo se dispara?** Cuando entra una transacción externa por `POST /transactions` (o cualquiera de sus 8 alias).
- **Recorrido línea por línea:**
  1. **Paso 1 — Normalización de llaves (Líneas 188–189):** Traduce el `rawInput` con `TransactionService.normalizeInput(rawInput)`.
  2. **Paso 2 — Validación de esquema y tipos (Líneas 193–205):** Llama a `validateTransaction(transaction)`. Si `!validation.isValid`, registra un `logger.warn` y lanza `ValidationError` (código HTTP **400** `'VALIDATION_ERROR'`) con la lista exacta `validation.errors`. *(Nota arquitectónica: esta validación vive UNA SOLA VEZ aquí y no se duplica en el controlador).*
  3. **Paso 3 — Idempotencia / Anti-duplicados por `idTxn` (Líneas 209–219):** Llama a `transactionRepository.findByExternalId(idTxn)`. Si ese `idTxn` ya fue procesado antes, lanza `ConflictError` (código HTTP **409** `'DUPLICATE_TRANSACTION'`). *(Y si dos hilos entran al mismo milisegundo y chocan en el índice `UNIQUE` de PostgreSQL con código `'23505'`, el middleware global `errorHandler.js` lo traduce también a 409).*
  4. **Paso 4 — Verificación de configuración del servidor (Líneas 222–234):** Toma `secret = this.secret || process.env.HMAC_SECRET`. Si el administrador olvidó configurar `HMAC_SECRET`, lanza `ConfigurationError` (HTTP **500** `'CONFIGURATION_ERROR'`).
  5. **Paso 5 — Ejecución del motor antifraude en memoria (Líneas 237–246):** Lee los umbrales de RAM (`#getActiveThresholds()`) y ejecuta `detectAnomaly(transaction, this.slidingWindow, thresholds, secret, null, this.timeZone)`.
  6. **Paso 6 — ¡AUDITORÍA FORENSE CUANDO EL HASH ES INVÁLIDO! (Líneas 249–283 — Pregunta fija de profesor):**
     - *¿Qué pasa si alguien interceptó la transacción y le cambió el monto, haciendo que `!analysis.isHashValid`?*
     - En un sistema ingenuo simplemente se descartaría y el hacker no dejaría huella. En Appresso hacemos **auditoría forense**:
       - Antes de rechazar la petición, las **líneas 256–270** llaman a `#persistTransactionAndAnomaly` guardando la transacción con `estado: 'Hash inválido'` y creando una anomalía con **`tipo: 'HASH_INVALIDO'` y `nivel: 'Crítico'`** (`cantidadTransacciones: 1`, `ventanaSegundos: 0`).
       - Acto seguido, en las **líneas 272–282**, lanza `ValidationError` (HTTP **400**, `code: 'INVALID_HASH'`) informando que fue rechazada pero quedó grabada para investigación de seguridad.
  7. **Paso 7 — Construcción de anomalía por velocidad si el hash sí era válido (Líneas 286–293):** Si `analysis.isHashValid` fue `true` y `analysis.isAnomaly` dio `true` (superó el umbral de su franja en `SlidingWindow`), arma `anomalyData` con `tipo: 'POSIBLE_FRAUDE'`, `nivel: 'Alto'`, `cantidadTransacciones` y `ventanaSegundos`. Si fue normal, `anomalyData = null`.
  8. **Paso 8 — Persistencia exitosa (Líneas 296–305):** Guarda la transacción con `estado: 'Procesada'` y su anomalía (si hubo).
  9. **Paso 9 — Bitácora estructurada (Líneas 308–325):** Escribe `logger.warn` si hubo anomalía de ráfaga o `logger.info` si fue normal.
  10. **Paso 10 — Respuesta (Líneas 328–332):** Devuelve `{ transaction: savedTransaction, analysis, anomaly: savedAnomaly }`.

#### 5. Método `async simulate({ user, value, paymentMethod })` (Líneas 346–415)
- **¿Cuándo se dispara?** Cuando en la pantalla *"Detección de fraude"* escribes un correo y un valor y oprimes el botón **"Enviar transacción"** (`POST /fraud/simulate`).
- **¿Por qué existe un endpoint `simulate` separado de `receive`?** Porque en el navegador web (React) **NO podemos guardar `HMAC_SECRET`** (si la pusiéramos en el frontend, cualquiera abriría las herramientas de desarrollador F12 y se robaría la llave secreta del banco). Por eso el navegador solo manda `{ user, value, paymentMethod }` y el backend:
  1. **Líneas 348–350:** Valida que vengan `user` y `value`.
  2. **Línea 355 (`idTxn` único):** Genera `Date.now() * 1000 + Math.floor(Math.random() * 1000)` para tener un entero único en microsegundos sin colisiones aunque hagas clic 10 veces por segundo.
  3. **Línea 357:** Toma la hora actual `this.clock().toISOString()`.
  4. **Líneas 359–367:** Arma el objeto `base` y lo firma legítimamente con `generateTransactionHash(base, secret)`.
  5. **Líneas 370–401:** Pasa la transacción por `detectAnomaly(...)` (alimentando la misma `SlidingWindow` en RAM) y la guarda en BD con `#persistTransactionAndAnomaly`. Por eso si oprimes el botón 3 veces seguidas rápido en la noche, a la 3ª vez verás saltar el chip rojo **`POSIBLE_FRAUDE`** en vivo.

#### 6. Métodos `listTransactions()` y `listAnomalies()` (Líneas 423–435)
Delegan directamente en `this.transactionRepository.findAll()` y `this.anomalyRepository.findAll()`.

---

### B. `FraudReportService.js` (Líneas 1 a 176)

Construye todos los números y gráficas del panel antifraude. Recibe `{ transactionRepository, anomalyRepository, logger }` en su `constructor` (Línea 30) y tiene **2 métodos**:

#### 1. `async getStats()` (Líneas 45–62)
- **Se dispara en:** `GET /fraud/stats`.
- Cuenta `totalTransacciones` y `totalAnomalias` en PostgreSQL y calcula `porcentajeAnomalias = ((totalAnomalias / totalTransacciones) * 100).toFixed(2)` (devolviendo `'0.00'` si hay 0 transacciones para no dividir entre cero, convertido a número con `parseFloat`).

#### 2. `async getDashboard()` (Líneas 71–173)
- **Se dispara en:** `GET /fraud/dashboard`.
- **Líneas 73–76:** Carga en paralelo con `Promise.all` todas las transacciones y anomalías.
- **Líneas 79–88 (Cálculo de fronteras de calendario):**
  - `startOfDay`: hoy a las `00:00:00.000`.
  - `startOfWeek`: lunes de la semana actual a las `00:00` (en la línea 86 usa `day === 0 ? 6 : day - 1` porque en JavaScript el domingo es `0`, así que si hoy es domingo retrocede 6 días hasta el lunes).
  - `startOfMonth`: día `1` del mes actual a las `00:00`.
- **Líneas 91–112 (`periodStats`):** Calcula cuántas transacciones, anomalías y porcentaje ocurrieron **Hoy**, **Esta semana** y **Este mes**.
- **Líneas 115–116 (`Set` de usuarios):** `new Set(transactions.map(t => t.email))` cuenta usuarios únicos totales (`users.size`) y `new Set(anomalies.map(a => a.email))` cuenta cuántos clientes distintos sufrieron anomalías (`affectedUsers.size`).
- **Líneas 119–130 (`paymentMethods` y `levels`):** Usa `.reduce(...)` para agrupar cuántas compras hubo por método de pago (`Tarjeta`, `Efectivo`, `Transferencia`) y cuántas anomalías hubo por severidad (`Alto`, `Crítico`).
- **Líneas 133–136 (`hourlyAnomalies` — El histograma de 24 barras):** `Array.from({ length: 24 }, (_, hour) => ...)` genera las 24 casillas desde `"00:00"` hasta `"23:00"` contando cuántas anomalías cayeron en cada hora del reloj.
- **Líneas 139–148:** Suma el dinero total en riesgo (`suspiciousValue`) y toma las 12 anomalías más recientes (`anomalies.slice(0, 12)`) para la línea de tiempo.
- **Líneas 151–172:** Devuelve todo empaquetado, incluyendo `anomaliasNuevas` (las ocurridas en las últimas 24 horas = `86.400.000` milisegundos en la línea 164).

---

### C. `ThresholdService.js` (Líneas 1 a 153)

Administra las reglas por franja horaria manteniendo **sincronizadas la memoria RAM y PostgreSQL** para que el sistema vuele en `O(1)`.

1. **`constructor({ thresholdRepository, logger })` (Líneas 37–46):**
   - **Línea 43:** Clona `DEFAULT_THRESHOLDS` en `this.memoryThresholds` apenas arranca el servidor. Así `TransactionService` siempre tiene reglas listas en RAM desde el milisegundo cero.
   - **Línea 45:** Inicializa `this.initializedFromDb = false`.
2. **`getThresholdsInMemory()` (Líneas 54–56):**
   - Devuelve `this.memoryThresholds` de forma síncrona e instantánea (`O(1)`).
3. **`async list()` (Líneas 65–86 — Hidratación Perezosa con Tolerancia a Fallos):**
   - **Se dispara en:** `GET /fraud/thresholds`.
   - La primera vez que se llama (`!this.initializedFromDb`), consulta `thresholdRepository.findAll()` en PostgreSQL. Si la tabla tiene filas personalizadas guardadas, actualiza `this.memoryThresholds` y marca `this.initializedFromDb = true` para no volver a consultar la BD innecesariamente.
   - **Tolerancia a fallos (`catch` en líneas 77–82):** Si PostgreSQL tuviera un microcorte en ese instante, no tumba la aplicación; registra un `warn` y sigue operando con `this.memoryThresholds` en RAM.
4. **`async update(franja, { umbralTransacciones, ventanaSegundos })` (Líneas 99–150):**
   - **Se dispara en:** `PUT /fraud/thresholds/:franja` (cuando cambias el número en pantalla y pulsas **"Guardar"**).
   - **Líneas 101–108:** Convierte ambos valores con `Number(...)` y exige que sean números positivos (`> 0`); si alguien pone `0` o `-3`, lanza `ValidationError` (HTTP **400**).
   - **Líneas 111–120:** Busca la posición `idx` en `this.memoryThresholds` y ejecuta `thresholdRepository.updateThreshold(franja, parsedUmbral, parsedVentana)` en PostgreSQL.
   - **Líneas 124–126:** Si la franja no existe ni en BD ni en RAM (`!updated && idx === -1`), lanza `NotFoundError` (HTTP **404**).
   - **Líneas 129–140:** **¡Doble actualización instantánea!** Sobrescribe inmediatamente `this.memoryThresholds[idx]` en RAM además de haber guardado en PostgreSQL, para que la siguiente transacción que llegue un milisegundo después ya aplique el nuevo umbral sin tener que reiniciar el servidor.

---

## 3.9 Capa HTTP y Frontend Antifraude

### A. `src/interfaces/http/controllers/FraudController.js` (Líneas 1 a 78)
Es un controlador limpio y delgado (**0 lógica de negocio repetida**; solo recibe `req`, llama al servicio correspondiente y responde JSON en `res`):
- **`constructor` (Líneas 14–19):** Recibe `{ transactionService, fraudReportService, thresholdService }` desde `src/container.js`.
- **Los 8 métodos flecha:**
  1. `receiveTransaction` (L. 22–27): llama `transactionService.receive(req.body)`, guarda `res.locals.transactionResult = 'created'` para los logs HTTP y responde `200`.
  2. `simulateTransaction` (L. 30–34): extrae `{ user, value, paymentMethod }` de `req.body`, llama `transactionService.simulate(...)` y responde `201`.
  3. `listTransactions` (L. 37–40): devuelve `transactionService.listTransactions()`.
  4. `listAnomalies` (L. 43–46): devuelve `transactionService.listAnomalies()`.
  5. `getStats` (L. 49–52): devuelve `fraudReportService.getStats()`.
  6. `getDashboard` (L. 55–58): devuelve `fraudReportService.getDashboard()`.
  7. `listThresholds` (L. 61–64): devuelve `thresholdService.list()`.
  8. `updateThreshold` (L. 67–75): lee `:franja` de `req.params` y `{ umbralTransacciones, ventanaSegundos }` de `req.body`, y llama `thresholdService.update(...)`.

### B. `src/interfaces/http/routes/fraud.routes.js` (Líneas 1 a 61)
Conecta las URLs de Express con `FraudController`, envolviendo cada método en `asyncHandler(...)` (para que cualquier excepción viaje directo a `errorHandler.js`) y validando el sobre HTTP con `requireJsonBody` y `requireTextParam('franja')`:
- **Líneas 26–34 (Los 8 Alias de Ingesta Masiva):**
  Define una sola vez `const receiveHandler = asyncHandler(fraudController.receiveTransaction)` y lo monta en **8 rutas equivalentes**:
  `POST /`, `POST /transactions`, `POST /transaction`, `POST /api/transactions`, `POST /api/transaction`, `POST /fraud/transactions`, `POST /transacciones` y `POST /api/transacciones`.
  - *¿Por qué tiene esos 8 alias?* Para que cualquier script externo de calificación del profesor (ya sea que apunte a `/transactions`, `/api/transactions` o `/transacciones` en español) funcione a la primera sin dar error `404`.
- **Líneas 37–40:** Rutas de lectura `GET /fraud/stats`, `GET /fraud/dashboard`, `GET /fraud/anomalies` y `GET /fraud/transactions`.
- **Líneas 43–47:** Ruta del simulador `POST /fraud/simulate`.
- **Líneas 50–56:** Rutas de configuración horaria `GET /fraud/thresholds` y `PUT /fraud/thresholds/:franja`.

### C. `frontend/src/components/FraudDetection.jsx` (Líneas 1 a 344)
Es el panel visual que aparece cuando eliges **"Detección de fraude"** en el menú lateral (`activeView === 'fraud'` en `App.jsx`).

1. **Los 10 Estados `useState` (Líneas 32–54):**
   - Datos del servidor: `stats`, `anomalies`, `transactions`, `thresholds`, `dashboard`.
   - Edición local de inputs: `editedThresholds` (guarda lo que escribes en las cajitas de umbral/ventana antes de darle a *"Guardar"*).
   - Controles del simulador: `user` (`'test@test.com'`), `value` (`'50000'`), `paymentMethod` (`'Tarjeta'`), `loading` y `lastResult`.
2. **Carga paralela `loadData()` (Líneas 61–78) y `useEffect` (Líneas 81–83):**
   - Al entrar a la vista, dispara **las 5 consultas `GET` en paralelo** con `Promise.all` (`fetchFraudStats`, `fetchAnomalies`, `fetchTransactions`, `fetchThresholds`, `fetchFraudDashboard`).
3. **Acciones de los botones (Líneas 90–134):**
   - **Botón `"Enviar transacción"` -> `handleSend()` (Líneas 90–101):** Llama `sendTestTransaction(user, parseFloat(value), paymentMethod)` (`POST /fraud/simulate`), guarda la respuesta en `lastResult` (para mostrar al instante el Chip verde `NORMAL` o rojo `POSIBLE_FRAUDE` con el conteo de la ventana) y recarga `loadData()`.
   - **Inputs de cada franja -> `getEditedValue` y `updateEditedValue` (Líneas 107–119):** Permiten editar los números de una fila (ej. bajar el umbral de `mañana` de `10` a `4`) sin alterar las demás filas.
   - **Botón `"Guardar"` de una fila -> `handleSaveThreshold(row)` (Líneas 125–134):** Convierte a entero con `parseInt`, dispara `updateThreshold(row.franja, umbral, ventana)` (`PUT /fraud/thresholds/:franja`) y refresca `loadData()`.
4. **Los 6 Bloques Visuales del JSX (Líneas 143–340):**
   - **Bloque 1 (L. 144–225):** Tarjetas de Hoy / Esta semana / Este mes, 4 KPIs grises (`Usuarios afectados`, `Valor sospechoso`, `Promedio por usuario`, `Anomalías nuevas`), tablas por estado/método/nivel, el **histograma rojo de 24 horas** (donde la altura de cada barra se calcula proporcionalmente al máximo: `height: (item.cantidad / max) * 100%` en la línea 204) y la línea de tiempo reciente.
   - **Bloque 2 (L. 228–243):** Los 3 contadores grandes globales (`Transacciones`, `Anomalías` en rojo y `% Anomalías`).
   - **Bloque 3 (L. 246–284):** El formulario del Simulador en vivo con su Chip de resultado inmediato (`danger` rojo si `isAnomaly` es `true`, `success` verde si es `false`).
   - **Bloque 4 (L. 287–313):** Las filas editables de umbrales y ventanas por franja horaria.
   - **Bloque 5 (L. 316–327):** Historial de transacciones invertido (`[...transactions].reverse()`, para ver la última arriba) con Chip `'Anómala'` o `'Exitosa'`.
   - **Bloque 6 (L. 330–339):** Lista exclusiva de anomalías recientes mostrando `cantidad_transacciones en ventana_segundos`.

---

# 🎓 CAPÍTULO 4: SIMULACRO DE 10 PREGUNTAS DE PROFESOR ESPECÍFICAS PARA JULIÁN CARDONA

Estudia estas 10 preguntas con sus respuestas **palabra por palabra**. Están diseñadas exactamente con el estilo de preguntas de código abierto que hace el profesor en la sustentación:

---

### Pregunta 1: Limpieza Unicode y Expresiones Regulares
**👨‍🏫 Profesor:** *"Julián, abre `src/domain/quality/dataCleaner.js` en las líneas 101 a 108 dentro de `toCanonicalKey`. Explícame exactamente qué hacen `.normalize('NFD')` y `.replace(/[\u0300-\u036f]/g, '')` cuando entra la palabra `'Café'`."*

**🗣️ Respuesta palabra por palabra:**  
> *"Profe, en `src/domain/quality/dataCleaner.js`, `toCanonicalKey` convierte cualquier texto sucio en una llave comparable sin tildes ni símbolos. Cuando entra `'Café'`, en la línea 102 `.normalize('NFD')` aplica la Descomposición Canónica Unicode, que separa la letra `'é'` en dos piezas independientes: la letra base `'e'` normal y la marca combinante de la tilde `'\u0301'`. Justo después, en la línea 104, la expresión regular `/[\u0300-\u036f]/g` borra todo el bloque hexadecimal Unicode donde viven las tildes, diéresis y virgulillas de la eñe, dejando intacta la `'e'`. Luego en la línea 106 `.toLowerCase()` pasa todo a minúsculas y en la 108 `/[^a-z0-9\s]/g` reemplaza cualquier signo de puntuación por espacio, devolviendo `'cafe'`. Así `'CAFÉ'`, `'cafe'` y `'¡Café!'` producen exactamente la misma llave canónica."*

---

### Pregunta 2: Precios Regionales y la Heurística del `"8.5"`
**👨‍🏫 Profesor:** *"En ese mismo archivo `dataCleaner.js`, muéstrame `parseAndCleanPrice` (líneas 268 a 305). ¿Cómo diferencia el código entre `'12.500,50'` colombiano y `'12,500.50'` estadounidense, y qué pasa si un cajero escribe `'8.5'`?"*

**🗣️ Respuesta palabra por palabra:**  
> *"En la línea 266 primero limpiamos signos de pesos y letras dejando solo dígitos, puntos y comas. Luego en la línea 268 evaluamos la expresión regular `/^\d{1,3}(\.\d{3})+(,\d+)?$/`: si tiene grupos de punto seguidos de exactamente 3 dígitos y coma opcional al final, detecta formato colombiano `'12.500,50'`, borra los puntos de miles y convierte la coma en punto decimal quedando `'12500.50'`. Si no, en la línea 271 evalúa el patrón inverso `/^\d{1,3}(,\d{3})+(\.\d+)?$/` para formato anglosajón `'12,500.50'` y simplemente elimina las comas de miles. Y si un cajero escribe `'8.5'` abreviando ocho mil quinientos pesos, `parseFloat` da `8.5`, que es menor al `minPrice` de `100` pesos; entonces entra a la línea 300 (`if (parsed < 100 && rawStr.includes('.'))`), detecta que usó punto abreviando miles y lo multiplica por `1000`, corrigiéndolo automáticamente a `8500`."*

---

### Pregunta 3: Deduplicación `O(n)` y Firma de IDs en Usuarios
**👨‍🏫 Profesor:** *"En `detectDuplicateUsers` (`dataCleaner.js`, líneas 485 y 510–517), ¿por qué usan tres `Map` y además un `Set` llamado `seenPairs` con `ids.sort((a, b) => a - b).join('-')`?"*

**🗣️ Respuesta palabra por palabra:**  
> *"Usamos tres `Map` (`byEmail`, `byName` y `byDocument`) para indexar a todos los usuarios en una sola pasada lineal `O(n)` en lugar de comparar todos contra todos en `O(n²)`. El problema es que si una clienta duplicada, digamos con ID `2` e ID `15`, tiene tanto el mismo nombre como el mismo documento, caería repetida en dos mapas distintos y la contaríamos doble. Para evitarlo, en las líneas 513 a 516 de `registerGroup` tomamos los IDs del grupo, los ordenamos numéricamente de menor a mayor y los unimos con guion formando la firma única `'2-15'`. Consultamos en `O(1)` si `seenPairs.has('2-15')`: si ya fue registrada cuando evaluamos email o documento, se ignora en nombre; y si es nueva, la guardamos en el `Set`."*

---

### Pregunta 4: Fórmula del Puntaje y Fusión sin Romper Llaves Foráneas
**👨‍🏫 Profesor:** *"Vamos a `src/application/quality/DataQualityService.js`. ¿Cómo se calcula exactamente `qualityScore` en la línea 127 y por qué `runAutoClean` no lanza error de llave foránea en PostgreSQL cuando borra un cliente duplicado en la línea 339?"*

**🗣️ Respuesta palabra por palabra:**  
> *"En la línea 127 de `DataQualityService.js`, la fórmula es `Math.max(0, 100 - (totalIssues / Math.max(1, totalRecords)) * 100)` redondeada a 2 decimales, donde `totalRecords` suma las filas de las 5 tablas (`usuarios`, `categorias`, `items`, `facturas` y `pagos`) y `totalIssues` suma las 8 categorías de defectos; usamos `Math.max(0, ...)` para que nunca baje de 0% si una fila acumula varios defectos. Y cuando `runAutoClean` encuentra un cliente duplicado en las líneas 322 a 339, antes de llamar `userRepository.delete(user.id)`, ejecuta cuatro sentencias `UPDATE` parametrizadas reasignando `usuario_id = primaryUser.id` en las tablas `orders`, `facturas`, `pagos` y `transacciones`. Así migra todo su historial financiero al cliente maestro y el `DELETE` final nunca viola restricciones de llave foránea."*

---

### Pregunta 5: Por qué `formatAmount` usa `.toFixed(2)` en la Cadena de Hashes
**👨‍🏫 Profesor:** *"Abre `src/domain/integrity/hashChain.js` en la línea 45. ¿Para qué sirve `formatAmount` con `.toFixed(2)`? ¿Qué pasaría si metiéramos `invoice.total` directo al JSON canónico?"*

**🗣️ Respuesta palabra por palabra:**  
> *"Se rompería toda la verificación de la cadena al leer de PostgreSQL, profe. Cuando `OperationalService.generateInvoice` crea una factura en memoria, `total` es un `number` de JavaScript, por ejemplo `50000`. Pero en PostgreSQL la columna es `NUMERIC(12, 2)`, y cuando `BillingRepository` la lee con `SELECT`, el driver `pg` devuelve el string `'50000.00'`. En SHA-256 un cambio de `50000` a `'50000.00'` altera por completo los 64 caracteres del hash por efecto avalancha. `formatAmount` en las líneas 45 a 48 fuerza siempre dos decimales exactos `'50000.00'` tanto al emitir como al auditar, garantizando determinismo absoluto bit a bit."*

---

### Pregunta 6: Validaciones Anti-Fraude de Comprobantes y Anti-Replay
**👨‍🏫 Profesor:** *"En `hashChain.js`, función `validatePaymentReceipt` (líneas 135 a 217), ¿cómo evita el sistema que un cliente pague dos pedidos distintos subiendo el mismo comprobante de transferencia?"*

**🗣️ Respuesta palabra por palabra:**  
> *"Eso es un ataque de repetición o Replay Attack, y lo frenamos en la línea 158 de `validatePaymentReceipt`. Antes de procesar un pago en `OperationalService.processPayment` (línea 920), consultamos todas las referencias históricas en un conjunto `Set` llamado `existingReceiptRefs`. En la línea 158 evaluamos `existingReceiptRefs.has(ref)` en tiempo constante `O(1)`. Si esa referencia ya fue usada en cualquier pago anterior, agrega la alerta de comprobante reutilizado, `isValid` da `false` y en `OperationalService` (líneas 958 a 980) el pago queda registrado con estado `'Sospechoso'` para evidencia forense, pero NO marca la factura como `'Pagada'` ni entrega el pedido. Además, en `verifyPaymentChain` (líneas 366 y 388) vamos poblando otro `Set` incremental `seenRefs` para detectar cualquier recibo repetido al auditar toda la cadena."*

---

### Pregunta 7: *Timing Attack* y `crypto.timingSafeEqual`
**👨‍🏫 Profesor:** *"Muéstrame `safeCompareHashes` en `src/domain/fraud/hashUtils.js` (líneas 104 a 127). ¿Por qué convierten los hashes a `Buffer` de 32 bytes y llaman `crypto.timingSafeEqual` en lugar de usar `hashA === hashB`?"*

**🗣️ Respuesta palabra por palabra:**  
> *"Para impedir un Timing Attack o ataque de canal lateral por tiempo. El operador `===` de JavaScript hace cortocircuito: compara carácter por carácter de izquierda a derecha y retorna `false` en el primer carácter diferente, tardando unos nanosegundos más cuando los primeros bytes sí coinciden. Con millones de intentos, un atacante podría deducir nuestra firma HMAC byte por byte midiendo el tiempo de respuesta. En cambio, en las líneas 115 a 122 decodificamos las dos cadenas hexadecimales de 64 caracteres a dos `Buffer` binarios de exactamente 32 bytes y llamamos `crypto.timingSafeEqual(bufA, bufB)`, que ejecuta operaciones XOR sobre los 32 bytes completos sin detenerse antes, tardando exactamente el mismo tiempo falle en el primer bit o en el último."*

---

### Pregunta 8: El Cruce de Medianoche en `getThresholdByTime.js`
**👨‍🏫 Profesor:** *"En `src/domain/fraud/getThresholdByTime.js`, línea 102 (`isWithinRange`), ¿por qué una línea tiene `&&` y la de abajo tiene `||`?"*

**🗣️ Respuesta palabra por palabra:**  
> *"Porque convertimos las horas a segundos del día entre `0` y `86399` con `timeToSeconds`. En las franjas diurnas como `'mañana'` (`05:00:01` a `12:00:00`), `startSeconds` (`18001`) es menor que `endSeconds` (`43200`), así que es un intervalo continuo dentro del mismo día y en la línea 105 usamos `&&` (debe ser mayor o igual al inicio Y menor o igual al fin). Pero la franja `'noche-madrugada'` va de `20:00:01` (`72001` segundos) hasta `05:00:00` de la mañana siguiente (`18000` segundos), cruzando la medianoche, por lo que `startSeconds > endSeconds`. Ningún número puede ser mayor a `72001` y menor a `18000` a la vez; por eso en la línea 108 usamos `||`: está dentro de la franja si es `>= 72001` (entre 8 p.m. y medianoche) O `<= 18000` (entre medianoche y 5 a.m.)."*

---

### Pregunta 9: Funcionamiento Interno de `SlidingWindow.js`
**👨‍🏫 Profesor:** *"Explícame cómo funciona `addTransaction` en `src/domain/fraud/SlidingWindow.js` (líneas 45 a 90). ¿Qué complejidad tiene y cómo borra las transacciones viejas?"*

**🗣️ Respuesta palabra por palabra:**  
> *"`SlidingWindow` guarda en memoria un `Map` llamado `windowsByUser` donde cada correo tiene su propio arreglo ordenado ascendentemente de timestamps en milisegundos. Cuando entra una transacción, buscar al usuario en el `Map` es `O(1)`. En la línea 60, si llega en orden cronológico (`timestampMs >= último`), hace `push` al final en `O(1)`; y si en una ráfaga paralela llegó un evento levemente desordenado, las líneas 64 a 70 retroceden con un `while` e insertan en su posición exacta con `splice` manteniendo el orden. Luego en la línea 76 calcula el borde inferior vivo `windowStartMs = latestTimestampMs - windowSeconds * 1000`. En las líneas 79 a 86 cuenta cuántos timestamps al inicio del arreglo son menores a `windowStartMs` (`expiredCount`) y los desaloja todos de un solo golpe con `userWindow.splice(0, expiredCount)`, retornando `userWindow.length`. Como la ventana es de pocos segundos, `w` es muy pequeño y opera en `O(1)` práctico."*

---

### Pregunta 10: Qué ocurre paso a paso cuando llega un Hash Alterado a `TransactionService.receive`
**👨‍🏫 Profesor:** *"Última pregunta, Julián: si un atacante intercepta una petición hacia `POST /api/transactions` y cambia el campo `value` de `10000` a `1000` dejando el `hash` original, dime qué archivos se ejecutan y qué queda guardado en PostgreSQL."*

**🗣️ Respuesta palabra por palabra:**  
> *"Primero entra por `fraud.routes.js` (línea 30) hacia `FraudController.receiveTransaction` (línea 22), que invoca `TransactionService.receive(req.body)` en `src/application/fraud/TransactionService.js`. Allí pasa `normalizeInput` y pasa `validateTransaction` (porque los tipos siguen siendo válidos) y verifica en `TransactionRepository.findByExternalId` que el `idTxn` no esté repetido. Luego en la línea 239 llama a `detectAnomaly`, el cual en su línea 48 llama a `validateTransactionHash` antes de tocar `SlidingWindow` (así no contamina el conteo en memoria del usuario real). Como `value` cambió, ni el HMAC canónico ni el fallback coinciden en `safeCompareHashes`, devolviendo `isHashValid: false`. Al recibir `false` en `TransactionService.receive` (líneas 249 a 283), NO descartamos el intento en silencio: llamamos `#persistTransactionAndAnomaly` guardando en PostgreSQL la fila en `transacciones` con `estado: 'Hash inválido'` y creando una alerta forense en `anomalias` con `tipo: 'HASH_INVALIDO'` y `nivel: 'Crítico'`, y finalmente lanzamos `ValidationError` con código `'INVALID_HASH'` que responde HTTP 400."*

---

> ✅ **Consejo final para el día de la sustentación, Julián:**  
> Cuando abras la aplicación frente al profesor, sigue este orden ganador de 90 segundos en la pestaña **"Calidad e Integridad"**:
> 1. Señala el puntaje inicial y haz clic en **"Inyectar Datos Sucios de Prueba"** (explica cómo cayó el `qualityScore` por la categoría sinónima, el Cappuccino en \$0, el Latte de \$980.000 y Laura Gómez duplicada por cédula).
> 2. Haz clic en **"Ejecutar Limpieza y Normalización Automática"** y lee el cuadro verde mostrando cómo fusionó registros actualizando llaves foráneas y sumando el stock sin perder datos.
> 3. Baja a Integridad, haz clic en **"Simular Factura Alterada"** y **"Simular Comprobante Falso"**, señala el eslabón rojo donde se ve el `hash_actual` vs el `esperado`, y cierra oprimiendo **"Restaurar y Recalcular Cadena"** volviendo todo al 100% verde, antes de pasar a **"Detección de fraude"** y oprimir 3 veces seguidas **"Enviar transacción"** para disparar `POSIBLE_FRAUDE` en la ventana deslizante. ¡Éxitos totales!
