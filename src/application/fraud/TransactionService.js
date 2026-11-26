/**
 * @file TransactionService.js
 * @description Caso de uso central del motor antifraude transaccional en tiempo real:
 * recepción idempotente de transacciones externas, validación estructural, verificación criptográfica
 * de firma HMAC-SHA256, evaluación de ráfagas por ventana deslizante (`SlidingWindow`) según franja horaria
 * y auditoría forense de intentos alterados o anómalos.
 *
 * - **Capa arquitectónica:** Aplicación - Casos de Uso (`src/application/fraud`).
 * - **Inyección de Dependencias (`container.js`):** Recibe desde `buildContainer()` en `src/container.js`:
 *   - `userRepository`: Instancia de `UserRepository` (`findOrCreate`).
 *   - `transactionRepository`: Instancia de `TransactionRepository` (`findByExternalId`, `create`, `findAll`).
 *   - `anomalyRepository`: Instancia de `AnomalyRepository` (`create`, `findAll`).
 *   - `thresholdService`: Instancia de `ThresholdService` para consultar umbrales horarios en memoria sin golpear la BD.
 *   - `slidingWindow`: Instancia compartida en memoria de `SlidingWindow` para conteo de ráfagas por usuario.
 *   - `secret`: Secreto criptográfico `HMAC_SECRET` inyectado desde configuración (`env.js`).
 *   - `timeZone`: Zona horaria operativa (`America/Bogota` por defecto).
 *   - `clock`: Función proveedora de tiempo actual `() => new Date()` (facilita determinismo en tests unitarios).
 *   - `logger`: Logger contextualizado con `childLogger('TransactionService')`.
 * - **Controlador HTTP que dispara cada método (`FraudController` en `src/interfaces/http/routes/fraud.routes.js`):**
 *   1. `receive(rawInput)` <- `FraudController.receiveTransaction` (`POST /`, `POST /transactions`,
 *      `POST /transaction`, `POST /api/transactions`, `POST /api/transaction`, `POST /fraud/transactions`,
 *      `POST /transacciones`, `POST /api/transacciones`).
 *   2. `simulate(...)` <- `FraudController.simulateTransaction` (`POST /fraud/simulate`).
 *   3. `listTransactions()` <- `FraudController.listTransactions` (`GET /fraud/transactions`).
 *   4. `listAnomalies()` <- `FraudController.listAnomalies` (`GET /fraud/anomalies`).
 *   *(Además es invocado directamente en pruebas unitarias desde `tests/unit/application/services.test.js`).*
 * - **Delegación a Dominio y Repositorios:**
 *   - Dominio: `detectAnomaly`, `getThresholdByTime`, `validateTransaction`, `generateTransactionHash`,
 *     `SlidingWindow`, `ValidationError`, `ConflictError`, `ConfigurationError`.
 *   - Repositorios / Colaboradores: `UserRepository`, `TransactionRepository`, `AnomalyRepository`, `ThresholdService`.
 */

// Motor puro de dominio que verifica firma HMAC y evalúa ráfagas sobre `SlidingWindow`
const detectAnomaly = require('../../domain/fraud/detectAnomaly');
// Catálogo de umbrales horarios por defecto (mañana, tarde, noche, madrugada)
const getThresholdByTime = require('../../domain/fraud/getThresholdByTime');
// Validador puro de esquema de dominio para los campos de una transacción entrante
const validateTransaction = require('../../domain/fraud/validateTransaction');
// Generador de firma HMAC-SHA256 canónica usado en el simulador de transacciones
const { generateTransactionHash } = require('../../domain/fraud/hashUtils');
// Clases de error operacionales traducidas por `errorHandler.js` a respuestas HTTP estandarizadas
const {
  ValidationError,
  ConflictError,
  ConfigurationError,
} = require('../../domain/errors');

class TransactionService {
  /**
   * Construye el servicio antifraude inyectando repositorios, ventana deslizante, umbrales y configuración criptográfica.
   *
   * @param {Object} deps Dependencias provistas por `container.js` o por dobles de prueba en `services.test.js`.
   */
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
    // Repositorio para localizar o dar de alta al usuario dueño del correo electrónico
    this.userRepository = userRepository;
    // Repositorio de transacciones financieras auditadas
    this.transactionRepository = transactionRepository;
    // Repositorio de alertas/anomalías detectadas
    this.anomalyRepository = anomalyRepository;
    // Servicio de umbrales dinámicos en memoria (opcional en tests unitarios que inyectan `thresholds` fijos)
    this.thresholdService = thresholdService;
    // Umbrales de respaldo cuando no se inyecta `thresholdService`
    this.thresholds = thresholds;
    // Ventana deslizante en memoria que mantiene marcas de tiempo recientes por usuario
    this.slidingWindow = slidingWindow;
    // Clave secreta HMAC para verificar integridad del payload
    this.secret = secret;
    // Zona horaria utilizada para clasificar la hora de la transacción en su franja correspondiente
    this.timeZone = timeZone;
    // Reloj inyectable para generación de timestamps reproducibles en `simulate()`
    this.clock = clock;
    // Logger contextual del servicio
    this.logger = logger;
  }

  /**
   * Obtiene en O(1) desde memoria los umbrales horarios vigentes sin consultar PostgreSQL en cada transacción.
   *
   * @returns {Array<Object>} Arreglo de configuraciones de franja horaria, umbral y ventana en segundos.
   */
  #getActiveThresholds() {
    // Si existe `thresholdService` inyectado desde `container.js`, lee su caché viva sincronizada
    if (this.thresholdService && typeof this.thresholdService.getThresholdsInMemory === 'function') {
      return this.thresholdService.getThresholdsInMemory();
    }
    // En pruebas aisladas sin `thresholdService`, usa `this.thresholds` o las constantes por defecto de dominio
    return this.thresholds || getThresholdByTime.DEFAULT_THRESHOLDS;
  }

  /**
   * Homologa un cuerpo de entrada aceptando variantes de nombres en inglés y español (camelCase / snake_case)
   * hacia la estructura canónica esperada por los validadores y algoritmos de dominio.
   *
   * @param {Object} [body={}] Payload crudo recibido por HTTP o llamada interna.
   * @returns {{ idTxn: *, user: *, date: *, value: *, paymentMethod: *, hash: * }} Objeto normalizado.
   */
  static normalizeInput(body = {}) {
    // Identificador único externo de la transacción
    const idTxn = body.idTxn;
    // Correo/identificador del usuario admitiendo `user` o `email`
    const user = body.user ?? body.email;
    // Marca temporal ISO admitiendo `date`, `fechaTxn` o `fecha_txn`
    const date = body.date ?? body.fechaTxn ?? body.fecha_txn;
    // Monto monetario admitiendo `value` o `valor`
    const value = body.value ?? body.valor;
    // Medio de pago admitiendo `paymentMethod`, `metodoPago` o `metodo_pago`
    const paymentMethod = body.paymentMethod ?? body.metodoPago ?? body.metodo_pago;
    // Firma HMAC-SHA256 enviada por el originador
    const hash = body.hash;

    return { idTxn, user, date, value, paymentMethod, hash };
  }

  /**
   * Método privado transaccional lógico que resuelve el usuario, guarda la transacción en BD
   * y opcionalmente registra su anomalía vinculada si se detectó fraude o hash inválido.
   *
   * @param {Object} params Datos listos para persistir en `usuarios`, `transacciones` y `anomalias`.
   * @returns {Promise<{ savedTransaction: Object, savedAnomaly: Object|null }>} Registros creados.
   */
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
    // Busca el usuario por email o lo crea automáticamente para obtener su llave foránea `usuario.id`
    const usuario = await this.userRepository.findOrCreate(user);
    // Inserta el registro principal de la transacción con su estado final ('Procesada' o 'Hash inválido')
    const savedTransaction = await this.transactionRepository.create({
      idTxn,
      usuarioId: usuario.id,
      valor: value,
      fechaTxn,
      hash,
      metodoPago: paymentMethod,
      estado,
    });

    // Si el motor antifraude reportó anomalía, inserta el detalle forense referenciando `savedTransaction.id`
    let savedAnomaly = null;
    if (anomalyData) {
      savedAnomaly = await this.anomalyRepository.create({
        transaccionId: savedTransaction.id,
        ...anomalyData,
      });
    }

    // Devuelve ambas entidades persistidas
    return { savedTransaction, savedAnomaly };
  }

  /**
   * Procesa de punta a punta una transacción entrante: normaliza campos, valida reglas de dominio,
   * verifica unicidad de `idTxn`, comprueba firma HMAC-SHA256, evalúa ventana deslizante y persiste auditoría.
   *
   * Se dispara desde `FraudController.receiveTransaction` en los endpoints `POST /transactions` (y alias),
   * así como directamente desde `tests/unit/application/services.test.js`.
   *
   * Nota de cero redundancia:
   * - Todas las validaciones de negocio (`validateTransaction`, unicidad lógica `findByExternalId` y hash HMAC)
   *   viven UNA SOLA VEZ aquí en el Servicio y NO se repiten en la capa HTTP.
   * - Si ocurre una condición de carrera concurrente en PostgreSQL (`err.code === '23505'`), se propaga limpio
   *   hasta `errorHandler.js`, que ya traduce centralizadamente `23505` a `ConflictError` 409 `DUPLICATE_TRANSACTION`
   *   sin bloques `try/catch` duplicados dentro del servicio.
   *
   * @param {Object} rawInput Datos crudos de la transacción recibida.
   * @returns {Promise<{ transaction: Object, analysis: Object, anomaly: Object|null }>} Resultado del procesamiento.
   */
  async receive(rawInput) {
    // 1. Homologa las claves del payload de entrada
    const transaction = TransactionService.normalizeInput(rawInput);
    const { idTxn, user, date, value, paymentMethod, hash } = transaction;

    // 2. Validación de reglas de dominio sobre campos, tipos, formato ISO y monto positivo:
    // vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
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

    // 3. Validación de idempotencia/duplicidad de negocio por `idTxn` externo:
    // vive UNA SOLA VEZ aquí (cualquier colisión SQL concurrente `23505` la captura centralmente `errorHandler.js`)
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

    // 4. Verifica disponibilidad del secreto criptográfico HMAC antes de validar la firma
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

    // 5. Ejecuta en memoria la verificación de firma HMAC y el conteo en ventana deslizante por franja horaria
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

    // 6. Si el hash HMAC no coincide con el payload, persiste evidencia forense (`HASH_INVALIDO`) y lanza 400
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

    // 7. Si la firma es legítima, construye metadatos de anomalía solo cuando se superó el umbral de frecuencia
    const anomalyData = analysis.isAnomaly
      ? {
          tipo: analysis.tipo,
          nivel: 'Alto',
          cantidadTransacciones: analysis.transactionCount,
          ventanaSegundos: analysis.ventanaSegundos,
        }
      : null;

    // 8. Persiste la transacción válida con estado `Procesada` y su anomalía asociada (si aplica)
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

    // 9. Registra log diferenciado según si la transacción disparó alerta de ráfaga o fue completamente normal
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

    // 10. Retorna la transacción guardada, el veredicto de `detectAnomaly` y la anomalía generada
    return {
      transaction: savedTransaction,
      analysis,
      anomaly: savedAnomaly,
    };
  }

  /**
   * Genera, firma automáticamente con HMAC válido y procesa una transacción simulada desde la interfaz interactiva
   * para probar en vivo ráfagas de alta frecuencia y umbrales horarios.
   * Se dispara desde `FraudController.simulateTransaction` al recibir `POST /fraud/simulate`.
   *
   * @param {Object} params Datos base de simulación.
   * @param {string} params.user Correo del usuario simulado.
   * @param {number} params.value Monto monetario de la operación.
   * @param {string} [params.paymentMethod='Tarjeta'] Medio de pago simulado.
   * @returns {Promise<{ transaction: Object, analysis: Object, anomaly: Object|null }>} Resultado procesado.
   */
  async simulate({ user, value, paymentMethod }) {
    // Validación de regla de negocio: vive UNA SOLA VEZ aquí en el Servicio y NO se repite en la capa HTTP
    if (!user || !value) {
      throw new ValidationError('user y value son obligatorios');
    }

    // Obtiene el secreto HMAC para firmar legítimamente el evento simulado
    const secret = this.secret || process.env.HMAC_SECRET;
    // Genera un `idTxn` entero único de alta resolución combinando milisegundos actuales + sufijo aleatorio [0..999]
    const idTxn = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    // Obtiene el instante ISO actual desde el reloj inyectado `this.clock()`
    const date = this.clock().toISOString();
    // Construye la carga base sobre la que se calcula el HMAC canónico
    const base = {
      idTxn,
      user,
      date,
      value,
      paymentMethod: paymentMethod || 'Tarjeta',
    };
    // Firma los datos con `generateTransactionHash` de dominio
    const hash = generateTransactionHash(base, secret);

    // Evalúa la transacción simulada contra los umbrales activos en memoria y la ventana deslizante
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

    // Prepara el objeto de anomalía si la simulación superó el umbral de transacciones en la ventana
    const anomalyData = analysis.isAnomaly
      ? {
          tipo: analysis.tipo,
          nivel: 'Alto',
          cantidadTransacciones: analysis.transactionCount,
          ventanaSegundos: analysis.ventanaSegundos,
        }
      : null;

    // Guarda en base de datos la transacción simulada y su posible alerta
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

    // Emite registro informativo de la simulación ejecutada
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

  /**
   * Lista el historial completo de transacciones registradas (con indicador de anomalía unido en SQL).
   * Se dispara desde `FraudController.listTransactions` al recibir `GET /fraud/transactions`.
   *
   * @returns {Promise<Array<Object>>} Arreglo de transacciones ordenadas desde el repositorio.
   */
  async listTransactions() {
    return this.transactionRepository.findAll();
  }

  /**
   * Lista todas las anomalías de fraude y violaciones de hash registradas en el sistema.
   * Se dispara desde `FraudController.listAnomalies` al recibir `GET /fraud/anomalies`.
   *
   * @returns {Promise<Array<Object>>} Arreglo de anomalías registradas.
   */
  async listAnomalies() {
    return this.anomalyRepository.findAll();
  }
}

module.exports = TransactionService;
