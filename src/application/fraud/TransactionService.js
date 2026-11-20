const detectAnomaly = require('../../domain/fraud/detectAnomaly');
const getThresholdByTime = require('../../domain/fraud/getThresholdByTime');
const validateTransaction = require('../../domain/fraud/validateTransaction');
const { generateTransactionHash } = require('../../domain/fraud/hashUtils');
const {
  ValidationError,
  ConflictError,
  ConfigurationError,
} = require('../../domain/errors');

class TransactionService {
  constructor({
    userRepository,
    transactionRepository,
    anomalyRepository,
    thresholdService,
    thresholds = getThresholdByTime.DEFAULT_THRESHOLDS,
    slidingWindow,
    secret,
    timeZone = 'America/Bogota',
    clock = () => new Date(),
    logger,
  }) {
    this.userRepository = userRepository;
    this.transactionRepository = transactionRepository;
    this.anomalyRepository = anomalyRepository;
    this.thresholdService = thresholdService;
    this.thresholds = thresholds;
    this.slidingWindow = slidingWindow;
    this.secret = secret;
    this.timeZone = timeZone;
    this.clock = clock;
    this.logger = logger;
  }

  #getActiveThresholds() {
    if (this.thresholdService && typeof this.thresholdService.getThresholdsInMemory === 'function') {
      return this.thresholdService.getThresholdsInMemory();
    }
    return this.thresholds || getThresholdByTime.DEFAULT_THRESHOLDS;
  }

  static normalizeInput(body = {}) {
    const idTxn = body.idTxn;
    const user = body.user ?? body.email;
    const date = body.date ?? body.fechaTxn ?? body.fecha_txn;
    const value = body.value ?? body.valor;
    const paymentMethod = body.paymentMethod ?? body.metodoPago ?? body.metodo_pago;
    const hash = body.hash;

    return { idTxn, user, date, value, paymentMethod, hash };
  }

  async #persistTransactionAndAnomaly({
    idTxn,
    user,
    value,
    fechaTxn,
    hash,
    paymentMethod,
    estado,
    anomalyData = null,
  }) {
    const usuario = await this.userRepository.findOrCreate(user);
    const savedTransaction = await this.transactionRepository.create({
      idTxn,
      usuarioId: usuario.id,
      valor: value,
      fechaTxn,
      hash,
      metodoPago: paymentMethod,
      estado,
    });

    let savedAnomaly = null;
    if (anomalyData) {
      savedAnomaly = await this.anomalyRepository.create({
        transaccionId: savedTransaction.id,
        ...anomalyData,
      });
    }

    return { savedTransaction, savedAnomaly };
  }

  async receive(rawInput) {
    const transaction = TransactionService.normalizeInput(rawInput);
    const { idTxn, user, date, value, paymentMethod, hash } = transaction;

    const validation = validateTransaction(transaction);
    if (!validation.isValid) {
      this.logger?.warn('Validación de transacción fallida', {
        result: 'validation_failed',
        idTxn: Number.isSafeInteger(idTxn) ? idTxn : undefined,
        errors: validation.errors,
      });
      throw new ValidationError('La transacción contiene datos inválidos', {
        code: 'VALIDATION_ERROR',
        details: validation.errors,
        resultTag: 'validation_failed',
      });
    }

    const existingTransaction = await this.transactionRepository.findByExternalId(idTxn);
    if (existingTransaction) {
      this.logger?.warn('Transacción duplicada rechazada', {
        result: 'duplicate_transaction',
        idTxn,
      });
      throw new ConflictError('Ya existe una transacción con ese idTxn', {
        code: 'DUPLICATE_TRANSACTION',
        resultTag: 'duplicate_transaction',
      });
    }

    const secret = this.secret || process.env.HMAC_SECRET;
    if (!secret) {
      this.logger?.error('HMAC_SECRET no está configurada en las variables de entorno', {
        result: 'configuration_error',
      });
      throw new ConfigurationError(
        'Error de configuración interna en la verificación de seguridad',
        {
          code: 'CONFIGURATION_ERROR',
          resultTag: 'configuration_error',
        }
      );
    }

    // Validación de umbral y ventana deslizante 100% en memoria usando directamente transaction.date
    const thresholds = this.#getActiveThresholds();
    const transactionDate = new Date(date);
    const analysis = detectAnomaly(
      transaction,
      this.slidingWindow,
      thresholds,
      secret,
      null,
      this.timeZone
    );

    try {
      if (!analysis.isHashValid) {
        this.logger?.warn('Hash de transacción inválido detectado y auditado', {
          result: 'invalid_hash',
          idTxn,
          user,
        });

        const { savedTransaction, savedAnomaly } = await this.#persistTransactionAndAnomaly({
          idTxn,
          user,
          value,
          fechaTxn: transactionDate,
          hash,
          paymentMethod,
          estado: 'Hash inválido',
          anomalyData: {
            tipo: 'HASH_INVALIDO',
            nivel: 'Crítico',
            cantidadTransacciones: 1,
            ventanaSegundos: 0,
          },
        });

        throw new ValidationError(
          'El hash no coincide con los datos recibidos (transacción registrada para auditoría)',
          {
            code: 'INVALID_HASH',
            resultTag: 'invalid_hash',
            payload: {
              transaction: savedTransaction,
              anomaly: savedAnomaly,
            },
          }
        );
      }

      const anomalyData = analysis.isAnomaly
        ? {
            tipo: analysis.tipo,
            nivel: 'Alto',
            cantidadTransacciones: analysis.transactionCount,
            ventanaSegundos: analysis.ventanaSegundos,
          }
        : null;

      const { savedTransaction, savedAnomaly } = await this.#persistTransactionAndAnomaly({
        idTxn,
        user,
        value,
        fechaTxn: transactionDate,
        hash,
        paymentMethod,
        estado: 'Procesada',
        anomalyData,
      });

      if (analysis.isAnomaly) {
        this.logger?.warn('Anomalía de fraude por frecuencia detectada', {
          result: 'anomaly_detected',
          idTxn,
          user,
          franja: analysis.franja,
          transactionCount: analysis.transactionCount,
          umbral: analysis.umbral,
          ventanaSegundos: analysis.ventanaSegundos,
        });
      } else {
        this.logger?.info('Transacción procesada exitosamente', {
          result: 'created',
          idTxn,
          user,
          value,
        });
      }

      return {
        transaction: savedTransaction,
        analysis,
        anomaly: savedAnomaly,
      };
    } catch (err) {
      if (err.code === '23505') {
        this.logger?.warn('Transacción duplicada por restricción única en BD', {
          result: 'duplicate_transaction',
          idTxn,
        });
        throw new ConflictError('Ya existe una transacción con ese idTxn', {
          code: 'DUPLICATE_TRANSACTION',
          resultTag: 'duplicate_transaction',
        });
      }
      throw err;
    }
  }

  async simulate({ user, value, paymentMethod }) {
    if (!user || !value) {
      throw new ValidationError('user y value son obligatorios');
    }

    const secret = this.secret || process.env.HMAC_SECRET;
    const idTxn = Date.now();
    const date = this.clock().toISOString();
    const base = {
      idTxn,
      user,
      date,
      value,
      paymentMethod: paymentMethod || 'Tarjeta',
    };
    const hash = generateTransactionHash(base, secret);

    const thresholds = this.#getActiveThresholds();
    const transaction = { ...base, hash };
    const analysis = detectAnomaly(
      transaction,
      this.slidingWindow,
      thresholds,
      secret,
      null,
      this.timeZone
    );

    const anomalyData = analysis.isAnomaly
      ? {
          tipo: analysis.tipo,
          nivel: 'Alto',
          cantidadTransacciones: analysis.transactionCount,
          ventanaSegundos: analysis.ventanaSegundos,
        }
      : null;

    const { savedTransaction, savedAnomaly } = await this.#persistTransactionAndAnomaly({
      idTxn,
      user,
      value,
      fechaTxn: date,
      hash,
      paymentMethod: base.paymentMethod,
      estado: 'Procesada',
      anomalyData,
    });

    this.logger?.info('Transacción simulada procesada', {
      idTxn,
      user,
      isAnomaly: analysis.isAnomaly,
    });

    return {
      transaction: savedTransaction,
      analysis,
      anomaly: savedAnomaly,
    };
  }

  async listTransactions() {
    return this.transactionRepository.findAll();
  }

  async listAnomalies() {
    return this.anomalyRepository.findAll();
  }
}

module.exports = TransactionService;
