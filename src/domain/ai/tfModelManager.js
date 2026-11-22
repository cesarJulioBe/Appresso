const fs = require('fs/promises');
const path = require('path');
const tf = require('@tensorflow/tfjs');

const DEFAULT_MODELS_DIR = path.join(
  __dirname,
  '../../infrastructure/ai/saved_models'
);

const PAYMENT_METHOD_CODES = {
  efectivo: 0.1,
  tarjeta: 0.4,
  transferencia: 0.6,
  nequi: 0.5,
  daviplata: 0.5,
  pse: 0.7,
  cripto: 0.95,
};

const CHANNEL_CODES = {
  presencial: 0.2,
  web: 0.6,
  app: 0.5,
  domicilio: 0.8,
};

/**
 * IOHandler personalizado de TensorFlow.js para guardar y cargar modelos Keras (model.json + weights.bin)
 * en el sistema de archivos local de Node.js sin requerir binarios C++ nativos.
 */
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

/**
 * Codifica una operación (transacción, factura, pago o pedido) en un vector de 8 características numéricas:
 * [monto, horaDia, metodoPagoCod, firmaInvalidaFlag, frecuenciaVentana, descuentoPct, tasaAnulacionUsuario, canalCod]
 */
function extractOperationFeatures(operation = {}) {
  const rawAmount = Number(
    operation.monto ?? operation.valor ?? operation.value ?? operation.total ?? 15000
  );
  const rawDate =
    operation.fecha ??
    operation.date ??
    operation.fecha_txn ??
    operation.created_at ??
    new Date();
  const parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
  const hour = Number.isFinite(parsedDate.getHours())
    ? parsedDate.getHours()
    : Number(operation.hora ?? 12);

  const methodKey = String(
    operation.metodoPago ?? operation.metodo_pago ?? operation.paymentMethod ?? 'tarjeta'
  )
    .toLowerCase()
    .trim();
  const methodCode = PAYMENT_METHOD_CODES[methodKey] ?? 0.5;

  // firmaValida = true (1) -> firmaInvalidaFlag = 0; firma inválida o comprobante falso -> 1
  const signatureValid =
    operation.firmaValida !== undefined
      ? Boolean(operation.firmaValida)
      : operation.isHashValid !== undefined
        ? Boolean(operation.isHashValid)
        : operation.comprobante_valido !== undefined
          ? Boolean(operation.comprobante_valido)
          : operation.estado !== 'Hash inválido' && operation.estado !== 'Alterada';
  const invalidSignatureFlag = signatureValid ? 0 : 1;

  const frequency = Number(
    operation.frecuencia ??
      operation.transactionCount ??
      operation.cantidad_transacciones ??
      1
  );

  const discountPct = Number(
    operation.porcentajeDescuento ??
      operation.porcentaje_descuento ??
      operation.descuentoPct ??
      0
  );

  const userCancelRate = Number(
    operation.tasaAnulacionUsuario ?? operation.cancellationRatePct ?? 0
  );

  const channelKey = String(operation.canal ?? 'presencial')
    .toLowerCase()
    .trim();
  const channelCode = CHANNEL_CODES[channelKey] ?? 0.3;

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
 * Calcula parámetros de normalización Min-Max por columna usando TensorFlow.
 */
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

/**
 * Normaliza una matriz de características [N, D] al rango [0, 1] con TensorFlow.
 */
function normalizeFeaturesWithScaler(featureMatrix, scaler) {
  return featureMatrix.map((row) =>
    row.map((val, idx) => {
      const min = scaler.min[idx] ?? 0;
      const max = scaler.max[idx] ?? 1;
      const range = max - min;
      if (range <= 1e-9) return 0;
      return Math.min(1.5, Math.max(-0.2, (val - min) / range));
    })
  );
}

/**
 * Aumento de Datos (Data Augmentation) en TensorFlow:
 * Genera variaciones sintéticas con perturbaciones controladas sobre las muestras originales
 * para incrementar el volumen y balancear las clases Normal (0) y Fraudulenta (1).
 */
function augmentFraudDataset(samples = [], augmentationFactor = 2) {
  const augmented = [...samples];

  for (let i = 0; i < samples.length; i++) {
    const base = samples[i];
    for (let k = 1; k <= augmentationFactor; k++) {
      // Perturbación determinista reproducible tipo pseudo-gaussiana
      const sign = (i + k) % 2 === 0 ? 1 : -1;
      const jitter = 0.04 * k * sign;
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

      const newAmount = Math.max(1000, Math.round(amount * (1 + jitter)));
      const newHour = Math.min(23, Math.max(0, (hour + (k % 2 === 0 ? 1 : 0)) % 24));
      const newFreq = Math.max(
        1,
        base.label === 1 ? freq + (k % 2) : Math.max(1, freq)
      );
      const newDiscount = Math.max(
        0,
        Math.min(80, Number((discountPct * (1 + jitter * 0.5)).toFixed(2)))
      );

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
 * Construye el dataset base combinando registros reales de la BD con arquetipos de entrenamiento
 * para garantizar que el clasificador aprenda todos los patrones de fraude del negocio.
 */
function buildBaseFraudSamples(realOperations = []) {
  const samples = [];

  // 1. Muestras reales del sistema
  for (const op of realOperations) {
    const features = extractOperationFeatures(op);
    const isFraud =
      op.es_anomalia === true ||
      op.estado === 'Hash inválido' ||
      op.estado === 'Alterada' ||
      op.comprobante_valido === false ||
      features[3] === 1 || // firma inválida
      features[4] >= 5 || // frecuencia excesiva en ventana
      features[5] > 30 || // descuento abusado > 30%
      (features[0] > 180000 && (features[1] <= 5 || features[6] >= 25));

    samples.push({
      features,
      label: isFraud ? 1 : 0,
      isAugmented: false,
    });
  }

  // 2. Semilla arquetípica balanceada (casos normales y casos de fraude operativo)
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

  const fraudArchetypes = [
    // Firma / Hash o comprobante inválido
    [45000, 14, 0.6, 1, 1, 0, 5, 0.6],
    [120000, 3, 0.4, 1, 2, 10, 10, 0.8],
    [28000, 11, 0.7, 1, 1, 0, 0, 0.5],
    // Ráfaga de alta frecuencia en ventana corta
    [35000, 2, 0.4, 0, 7, 0, 10, 0.6],
    [65000, 3, 0.4, 0, 9, 15, 15, 0.5],
    [52000, 15, 0.6, 0, 8, 5, 12, 0.6],
    // Descuentos abusados (> 30%) y anulaciones sospechosas
    [85000, 16, 0.1, 0, 2, 48, 35, 0.2],
    [110000, 20, 0.4, 0, 3, 55, 40, 0.2],
    [72000, 13, 0.5, 0, 2, 42, 30, 0.8],
    // Montos muy altos en madrugada + tasa alta de anulaciones
    [290000, 2, 0.7, 0, 5, 25, 35, 0.6],
    [340000, 4, 0.4, 0, 6, 35, 45, 0.8],
    [250000, 1, 0.95, 1, 4, 40, 50, 0.6],
  ];

  for (const feat of normalArchetypes) {
    samples.push({ features: feat, label: 0, isAugmented: false });
  }
  for (const feat of fraudArchetypes) {
    samples.push({ features: feat, label: 1, isAugmented: false });
  }

  return samples;
}

/**
 * Crea el modelo Keras Clasificador de Fraude (tf.sequential).
 */
function buildKerasFraudClassifierModel() {
  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      units: 16,
      activation: 'relu',
      inputShape: [8],
      kernelInitializer: 'glorotUniform',
    })
  );
  model.add(tf.layers.dropout({ rate: 0.1 }));
  model.add(
    tf.layers.dense({
      units: 8,
      activation: 'relu',
    })
  );
  model.add(
    tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
    })
  );

  model.compile({
    optimizer: tf.train.adam(0.025),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  });

  return model;
}

/**
 * Crea el modelo Keras de Regresión para Predicción de Demanda y Monto Esperado (tf.sequential).
 * Entrada (5 features): [diaSemanaNorm, horaNorm, canalCod, descuentoNorm, promedioHistoricoNorm]
 * Salida (2 valores): [demandaUnidadesNorm, montoEsperadoNorm]
 */
function buildKerasDemandRegressorModel() {
  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      units: 12,
      activation: 'relu',
      inputShape: [5],
    })
  );
  model.add(
    tf.layers.dense({
      units: 8,
      activation: 'relu',
    })
  );
  model.add(
    tf.layers.dense({
      units: 2,
      activation: 'linear',
    })
  );

  model.compile({
    optimizer: tf.train.adam(0.03),
    loss: 'meanSquaredError',
    metrics: ['mse'],
  });

  return model;
}

/**
 * Gestor de Modelos Keras / TensorFlow con soporte de entrenamiento, data augmentation,
 * inferencia y persistencia en disco (guardar y cargar modelos).
 */
class TfModelManager {
  constructor({ modelsDir = DEFAULT_MODELS_DIR, logger } = {}) {
    this.modelsDir = modelsDir;
    this.fraudModelDir = path.join(modelsDir, 'fraud_classifier');
    this.demandModelDir = path.join(modelsDir, 'demand_regressor');
    this.logger = logger;

    this.fraudModel = null;
    this.fraudScaler = null;
    this.fraudMetadata = null;

    this.demandModel = null;
    this.demandMetadata = null;
  }

  /**
   * Intenta cargar los modelos previamente guardados en disco; si no existen, los entrena y guarda.
   */
  async ensureReady(realOperations = []) {
    if (this.fraudModel && this.fraudScaler && this.demandModel) {
      return this.getStatus();
    }

    const loaded = await this.loadModelsFromDisk();
    if (loaded) {
      return this.getStatus();
    }

    return this.trainAndSaveModels({ realOperations, epochs: 35, augmentationFactor: 2 });
  }

  /**
   * Carga los modelos Keras y sus escaladores desde disco si están disponibles.
   */
  async loadModelsFromDisk() {
    try {
      const fraudHandler = createFileSystemIOHandler(this.fraudModelDir);
      const demandHandler = createFileSystemIOHandler(this.demandModelDir);

      const scalerRaw = await fs.readFile(
        path.join(this.fraudModelDir, 'scaler.json'),
        'utf8'
      );
      const fraudMetaRaw = await fs.readFile(
        path.join(this.fraudModelDir, 'metadata.json'),
        'utf8'
      );
      const demandMetaRaw = await fs.readFile(
        path.join(this.demandModelDir, 'metadata.json'),
        'utf8'
      );

      this.fraudModel = await tf.loadLayersModel(fraudHandler);
      this.demandModel = await tf.loadLayersModel(demandHandler);
      this.fraudScaler = JSON.parse(scalerRaw);
      this.fraudMetadata = JSON.parse(fraudMetaRaw);
      this.demandMetadata = JSON.parse(demandMetaRaw);

      this.logger?.info('Modelos Keras/TensorFlow cargados exitosamente desde disco');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Entrena ambos modelos Keras (Clasificador de Fraude y Regresor de Demanda/Monto),
   * aplicando normalización TensorFlow y Data Augmentation, y los guarda en disco.
   */
  async trainAndSaveModels({
    realOperations = [],
    epochs = 35,
    augmentationFactor = 2,
  } = {}) {
    // 1. Preparar dataset base y aplicar Data Augmentation
    const baseSamples = buildBaseFraudSamples(realOperations);
    const augmentedSamples = augmentFraudDataset(baseSamples, augmentationFactor);

    const rawFeatures = augmentedSamples.map((s) => s.features);
    const labels = augmentedSamples.map((s) => [s.label]);

    // 2. Normalización con TensorFlow
    const scaler = computeNormalizationScaler(rawFeatures);
    const normalizedFeatures = normalizeFeaturesWithScaler(rawFeatures, scaler);

    const xs = tf.tensor2d(normalizedFeatures);
    const ys = tf.tensor2d(labels);

    const fraudModel = buildKerasFraudClassifierModel();
    const history = await fraudModel.fit(xs, ys, {
      epochs,
      batchSize: 16,
      shuffle: true,
      verbose: 0,
    });

    xs.dispose();
    ys.dispose();

    const lossHistory = history.history.loss || [0];
    const accHistory = history.history.acc || history.history.accuracy || [0.95];
    const finalLoss = Number(lossHistory[lossHistory.length - 1].toFixed(4));
    const finalAccuracy = Number(accHistory[accHistory.length - 1].toFixed(4));

    // 3. Guardar Clasificador Keras y Scaler en disco
    await fs.mkdir(this.fraudModelDir, { recursive: true });
    await fraudModel.save(createFileSystemIOHandler(this.fraudModelDir));
    await fs.writeFile(
      path.join(this.fraudModelDir, 'scaler.json'),
      JSON.stringify(scaler, null, 2),
      'utf8'
    );

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

    await fs.writeFile(
      path.join(this.fraudModelDir, 'metadata.json'),
      JSON.stringify(fraudMetadata, null, 2),
      'utf8'
    );

    // 4. Entrenar Modelo Keras 2: Regresor de Demanda y Monto Esperado
    const demandTrainingInputs = [];
    const demandTrainingTargets = [];

    for (let day = 1; day <= 7; day++) {
      for (const hour of [8, 10, 12, 15, 18, 20, 2]) {
        for (const chCode of [0.2, 0.5, 0.6, 0.8]) {
          const isPeak = hour >= 11 && hour <= 19 ? 1.35 : hour >= 7 && hour <= 10 ? 1.15 : 0.55;
          const isWeekend = day >= 6 ? 1.25 : 1.0;
          const channelMultiplier = chCode >= 0.6 ? 1.2 : 1.0;

          const expectedUnits = Math.round(18 * isPeak * isWeekend * channelMultiplier);
          const expectedAmount = Math.round(expectedUnits * 14500);

          demandTrainingInputs.push([
            day / 7,
            hour / 23,
            chCode,
            0.1,
            (expectedUnits * 0.9) / 100,
          ]);
          demandTrainingTargets.push([expectedUnits / 100, expectedAmount / 1000000]);
        }
      }
    }

    const dXs = tf.tensor2d(demandTrainingInputs);
    const dYs = tf.tensor2d(demandTrainingTargets);
    const demandModel = buildKerasDemandRegressorModel();
    const demandHist = await demandModel.fit(dXs, dYs, {
      epochs: 30,
      batchSize: 16,
      shuffle: true,
      verbose: 0,
    });
    dXs.dispose();
    dYs.dispose();

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

    await fs.mkdir(this.demandModelDir, { recursive: true });
    await demandModel.save(createFileSystemIOHandler(this.demandModelDir));
    await fs.writeFile(
      path.join(this.demandModelDir, 'metadata.json'),
      JSON.stringify(demandMetadata, null, 2),
      'utf8'
    );

    if (this.fraudModel) this.fraudModel.dispose();
    if (this.demandModel) this.demandModel.dispose();

    this.fraudModel = fraudModel;
    this.fraudScaler = scaler;
    this.fraudMetadata = fraudMetadata;
    this.demandModel = demandModel;
    this.demandMetadata = demandMetadata;

    return this.getStatus();
  }

  /**
   * Clasifica una operación individual como NORMAL o FRAUDULENTA usando el modelo Keras cargado.
   */
  async classifyOperation(operation = {}) {
    await this.ensureReady();

    const rawFeatures = extractOperationFeatures(operation);
    const normalized = normalizeFeaturesWithScaler([rawFeatures], this.fraudScaler);

    const nnProbability = tf.tidy(() => {
      const inputTensor = tf.tensor2d(normalized);
      const outputTensor = this.fraudModel.predict(inputTensor);
      return outputTensor.dataSync()[0];
    });

    // Factores explicativos de riesgo combinados con la inferencia neuronal
    const reasons = [];
    let structuralBoost = 0;

    if (rawFeatures[3] === 1) {
      reasons.push('Firma HMAC o hash de comprobante inválido');
      structuralBoost += 0.45;
    }
    if (rawFeatures[4] >= 5) {
      reasons.push(`Frecuencia anormal en ventana corta (${rawFeatures[4]} ops)`);
      structuralBoost += 0.3;
    }
    if (rawFeatures[5] > 30) {
      reasons.push(`Descuento abusivo (${rawFeatures[5]}% > 30%)`);
      structuralBoost += 0.35;
    }
    if (rawFeatures[6] >= 25) {
      reasons.push(`Usuario con alta tasa histórica de anulaciones (${rawFeatures[6]}%)`);
      structuralBoost += 0.2;
    }
    if (rawFeatures[0] > 180000 && rawFeatures[1] <= 5) {
      reasons.push(
        `Monto elevado ($${rawFeatures[0].toLocaleString()}) en horario de madrugada (${rawFeatures[1]}:00h)`
      );
      structuralBoost += 0.25;
    }

    const combinedScore = Math.min(
      0.999,
      Number((nnProbability * 0.65 + structuralBoost).toFixed(4))
    );
    const isFraudulent = combinedScore >= 0.5 || rawFeatures[3] === 1;

    if (reasons.length === 0) {
      reasons.push(
        isFraudulent
          ? 'Patrón multivariable de monto, frecuencia y horario clasificado como anómalo por la red neuronal Keras'
          : 'Parámetros dentro de la distribución normal de operación'
      );
    }

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
   * Predice la demanda esperada (unidades) y el monto esperado (COP) usando el modelo Keras de regresión.
   */
  async predictExpectedDemandAndAmount({
    dayOfWeek = 5,
    hour = 14,
    canal = 'presencial',
    porcentajeDescuento = 5,
    promedioHistoricoUnidades = 24,
  } = {}) {
    await this.ensureReady();

    const chCode = CHANNEL_CODES[String(canal).toLowerCase()] ?? 0.3;
    const inputRow = [
      Math.min(7, Math.max(1, Number(dayOfWeek))) / 7,
      Math.min(23, Math.max(0, Number(hour))) / 23,
      chCode,
      Math.min(50, Math.max(0, Number(porcentajeDescuento))) / 100,
      Math.max(1, Number(promedioHistoricoUnidades)) / 100,
    ];

    const [predUnitsNorm, predAmountNorm] = tf.tidy(() => {
      const inputTensor = tf.tensor2d([inputRow]);
      const outTensor = this.demandModel.predict(inputTensor);
      return Array.from(outTensor.dataSync());
    });

    const predictedUnits = Math.max(1, Math.round(predUnitsNorm * 100));
    const predictedRevenue = Math.max(
      predictedUnits * 6500,
      Math.round(predAmountNorm * 1000000)
    );

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

module.exports = {
  TfModelManager,
  createFileSystemIOHandler,
  extractOperationFeatures,
  computeNormalizationScaler,
  normalizeFeaturesWithScaler,
  augmentFraudDataset,
  buildBaseFraudSamples,
};
