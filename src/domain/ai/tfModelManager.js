/**
 * @file tfModelManager.js
 * @description Motor de Redes Neuronales Artificiales (Keras Layers API sobre `@tensorflow/tfjs` puro en JS)
 * para clasificación supervisada de fraude operativo y regresión multivariable de demanda/ingresos,
 * con escalamiento Min-Max tensorial, Data Augmentation determinista y persistencia en disco.
 *
 * - **Capa arquitectónica:** Dominio IA (`src/domain/ai`). Encapsula toda la construcción de grafos
 *   neuronales, extracción de características (feature engineering), normalización tensorial,
 *   aumento sintético de datos y serialización de artefactos Keras (`model.json` + `weights.bin`).
 * - **Inyección de Dependencias (`container.js`):** Instanciado dentro de `AiService`
 *   (`src/application/ai/AiService.js`), el cual se construye en `buildContainer()` (`src/container.js`)
 *   inyectándole `logger` (`childLogger('AiService')`) y pudiendo recibir un `tfModelManager` personalizado
 *   en pruebas unitarias (por ejemplo con un `modelsDir` temporal en `os.tmpdir()`).
 * - **Controladores HTTP y Servicios que disparan sus métodos:**
 *   1. `ensureReady` / `getStatus`: Disparados por `OperationalController.getAiStatus` (`GET /ai/status`)
 *      y `OperationalController.getExecutiveSummary` (`GET /operational/summary`) vía `AiService.getModelsStatus()`.
 *   2. `trainAndSaveModels`: Disparado por `OperationalController.trainAiModels` (`POST /ai/train`)
 *      vía `AiService.trainModels()`, o automáticamente en el primer arranque si no existen pesos en disco.
 *   3. `classifyOperation`: Disparado por `OperationalController.classifyOperation` (`POST /ai/classify`),
 *      `OperationalController.classifyRecentOperations` (`GET /ai/classify-recent`) vía `AiService`, y además
 *      en tiempo real por `OperationalService.generateInvoice` (`POST /operational/invoices`) y
 *      `OperationalService.processPayment` (`POST /operational/payments`).
 *   4. `predictExpectedDemandAndAmount`: Disparado por `OperationalController.predictDemand`
 *      (`POST /ai/predict-demand`) vía `AiService.predictDemandAndAmount()`.
 * - **Delegación a Dominio / Repositorios:** No consulta repositorios SQL; recibe arreglos de operaciones
 *   desde `AiService` y persiste únicamente los artefactos matemáticos del modelo en el sistema de archivos
 *   mediante `fs/promises` y su `IOHandler` personalizado.
 */

// API de promesas del sistema de archivos de Node.js para leer y escribir `model.json`, `weights.bin`, `scaler.json` y `metadata.json`
const fs = require('fs/promises');
// Utilidad nativa para resolver rutas multiplataforma de directorios de modelos guardados
const path = require('path');
// Motor puro JavaScript de TensorFlow.js (compatible con cualquier SO/CPU sin compilar binarios C++ nativos)
const tf = require('@tensorflow/tfjs');

// Ruta predeterminada donde se persisten en disco las carpetas `fraud_classifier` y `demand_regressor`
const DEFAULT_MODELS_DIR = path.join(
  __dirname,
  '../../infrastructure/ai/saved_models'
);

// Codificación numérica ordinal de riesgo inherente por medio de pago en el rango (0, 1) para alimentar la capa densa de entrada
const PAYMENT_METHOD_CODES = {
  efectivo: 0.1, // Riesgo electrónico mínimo (presencial inmediato)
  tarjeta: 0.4, // Riesgo moderado (contracargos / clonación)
  transferencia: 0.6, // Riesgo medio-alto (sujeto a validación de comprobante externo)
  nequi: 0.5, // Billetera digital con verificación de referencia
  daviplata: 0.5, // Billetera digital equivalente
  pse: 0.7, // Débito interbancario en línea de tickets más altos
  cripto: 0.95, // Mayor irreversibilidad y anonimato relativo
};

// Codificación numérica del canal comercial según exposición a operaciones no presenciales
const CHANNEL_CODES = {
  presencial: 0.2, // Mostrador físico con supervisión directa de cajero
  web: 0.6, // Portal web abierto a tráfico automatizado
  app: 0.5, // Aplicación móvil autenticada
  domicilio: 0.8, // Entrega externa con mayor riesgo de contracargo o pedido fallido
};

/**
 * Crea un `IOHandler` personalizado compatible con la interfaz `tf.io.IOHandler` de TensorFlow.js
 * para serializar (`save`) y deserializar (`load`) modelos Keras (`model.json` + `weights.bin`)
 * directamente con `fs/promises` en Node.js, evitando depender del paquete nativo `@tensorflow/tfjs-node`.
 *
 * Formato en disco generado:
 * - `model.json`: contiene `modelTopology` (arquitectura de capas Keras), metadatos de versión y
 *   `weightsManifest` (especificación de nombres, formas `shape` y tipos `dtype` de cada tensor de pesos).
 * - `weights.bin`: archivo binario contiguo con todos los flotantes `Float32` concatenados de los pesos y sesgos (`biases`).
 *
 * @param {string} modelDir Ruta absoluta del directorio del modelo en disco.
 * @returns {{ save: Function, load: Function }} Objeto manejador de E/S para `model.save()` y `tf.loadLayersModel()`.
 */
function createFileSystemIOHandler(modelDir) {
  return {
    // Método invocado internamente por `await model.save(handler)` recibiendo los artefactos en memoria del grafo Keras
    async save(modelArtifacts) {
      // Garantiza que la carpeta destino exista (creando subdirectorios padres si hace falta)
      await fs.mkdir(modelDir, { recursive: true });
      // Nombre estándar del archivo binario que almacenará los tensores de pesos entrenados
      const weightsFileName = 'weights.bin';
      // Estructura estándar Keras/TF.js que enlaza la topología de capas con el manifiesto binario de pesos
      const modelJson = {
        modelTopology: modelArtifacts.modelTopology, // Configuración JSON de capas (Dense, Dropout, activaciones, shapes)
        format: modelArtifacts.format, // Identificador de formato ('layers-model')
        generatedBy: modelArtifacts.generatedBy, // Versión de TensorFlow.js generadora
        convertedBy: modelArtifacts.convertedBy || null, // Nulo porque se entrena nativamente en JS
        weightsManifest: [
          {
            paths: [weightsFileName], // Ruta relativa al archivo binario de pesos dentro de `modelDir`
            weights: modelArtifacts.weightSpecs, // Lista ordenada de especificaciones `{ name, shape, dtype }` de cada peso
          },
        ],
      };

      // Escribe `model.json` legible con sangría de 2 espacios en codificación UTF-8
      await fs.writeFile(
        path.join(modelDir, 'model.json'),
        JSON.stringify(modelJson, null, 2),
        'utf8'
      );

      // Si el modelo posee pesos numéricos (`ArrayBuffer`), los envuelve en un `Buffer` de Node.js y los vuelca en `weights.bin`
      if (modelArtifacts.weightData) {
        const buffer = Buffer.from(modelArtifacts.weightData);
        await fs.writeFile(path.join(modelDir, weightsFileName), buffer);
      }

      // Devuelve el recibo `SaveResult` exigido por el contrato interno de TensorFlow.js
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

    // Método invocado internamente por `await tf.loadLayersModel(handler)` para reconstruir la red neuronal desde disco
    async load() {
      // Construye la ruta completa al descriptor `model.json`
      const modelJsonPath = path.join(modelDir, 'model.json');
      // Lee el texto JSON desde el sistema de archivos; si no existe, lanza excepción capturada por `loadModelsFromDisk()`
      const rawJson = await fs.readFile(modelJsonPath, 'utf8');
      // Parsea la topología y el manifiesto de pesos
      const modelJson = JSON.parse(rawJson);

      // Extrae los grupos del manifiesto de pesos (normalmente un grupo apuntando a `weights.bin`)
      const weightsManifest = modelJson.weightsManifest || [];
      // Acumuladores para las especificaciones de tensores y los bloques binarios leídos
      const weightSpecs = [];
      const weightBuffers = [];

      // Recorre cada grupo del manifiesto recolectando metadatos de tensores y leyendo sus archivos `.bin`
      for (const group of weightsManifest) {
        if (Array.isArray(group.weights)) {
          weightSpecs.push(...group.weights);
        }
        for (const relPath of group.paths || []) {
          const buf = await fs.readFile(path.join(modelDir, relPath));
          weightBuffers.push(buf);
        }
      }

      // Une todos los fragmentos binarios en un único `Buffer` contiguo de Node.js
      const combined = Buffer.concat(weightBuffers);
      // Extrae exactamente la porción subyacente como `ArrayBuffer` puro (respetando `byteOffset` del pool interno de Node.js)
      const weightData = combined.buffer.slice(
        combined.byteOffset,
        combined.byteOffset + combined.byteLength
      );

      // Retorna el objeto `ModelArtifacts` con el que TensorFlow.js reinstancia las capas e inyecta los pesos
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

/**
 * Transforma cualquier operación heterogénea (transacción, factura, pago o payload directo) en un vector
 * numérico fijo de 8 características (`shape = [8]`) apto para la capa de entrada del clasificador Keras:
 *
 * Índice -> Característica:
 * - `[0]` `monto`: Valor monetario en COP ($\ge 0$).
 * - `[1]` `horaDia`: Hora entera del día en $[0, 23]$ (detecta patrones nocturnos/madrugada).
 * - `[2]` `metodoPagoCod`: Riesgo basal codificado del medio de pago segùn `PAYMENT_METHOD_CODES`.
 * - `[3]` `firmaInvalidaFlag`: Bandera binaria (`0` = íntegra/válida, `1` = hash o comprobante inválido/alterado).
 * - `[4]` `frecuenciaVentana`: Cantidad de operaciones recientes en ventana corta ($\ge 1$).
 * - `[5]` `porcentajeDescuento`: Porcentaje de descuento comercial aplicado ($\ge 0$).
 * - `[6]` `tasaAnulacionUsuario`: Tasa histórica porcentual de anulaciones del usuario ($\ge 0$).
 * - `[7]` `canalCod`: Exposición codificada del canal operativo según `CHANNEL_CODES`.
 *
 * @param {Object} [operation={}] Objeto de operación en formato camelCase o snake_case.
 * @returns {number[]} Vector numérico de longitud exacta 8.
 */
function extractOperationFeatures(operation = {}) {
  // Feature [0]: Resuelve el monto admitiendo alias de pagos (`monto`), transacciones (`valor`/`value`) o facturas (`total`)
  const rawAmount = Number(
    operation.monto ?? operation.valor ?? operation.value ?? operation.total ?? 15000
  );
  // Feature [1]: Resuelve la marca de tiempo desde cualquiera de los campos de fecha utilizados en BD o API
  const rawDate =
    operation.fecha ??
    operation.date ??
    operation.fecha_txn ??
    operation.created_at ??
    new Date();
  // Convierte a instancia `Date` si venía como string ISO
  const parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
  // Obtiene la hora [0..23]; si la fecha no es parseable, recurre al campo explícito `hora` o mediodía (12)
  const hour = Number.isFinite(parsedDate.getHours())
    ? parsedDate.getHours()
    : Number(operation.hora ?? 12);

  // Feature [2]: Normaliza el texto del método de pago y busca su codificación numérica en `PAYMENT_METHOD_CODES`
  const methodKey = String(
    operation.metodoPago ?? operation.metodo_pago ?? operation.paymentMethod ?? 'tarjeta'
  )
    .toLowerCase()
    .trim();
  const methodCode = PAYMENT_METHOD_CODES[methodKey] ?? 0.5;

  // Feature [3]: Determina validez criptográfica/documental revisando alias booleanos o estados de corrupción en BD
  const signatureValid =
    operation.firmaValida !== undefined
      ? Boolean(operation.firmaValida)
      : operation.isHashValid !== undefined
        ? Boolean(operation.isHashValid)
        : operation.comprobante_valido !== undefined
          ? Boolean(operation.comprobante_valido)
          : operation.estado !== 'Hash inválido' && operation.estado !== 'Alterada';
  // Invierte el booleano a bandera de riesgo: `0` cuando la firma es legítima y `1` cuando hay alteración/falsedad
  const invalidSignatureFlag = signatureValid ? 0 : 1;

  // Feature [4]: Frecuencia de operaciones en ventana deslizante (por defecto 1 operación aislada)
  const frequency = Number(
    operation.frecuencia ??
      operation.transactionCount ??
      operation.cantidad_transacciones ??
      1
  );

  // Feature [5]: Porcentaje de descuento comercial asociado a la operación (0% si no aplica)
  const discountPct = Number(
    operation.porcentajeDescuento ??
      operation.porcentaje_descuento ??
      operation.descuentoPct ??
      0
  );

  // Feature [6]: Tasa histórica de cancelaciones/anulaciones del usuario en porcentaje [0..100]
  const userCancelRate = Number(
    operation.tasaAnulacionUsuario ?? operation.cancellationRatePct ?? 0
  );

  // Feature [7]: Codifica el canal de origen (`presencial`, `web`, `app`, `domicilio`) a valor flotante
  const channelKey = String(operation.canal ?? 'presencial')
    .toLowerCase()
    .trim();
  const channelCode = CHANNEL_CODES[channelKey] ?? 0.3;

  // Retorna el vector de 8 características acotando cada dimensión a su dominio físico válido
  return [
    Math.max(0, rawAmount),
    Math.min(23, Math.max(0, hour)),
    methodCode,
    invalidSignatureFlag,
    Math.max(1, frequency),
    Math.max(0, discountPct),
    Math.max(0, userCancelRate),
    channelCode,
  ];
}

/**
 * Calcula los vectores `min` y `max` por columna (eje `0`) de una matriz $[N, 8]$ usando tensores 2D.
 *
 * **Prevención de fugas de memoria con `tf.tidy()`:**
 * En TensorFlow.js los tensores alocados en el backend matemático NO son liberados por el Garbage Collector
 * de JavaScript (V8). `tf.tidy(() => ...)` rastrea todos los tensores intermedios creados síncronamente
 * dentro del callback (`tensor`, `minTensor`, `maxTensor`) y ejecuta `.dispose()` automáticamente sobre ellos
 * al salir de la función, evitando fugas de memoria RAM/VRAM tras múltiples entrenamientos.
 *
 * @param {number[][]} featureMatrix Matriz numérica cruda de tamaño $[N, D]$.
 * @returns {{ min: number[], max: number[] }} Parámetros del escalador Min-Max serializables en JSON.
 */
function computeNormalizationScaler(featureMatrix) {
  return tf.tidy(() => {
    // Convierte el arreglo bidimensional JS en un `tf.Tensor2D` de forma [N, 8]
    const tensor = tf.tensor2d(featureMatrix);
    // Reduce a lo largo del eje 0 (filas) para obtener el mínimo de cada una de las 8 columnas
    const minTensor = tensor.min(0);
    // Reduce a lo largo del eje 0 (filas) para obtener el máximo de cada una de las 8 columnas
    const maxTensor = tensor.max(0);
    // Copia los valores escalares a arreglos nativos de JS antes de que `tf.tidy` destruya los tensores
    const min = Array.from(minTensor.dataSync());
    const max = Array.from(maxTensor.dataSync());
    return { min, max };
  });
}

/**
 * Aplica escalamiento Min-Max columna por columna: $x_{\text{norm}} = \frac{x - x_{\min}}{x_{\max} - x_{\min}}$,
 * proyectando magnitudes dispares (p. ej. montos en cientos de miles vs horas 0..23) al rango estable $\approx [0, 1]$
 * para evitar saturación de gradientes durante el entrenamiento con `adam`.
 *
 * @param {number[][]} featureMatrix Matriz de vectores de características $[N, 8]$.
 * @param {{ min: number[], max: number[] }} scaler Parámetros Min-Max calculados en entrenamiento.
 * @returns {number[][]} Matriz normalizada acotada suavemente en $[-0.2, 1.5]$ para tolerar valores fuera de muestra.
 */
function normalizeFeaturesWithScaler(featureMatrix, scaler) {
  return featureMatrix.map((row) =>
    row.map((val, idx) => {
      // Obtiene el mínimo y máximo aprendidos para la columna `idx`
      const min = scaler.min[idx] ?? 0;
      const max = scaler.max[idx] ?? 1;
      // Calcula el rango dinámico de la característica
      const range = max - min;
      // Evita división por cero si una columna fue constante en todo el conjunto de entrenamiento
      if (range <= 1e-9) return 0;
      // Escala linealmente y aplica clipping suave [-0.2, 1.5] para impedir que outliers extremos desestabilicen las capas ocultas
      return Math.min(1.5, Math.max(-0.2, (val - min) / range));
    })
  );
}

/**
 * Aumento de Datos (`Data Augmentation`) determinista para datos tabulares de fraude:
 * Genera `augmentationFactor` variaciones sintéticas por cada muestra original aplicando micro-perturbaciones
 * controladas (`jitter` de $\pm 4\% \cdot k$) sobre monto, hora, frecuencia y descuento sin alterar la semántica
 * de su etiqueta (`0` = Normal, `1` = Fraudulenta). Esto multiplica el tamaño del dataset por $(1 + \text{augmentationFactor})$,
 * mejora la generalización de las capas densas y reduce el sobreajuste (overfitting).
 *
 * @param {Array<{features: number[], label: number}>} [samples=[]] Muestras base etiquetadas.
 * @param {number} [augmentationFactor=2] Cantidad de clones perturbados a sintetizar por cada muestra original.
 * @returns {Array<{features: number[], label: number, isAugmented: boolean}>} Dataset expandido.
 */
function augmentFraudDataset(samples = [], augmentationFactor = 2) {
  // Conserva intactas todas las muestras originales al inicio del dataset aumentado
  const augmented = [...samples];

  // Recorre cada muestra base para sintetizar `augmentationFactor` variantes vecinas en el espacio de características
  for (let i = 0; i < samples.length; i++) {
    const base = samples[i];
    for (let k = 1; k <= augmentationFactor; k++) {
      // Alterna determinísticamente el signo (+1 / -1) para lograr reproducibilidad exacta en tests sin depender de `Math.random`
      const sign = (i + k) % 2 === 0 ? 1 : -1;
      // Magnitud de perturbación relativa proporcional a `k` (±4%, ±8%, ...)
      const jitter = 0.04 * k * sign;
      // Desestructura las 8 características de la muestra original
      const [
        amount,
        hour,
        methodCode,
        invalidSig,
        freq,
        discountPct,
        cancelRate,
        channelCode,
      ] = base.features;

      // Perturba ligeramente el monto manteniendo un piso realista de $1.000 COP
      const newAmount = Math.max(1000, Math.round(amount * (1 + jitter)));
      // Desplaza suavemente en +1 hora la mitad de las réplicas respetando aritmética modular de 24 horas
      const newHour = Math.min(23, Math.max(0, (hour + (k % 2 === 0 ? 1 : 0)) % 24));
      // En muestras de fraude (`label === 1`) permite variar ligeramente la frecuencia de ráfaga
      const newFreq = Math.max(
        1,
        base.label === 1 ? freq + (k % 2) : Math.max(1, freq)
      );
      // Perturba suavemente el porcentaje de descuento acotado en [0%, 80%]
      const newDiscount = Math.max(
        0,
        Math.min(80, Number((discountPct * (1 + jitter * 0.5)).toFixed(2)))
      );

      // Inserta la muestra sintética conservando inalterados la bandera de firma, método, canal y etiqueta de clase
      augmented.push({
        features: [
          newAmount,
          newHour,
          methodCode,
          invalidSig,
          newFreq,
          newDiscount,
          cancelRate,
          channelCode,
        ],
        label: base.label,
        isAugmented: true,
      });
    }
  }

  return augmented;
}

/**
 * Construye el conjunto de entrenamiento base combinando:
 * 1. Las operaciones reales almacenadas en PostgreSQL (facturas, pagos, transacciones).
 * 2. Una semilla balanceada de 24 arquetipos (12 normales y 12 de fraude operativo) que garantiza que la red
 *    neuronal conozca todas las tipologías de fraude aun cuando la base de datos esté recién inicializada.
 *
 * @param {Array<Object>} [realOperations=[]] Registros históricos reales del sistema.
 * @returns {Array<{features: number[], label: number, isAugmented: boolean}>} Dataset base etiquetado.
 */
function buildBaseFraudSamples(realOperations = []) {
  const samples = [];

  // 1. Etiqueta y vectoriza cada operación real proveniente de la base de datos
  for (const op of realOperations) {
    // Extrae el vector numérico de 8 características
    const features = extractOperationFeatures(op);
    // Asigna etiqueta supervisada `1` (fraude) si exhibe anomalía confirmada, corrupción criptográfica o violación severa de reglas
    const isFraud =
      op.es_anomalia === true ||
      op.estado === 'Hash inválido' ||
      op.estado === 'Alterada' ||
      op.comprobante_valido === false ||
      features[3] === 1 || // Firma HMAC o comprobante inválido
      features[4] >= 5 || // Frecuencia excesiva en ventana corta
      features[5] > 30 || // Descuento abusivo superior al 30%
      (features[0] > 180000 && (features[1] <= 5 || features[6] >= 25)); // Monto alto en madrugada o con alta anulación

    samples.push({
      features,
      label: isFraud ? 1 : 0,
      isAugmented: false,
    });
  }

  // 2. Arquetipos canónicos de operación legítima (horarios diurnos/vespertinos, firmas válidas, descuentos moderados <= 15%)
  const normalArchetypes = [
    [12500, 8, 0.1, 0, 1, 0, 0, 0.2],
    [18000, 10, 0.4, 0, 1, 5, 0, 0.2],
    [24500, 13, 0.5, 0, 2, 10, 2, 0.5],
    [15000, 15, 0.4, 0, 1, 0, 0, 0.6],
    [32000, 17, 0.6, 0, 2, 10, 5, 0.8],
    [9500, 9, 0.1, 0, 1, 0, 0, 0.2],
    [42000, 19, 0.4, 0, 2, 15, 4, 0.8],
    [21000, 11, 0.7, 0, 1, 5, 0, 0.6],
    [27000, 14, 0.4, 0, 2, 0, 3, 0.5],
    [16500, 16, 0.1, 0, 1, 10, 0, 0.2],
    [38000, 12, 0.6, 0, 3, 12, 5, 0.6],
    [14000, 18, 0.5, 0, 1, 0, 0, 0.5],
  ];

  // Arquetipos canónicos de fraude operativo cubriendo las 4 familias de riesgo del dominio Appresso
  const fraudArchetypes = [
    // Familia A: Firma HMAC alterada o comprobante falso (`invalidSignatureFlag = 1`)
    [45000, 14, 0.6, 1, 1, 0, 5, 0.6],
    [120000, 3, 0.4, 1, 2, 10, 10, 0.8],
    [28000, 11, 0.7, 1, 1, 0, 0, 0.5],
    // Familia B: Ráfaga automatizada de alta frecuencia en ventana deslizante (`frecuencia >= 7`)
    [35000, 2, 0.4, 0, 7, 0, 10, 0.6],
    [65000, 3, 0.4, 0, 9, 15, 15, 0.5],
    [52000, 15, 0.6, 0, 8, 5, 12, 0.6],
    // Familia C: Descuentos abusados (> 30%) combinados con alta tasa de anulaciones
    [85000, 16, 0.1, 0, 2, 48, 35, 0.2],
    [110000, 20, 0.4, 0, 3, 55, 40, 0.2],
    [72000, 13, 0.5, 0, 2, 42, 30, 0.8],
    // Familia D: Montos atípicos elevados durante la madrugada + historial alto de reversiones
    [290000, 2, 0.7, 0, 5, 25, 35, 0.6],
    [340000, 4, 0.4, 0, 6, 35, 45, 0.8],
    [250000, 1, 0.95, 1, 4, 40, 50, 0.6],
  ];

  // Incorpora los 12 arquetipos normales con etiqueta `0`
  for (const feat of normalArchetypes) {
    samples.push({ features: feat, label: 0, isAugmented: false });
  }
  // Incorpora los 12 arquetipos fraudulentos con etiqueta `1`
  for (const feat of fraudArchetypes) {
    samples.push({ features: feat, label: 1, isAugmented: false });
  }

  return samples;
}

/**
 * Construye y compila la Red Neuronal Clasificadora de Fraude usando la API secuencial Keras (`tf.sequential`).
 *
 * Arquitectura capa por capa:
 * 1. `Dense(16, activation='relu', inputShape=[8])`: Capa oculta totalmente conectada que recibe las 8 features,
 *    inicializa pesos con Xavier/Glorot (`glorotUniform`) para mantener varianza estable de activaciones, y aplica
 *    no-linealidad $\text{ReLU}(z) = \max(0, z)$ para capturar interacciones no lineales entre variables.
 * 2. `Dropout(rate=0.1)`: Regularizador estocástico que apaga al azar el 10% de las neuronas en cada paso de
 *    entrenamiento (y se desactiva automáticamente en `.predict()`), evitando co-adaptación y sobreajuste.
 * 3. `Dense(8, activation='relu')`: Segunda capa oculta de abstracción intermedia con activación ReLU.
 * 4. `Dense(1, activation='sigmoid')`: Neurona de salida con función logística $\sigma(z) = \frac{1}{1 + e^{-z}} \in (0, 1)$,
 *    interpretada directamente como probabilidad estimada de fraude $P(y = 1 \mid x)$.
 *
 * Compilación:
 * - Optimizador `tf.train.adam(0.025)`: Descenso de gradiente adaptativo con primer y segundo momento (tasa 0.025).
 * - Pérdida `binaryCrossentropy`: Entropía cruzada binaria $-\frac{1}{N}\sum [y\ln(\hat{y}) + (1-y)\ln(1-\hat{y})]$.
 *
 * @returns {tf.Sequential} Modelo Keras compilado listo para entrenar con `.fit()`.
 */
function buildKerasFraudClassifierModel() {
  // Instancia una pila lineal secuencial de capas Keras
  const model = tf.sequential();
  // Primera capa densa: proyecta las 8 entradas en 16 neuronas con ReLU e inicialización Glorot uniforme
  model.add(
    tf.layers.dense({
      units: 16,
      activation: 'relu',
      inputShape: [8],
      kernelInitializer: 'glorotUniform',
    })
  );
  // Capa Dropout al 10% para regularizar el entrenamiento sobre datasets compactos/aumentados
  model.add(tf.layers.dropout({ rate: 0.1 }));
  // Segunda capa densa: comprime la representación latente a 8 neuronas con activación ReLU
  model.add(
    tf.layers.dense({
      units: 8,
      activation: 'relu',
    })
  );
  // Capa de salida binaria: 1 neurona con activación Sigmoid que entrega probabilidad continua en (0, 1)
  model.add(
    tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
    })
  );

  // Compila el grafo definiendo optimizador Adam, función de costo de entropía cruzada binaria y métrica de exactitud
  model.compile({
    optimizer: tf.train.adam(0.025),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  return model;
}

/**
 * Construye y compila la Red Neuronal Regresora Multisalida para Predicción de Demanda y Monto Esperado (`tf.sequential`).
 *
 * - **Entrada (`inputShape: [5]`):** `[diaSemanaNorm, horaNorm, canalCod, descuentoNorm, promedioHistoricoNorm]`.
 * - **Capas ocultas:** `Dense(12, 'relu')` -> `Dense(8, 'relu')` para modelar curvas horarias pico y efecto fin de semana.
 * - **Salida (`units: 2, activation: 'linear'`):** Activación identidad $f(z) = z$ sin acotamiento sigmoidal, indispensable
 *   en problemas de regresión continua para predecir simultáneamente `[demandaUnidadesNorm, montoEsperadoNorm]`.
 * - **Pérdida (`meanSquaredError`):** Error Cuadrático Medio $MSE = \frac{1}{N}\sum \|y - \hat{y}\|^2$ optimizado con `adam(0.03)`.
 *
 * @returns {tf.Sequential} Modelo Keras regresor compilado.
 */
function buildKerasDemandRegressorModel() {
  // Crea contenedor secuencial Keras para el modelo regresor
  const model = tf.sequential();
  // Primera capa oculta de 12 unidades ReLU que recibe los 5 predictores normalizados
  model.add(
    tf.layers.dense({
      units: 12,
      activation: 'relu',
      inputShape: [5],
    })
  );
  // Segunda capa oculta de 8 unidades ReLU para refinar combinaciones no lineales (día x hora x canal)
  model.add(
    tf.layers.dense({
      units: 8,
      activation: 'relu',
    })
  );
  // Capa de salida continua de 2 unidades con activación lineal (unidades normalizadas y monto normalizado)
  model.add(
    tf.layers.dense({
      units: 2,
      activation: 'linear',
    })
  );

  // Compila con optimizador Adam (lr = 0.03) minimizando el Error Cuadrático Medio (MSE)
  model.compile({
    optimizer: tf.train.adam(0.03),
    loss: 'meanSquaredError',
    metrics: ['mse'],
  });

  return model;
}

/**
 * Gestor del ciclo de vida de los modelos Keras / TensorFlow.js: carga perezosa desde disco,
 * entrenamiento con Data Augmentation, liberación segura de memoria tensorial e inferencia híbrida.
 */
class TfModelManager {
  /**
   * Inicializa las rutas de persistencia y referencias en memoria de ambos modelos neuronales.
   *
   * @param {Object} [options={}] Configuración inyectada desde `AiService` o tests unitarios.
   * @param {string} [options.modelsDir=DEFAULT_MODELS_DIR] Carpeta raíz donde residen los subdirectorios de modelos.
   * @param {Object} [options.logger] Logger estructurado opcional.
   */
  constructor({ modelsDir = DEFAULT_MODELS_DIR, logger } = {}) {
    // Directorio raíz de artefactos guardados
    this.modelsDir = modelsDir;
    // Subdirectorio exclusivo para `model.json`, `weights.bin`, `scaler.json` y `metadata.json` del clasificador de fraude
    this.fraudModelDir = path.join(modelsDir, 'fraud_classifier');
    // Subdirectorio exclusivo para `model.json`, `weights.bin` y `metadata.json` del regresor de demanda
    this.demandModelDir = path.join(modelsDir, 'demand_regressor');
    // Referencia al logger inyectado
    this.logger = logger;

    // Estado en memoria del clasificador Keras, su escalador Min-Max y sus metadatos de entrenamiento
    this.fraudModel = null;
    this.fraudScaler = null;
    this.fraudMetadata = null;

    // Estado en memoria del regresor Keras de demanda y sus metadatos de entrenamiento
    this.demandModel = null;
    this.demandMetadata = null;
  }

  /**
   * Garantiza de forma idempotente que ambos modelos estén listos en memoria antes de responder consultas o inferencias:
   * 1. Si ya están cargados en RAM, retorna el estado inmediatamente en O(1).
   * 2. Si no, intenta restaurarlos desde disco (`loadModelsFromDisk`).
   * 3. Si aún no existen artefactos en disco, ejecuta el entrenamiento inicial y los persiste (`trainAndSaveModels`).
   *
   * Se dispara desde `AiService.getModelsStatus()`, `AiService.classifyRecentOperations()`, `classifyOperation()`
   * y `predictExpectedDemandAndAmount()`.
   *
   * @param {Array<Object>} [realOperations=[]] Operaciones reales para enriquecer el entrenamiento inicial si hace falta.
   * @returns {Promise<Object>} Estado actual de los modelos Keras.
   */
  async ensureReady(realOperations = []) {
    // Atajo rápido: evita lecturas de disco o reentrenamientos si los modelos y el escalador ya viven en memoria
    if (this.fraudModel && this.fraudScaler && this.demandModel) {
      return this.getStatus();
    }

    // Intenta hidratar modelos y metadatos previamente guardados en `saved_models`
    const loaded = await this.loadModelsFromDisk();
    if (loaded) {
      return this.getStatus();
    }

    // Si no existían archivos en disco, entrena ambos modelos por primera vez y los guarda
    return this.trainAndSaveModels({ realOperations, epochs: 35, augmentationFactor: 2 });
  }

  /**
   * Restaura desde disco los dos modelos Keras (`tf.loadLayersModel`), el escalador Min-Max y sus metadatos.
   *
   * @returns {Promise<boolean>} `true` si todos los artefactos existían y cargaron íntegros; `false` en caso contrario.
   */
  async loadModelsFromDisk() {
    try {
      // Construye los manejadores de sistema de archivos para cada subcarpeta de modelo
      const fraudHandler = createFileSystemIOHandler(this.fraudModelDir);
      const demandHandler = createFileSystemIOHandler(this.demandModelDir);

      // Lee los parámetros del escalador Min-Max indispensables para normalizar nuevas operaciones igual que en el entrenamiento
      const scalerRaw = await fs.readFile(
        path.join(this.fraudModelDir, 'scaler.json'),
        'utf8'
      );
      // Lee métricas e historial resumido del clasificador de fraude
      const fraudMetaRaw = await fs.readFile(
        path.join(this.fraudModelDir, 'metadata.json'),
        'utf8'
      );
      // Lee métricas e historial resumido del regresor de demanda
      const demandMetaRaw = await fs.readFile(
        path.join(this.demandModelDir, 'metadata.json'),
        'utf8'
      );

      // Reconstruye en memoria las topologías Keras e inyecta sus tensores de pesos desde `weights.bin`
      this.fraudModel = await tf.loadLayersModel(fraudHandler);
      this.demandModel = await tf.loadLayersModel(demandHandler);
      // Parsea los JSON auxiliares de preprocesamiento y auditoría
      this.fraudScaler = JSON.parse(scalerRaw);
      this.fraudMetadata = JSON.parse(fraudMetaRaw);
      this.demandMetadata = JSON.parse(demandMetaRaw);

      // Registra evento informativo de carga exitosa en frío
      this.logger?.info('Modelos Keras/TensorFlow cargados exitosamente desde disco');
      return true;
    } catch {
      // Cualquier archivo faltante o corrupto devuelve `false` limpiamente para que `ensureReady` dispare entrenamiento nuevo
      return false;
    }
  }

  /**
   * Entrena de extremo a extremo ambos modelos Keras (Clasificador de Fraude y Regresor de Demanda/Monto),
   * liberando explícitamente los tensores de entrenamiento con `.dispose()` y guardando los artefactos en disco.
   *
   * **Nota técnica sobre memoria en funciones `async`:** `tf.tidy()` NO puede envolver llamadas asíncronas
   * como `await model.fit(...)`. Por ello, los tensores de entrenamiento (`xs`, `ys`, `dXs`, `dYs`) y las instancias
   * previas de modelos reentrenados se liberan explícitamente invocando `.dispose()`, evitando fugas de tensores.
   *
   * Se dispara desde `AiService.trainModels()` (`POST /ai/train`) o desde `ensureReady()`.
   *
   * @param {Object} [params={}] Hiperparámetros de entrenamiento y operaciones reales.
   * @returns {Promise<Object>} Resumen actualizado de `getStatus()`.
   */
  async trainAndSaveModels({
    realOperations = [],
    epochs = 35,
    augmentationFactor = 2,
  } = {}) {
    // 1. Construye las muestras base (reales + arquetipos) y las multiplica mediante Data Augmentation determinista
    const baseSamples = buildBaseFraudSamples(realOperations);
    const augmentedSamples = augmentFraudDataset(baseSamples, augmentationFactor);

    // Separa la matriz de entrada X [N, 8] y el vector columna de etiquetas supervisadas Y [N, 1]
    const rawFeatures = augmentedSamples.map((s) => s.features);
    const labels = augmentedSamples.map((s) => [s.label]);

    // 2. Ajusta el escalador Min-Max con `tf.tidy` y normaliza toda la matriz de entrenamiento
    const scaler = computeNormalizationScaler(rawFeatures);
    const normalizedFeatures = normalizeFeaturesWithScaler(rawFeatures, scaler);

    // Aloca los tensores 2D de entrada `xs` y salida esperada `ys` para el entrenamiento supervisado
    const xs = tf.tensor2d(normalizedFeatures);
    const ys = tf.tensor2d(labels);

    // Construye una instancia fresca del clasificador Keras y ajusta sus pesos por retropropagación (backpropagation)
    const fraudModel = buildKerasFraudClassifierModel();
    const history = await fraudModel.fit(xs, ys, {
      epochs, // Cantidad de pasadas completas sobre el dataset aumentado
      batchSize: 16, // Tamaño de mini-lote para actualización de gradientes con Adam
      shuffle: true, // Baraja las muestras en cada época evitando sesgos por orden de clase
      verbose: 0, // Silencia la salida estándar de consola de TensorFlow
    });

    // Libera inmediatamente de la memoria de TensorFlow.js los tensores `xs` y `ys` (obligatorio tras un `await`)
    xs.dispose();
    ys.dispose();

    // Extrae la pérdida (`binaryCrossentropy`) y la exactitud (`accuracy`) alcanzadas en la última época
    const lossHistory = history.history.loss || [0];
    const accHistory = history.history.acc || history.history.accuracy || [0.95];
    const finalLoss = Number(lossHistory[lossHistory.length - 1].toFixed(4));
    const finalAccuracy = Number(accHistory[accHistory.length - 1].toFixed(4));

    // 3. Persiste el clasificador Keras (`model.json` + `weights.bin`) y su `scaler.json` en disco
    await fs.mkdir(this.fraudModelDir, { recursive: true });
    await fraudModel.save(createFileSystemIOHandler(this.fraudModelDir));
    await fs.writeFile(
      path.join(this.fraudModelDir, 'scaler.json'),
      JSON.stringify(scaler, null, 2),
      'utf8'
    );

    // Construye la ficha técnica auditable del clasificador entrenado
    const fraudMetadata = {
      modelName: 'Keras Sequential Fraud Classifier',
      framework: 'TensorFlow.js / Keras Layers API',
      architecture: 'Dense(16, ReLU) -> Dropout(0.1) -> Dense(8, ReLU) -> Dense(1, Sigmoid)',
      inputFeatures: [
        'monto',
        'hora',
        'metodoPago',
        'firmaInvalida',
        'frecuenciaVentana',
        'porcentajeDescuento',
        'tasaAnulacionUsuario',
        'canal',
      ],
      baseSamplesCount: baseSamples.length,
      augmentedSamplesCount: augmentedSamples.length,
      augmentationFactor,
      epochs,
      finalLoss,
      finalAccuracy,
      trainedAt: new Date().toISOString(),
      savedPath: this.fraudModelDir,
    };

    // Guarda en disco los metadatos del clasificador
    await fs.writeFile(
      path.join(this.fraudModelDir, 'metadata.json'),
      JSON.stringify(fraudMetadata, null, 2),
      'utf8'
    );

    // 4. Genera malla estructurada de entrenamiento (7 días x 7 franjas horarias x 4 canales = 196 escenarios) para el Regresor Keras
    const demandTrainingInputs = [];
    const demandTrainingTargets = [];

    for (let day = 1; day <= 7; day++) {
      for (const hour of [8, 10, 12, 15, 18, 20, 2]) {
        for (const chCode of [0.2, 0.5, 0.6, 0.8]) {
          // Factor multiplicador por hora pico gastronómica vs mañana temprana vs madrugada
          const isPeak = hour >= 11 && hour <= 19 ? 1.35 : hour >= 7 && hour <= 10 ? 1.15 : 0.55;
          // Incremento del 25% en demanda durante sábado (6) y domingo (7)
          const isWeekend = day >= 6 ? 1.25 : 1.0;
          // Impulso adicional en canales digitales/domicilio
          const channelMultiplier = chCode >= 0.6 ? 1.2 : 1.0;

          // Calcula unidades esperadas y facturación esperada con ticket medio base de $14.500 COP
          const expectedUnits = Math.round(18 * isPeak * isWeekend * channelMultiplier);
          const expectedAmount = Math.round(expectedUnits * 14500);

          // Vector de entrada escalado a [0, 1] con las 5 variables predictoras
          demandTrainingInputs.push([
            day / 7,
            hour / 23,
            chCode,
            0.1,
            (expectedUnits * 0.9) / 100,
          ]);
          // Vector objetivo escalado: unidades divididas entre 100 y monto dividido entre 1.000.000 COP
          demandTrainingTargets.push([expectedUnits / 100, expectedAmount / 1000000]);
        }
      }
    }

    // Aloca tensores 2D para ajustar la red regresora de demanda y monto
    const dXs = tf.tensor2d(demandTrainingInputs);
    const dYs = tf.tensor2d(demandTrainingTargets);
    const demandModel = buildKerasDemandRegressorModel();
    const demandHist = await demandModel.fit(dXs, dYs, {
      epochs: 30,
      batchSize: 16,
      shuffle: true,
      verbose: 0,
    });
    // Libera explícitamente los tensores del segundo entrenamiento para no retener memoria huérfana
    dXs.dispose();
    dYs.dispose();

    // Registra pérdida MSE final y metadatos del modelo regresor
    const demandLosses = demandHist.history.loss || [0];
    const demandMetadata = {
      modelName: 'Keras Sequential Demand & Amount Regressor',
      framework: 'TensorFlow.js / Keras Layers API',
      architecture: 'Dense(12, ReLU) -> Dense(8, ReLU) -> Dense(2, Linear)',
      samplesCount: demandTrainingInputs.length,
      epochs: 30,
      finalMseLoss: Number(demandLosses[demandLosses.length - 1].toFixed(5)),
      trainedAt: new Date().toISOString(),
      savedPath: this.demandModelDir,
    };

    // Guarda en disco la arquitectura/pesos del regresor y su archivo `metadata.json`
    await fs.mkdir(this.demandModelDir, { recursive: true });
    await demandModel.save(createFileSystemIOHandler(this.demandModelDir));
    await fs.writeFile(
      path.join(this.demandModelDir, 'metadata.json'),
      JSON.stringify(demandMetadata, null, 2),
      'utf8'
    );

    // Si ya había modelos cargados previamente en esta instancia (reentrenamiento en caliente), libera sus pesos antiguos con `.dispose()`
    if (this.fraudModel) this.fraudModel.dispose();
    if (this.demandModel) this.demandModel.dispose();

    // Actualiza las referencias activas en memoria con los modelos recién entrenados
    this.fraudModel = fraudModel;
    this.fraudScaler = scaler;
    this.fraudMetadata = fraudMetadata;
    this.demandModel = demandModel;
    this.demandMetadata = demandMetadata;

    return this.getStatus();
  }

  /**
   * Clasifica una operación individual como `NORMAL` o `FRAUDULENTA` ejecutando inferencia neuronal Keras
   * dentro de `tf.tidy()` y enriqueciéndola con razones explicativas de dominio (XAI / Explainable AI).
   *
   * Se dispara desde `AiService.classifyOperation()`, `AiService.classifyRecentOperations()`,
   * `OperationalService.generateInvoice()` y `OperationalService.processPayment()`.
   *
   * @param {Object} [operation={}] Datos de la factura, pago o transacción a evaluar.
   * @returns {Promise<Object>} Diagnóstico completo con probabilidad, nivel de riesgo, features y razones.
   */
  async classifyOperation(operation = {}) {
    // Asegura que el clasificador y su escalador estén cargados en memoria
    await this.ensureReady();

    // Extrae las 8 características numéricas crudas y las escala con el `fraudScaler` activo
    const rawFeatures = extractOperationFeatures(operation);
    const normalized = normalizeFeaturesWithScaler([rawFeatures], this.fraudScaler);

    // Ejecuta el pase hacia adelante (`predict`) dentro de `tf.tidy` para destruir automáticamente `inputTensor` y `outputTensor`
    const nnProbability = tf.tidy(() => {
      const inputTensor = tf.tensor2d(normalized);
      const outputTensor = this.fraudModel.predict(inputTensor);
      return outputTensor.dataSync()[0];
    });

    // Construye explicabilidad determinista e impulso estructural ante violaciones duras de negocio
    const reasons = [];
    let structuralBoost = 0;

    // Verificación explicativa 1: Corrupción de firma HMAC o hash de comprobante
    if (rawFeatures[3] === 1) {
      reasons.push('Firma HMAC o hash de comprobante inválido');
      structuralBoost += 0.45;
    }
    // Verificación explicativa 2: Ráfaga de alta frecuencia en ventana corta
    if (rawFeatures[4] >= 5) {
      reasons.push(`Frecuencia anormal en ventana corta (${rawFeatures[4]} ops)`);
      structuralBoost += 0.3;
    }
    // Verificación explicativa 3: Descuento comercial superior al límite permitido del 30%
    if (rawFeatures[5] > 30) {
      reasons.push(`Descuento abusivo (${rawFeatures[5]}% > 30%)`);
      structuralBoost += 0.35;
    }
    // Verificación explicativa 4: Historial reiterado de anulaciones del usuario (>= 25%)
    if (rawFeatures[6] >= 25) {
      reasons.push(`Usuario con alta tasa histórica de anulaciones (${rawFeatures[6]}%)`);
      structuralBoost += 0.2;
    }
    // Verificación explicativa 5: Operación de alto valor durante la madrugada (00:00 a 05:59)
    if (rawFeatures[0] > 180000 && rawFeatures[1] <= 5) {
      reasons.push(
        `Monto elevado ($${rawFeatures[0].toLocaleString()}) en horario de madrugada (${rawFeatures[1]}:00h)`
      );
      structuralBoost += 0.25;
    }

    // Combina la probabilidad sigmoidal de la red neuronal (peso 65%) con el refuerzo estructural acotado en <= 0.999
    const combinedScore = Math.min(
      0.999,
      Number((nnProbability * 0.65 + structuralBoost).toFixed(4))
    );
    // Marca como fraudulenta si supera el umbral de decisión 0.5 o si la firma criptográfica es inválida
    const isFraudulent = combinedScore >= 0.5 || rawFeatures[3] === 1;

    // Si ninguna regla puntual se activó, documenta la conclusión multivariable pura de la red neuronal
    if (reasons.length === 0) {
      reasons.push(
        isFraudulent
          ? 'Patrón multivariable de monto, frecuencia y horario clasificado como anómalo por la red neuronal Keras'
          : 'Parámetros dentro de la distribución normal de operación'
      );
    }

    // Retorna el veredicto estructurado listo para auditoría o visualización en el panel
    return {
      classification: isFraudulent ? 'FRAUDULENTA' : 'NORMAL',
      isFraudulent,
      fraudProbability: combinedScore,
      neuralNetworkRawScore: Number(nnProbability.toFixed(4)),
      riskLevel:
        combinedScore >= 0.75
          ? 'Crítico'
          : combinedScore >= 0.5
            ? 'Alto'
            : combinedScore >= 0.3
              ? 'Medio'
              : 'Bajo',
      extractedFeatures: {
        monto: rawFeatures[0],
        hora: rawFeatures[1],
        metodoPagoCod: rawFeatures[2],
        firmaValida: rawFeatures[3] === 0,
        frecuencia: rawFeatures[4],
        porcentajeDescuento: rawFeatures[5],
        tasaAnulacionUsuario: rawFeatures[6],
        canalCod: rawFeatures[7],
      },
      normalizedFeatures: normalized[0].map((v) => Number(v.toFixed(4))),
      reasons,
    };
  }

  /**
   * Predice simultáneamente las unidades de demanda esperadas y el ingreso esperado en COP
   * mediante inferencia sobre el modelo Keras regresor (`demandModel`).
   *
   * Se dispara desde `AiService.predictDemandAndAmount()` ante `POST /ai/predict-demand`.
   *
   * @param {Object} [params={}] Contexto horario, comercial y promedio histórico.
   * @returns {Promise<Object>} Unidades proyectadas, monto esperado en COP y ticket promedio estimado.
   */
  async predictExpectedDemandAndAmount({
    dayOfWeek = 5,
    hour = 14,
    canal = 'presencial',
    porcentajeDescuento = 5,
    promedioHistoricoUnidades = 24,
  } = {}) {
    // Verifica que el modelo regresor esté listo en memoria
    await this.ensureReady();

    // Codifica el canal y construye el vector de 5 predictores en la misma escala [0, 1] usada en el entrenamiento
    const chCode = CHANNEL_CODES[String(canal).toLowerCase()] ?? 0.3;
    const inputRow = [
      Math.min(7, Math.max(1, Number(dayOfWeek))) / 7,
      Math.min(23, Math.max(0, Number(hour))) / 23,
      chCode,
      Math.min(50, Math.max(0, Number(porcentajeDescuento))) / 100,
      Math.max(1, Number(promedioHistoricoUnidades)) / 100,
    ];

    // Ejecuta la predicción dentro de `tf.tidy()` liberando inmediatamente los tensores temporales de entrada y salida
    const [predUnitsNorm, predAmountNorm] = tf.tidy(() => {
      const inputTensor = tf.tensor2d([inputRow]);
      const outTensor = this.demandModel.predict(inputTensor);
      return Array.from(outTensor.dataSync());
    });

    // Des-escala las predicciones multiplicando por sus factores inversos (100 unidades y $1.000.000 COP) con pisos mínimos coherentes
    const predictedUnits = Math.max(1, Math.round(predUnitsNorm * 100));
    const predictedRevenue = Math.max(
      predictedUnits * 6500,
      Math.round(predAmountNorm * 1000000)
    );

    // Retorna los parámetros evaluados, la demanda estimada, el monto esperado y el ticket promedio implícito
    return {
      inputs: {
        dayOfWeek: Number(dayOfWeek),
        hour: Number(hour),
        canal,
        porcentajeDescuento: Number(porcentajeDescuento),
        promedioHistoricoUnidades: Number(promedioHistoricoUnidades),
      },
      predictedDemandUnits: predictedUnits,
      predictedExpectedAmount: predictedRevenue,
      expectedAverageTicket: Math.round(predictedRevenue / Math.max(1, predictedUnits)),
    };
  }

  /**
   * Devuelve el estado operativo actual del motor TensorFlow.js, el backend activo (`cpu`),
   * las fichas técnicas de ambos modelos y el escalador Min-Max vigente.
   *
   * @returns {Object} Resumen de estado de los modelos Keras.
   */
  getStatus() {
    return {
      isReady: Boolean(this.fraudModel && this.demandModel),
      backend: tf.getBackend(),
      modelsDir: this.modelsDir,
      fraudClassifier: this.fraudMetadata,
      demandRegressor: this.demandMetadata,
      scaler: this.fraudScaler,
    };
  }
}

// Exporta la clase gestora y sus utilidades puras para `AiService` y las pruebas de dominio/integración
module.exports = {
  TfModelManager,
  createFileSystemIOHandler,
  extractOperationFeatures,
  computeNormalizationScaler,
  normalizeFeaturesWithScaler,
  augmentFraudDataset,
  buildBaseFraudSamples,
};
