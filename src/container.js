/**
 * ============================================================================
 * ARCHIVO: src/container.js
 * CAPA: Raíz de Composición (Composition Root — Inyección de Dependencias)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP) Y PRINCIPIO DE INVERSIÓN DE DEPENDENCIAS (DIP):
 *   Ser el ÚNICO archivo de toda la aplicación que instancia y conecta entre sí
 *   las piezas concretas del sistema:
 *     1. Los 8 Repositorios SQL (`src/infrastructure/database/repositories/`)
 *     2. La ventana deslizante en memoria (`SlidingWindow`)
 *     3. Los 8 Servicios de Casos de Uso (`src/application/`)
 *     4. Los 3 Controladores HTTP (`DeliveryController`, `FraudController` y
 *        `OperationalController`)
 * ============================================================================
 */

const config = require('./config/env');
const defaultDb = require('./infrastructure/database/connection');
const defaultLogger = require('./infrastructure/logging/logger');

// Importación de los 8 repositorios SQL activos (Capa de Infraestructura)
const {
  OrderRepository,
  RouteRepository,
  UserRepository,
  TransactionRepository,
  AnomalyRepository,
  ThresholdRepository,
  CatalogRepository,
  BillingRepository,
} = require('./infrastructure/database/repositories');

// Estructura en memoria O(1) amortizado que rastrea ráfagas de transacciones por usuario
const SlidingWindow = require('./domain/fraud/SlidingWindow');

// Importación de los 8 Servicios de Casos de Uso (Capa de Aplicación)
const RouteService = require('./application/delivery/RouteService');
const TransactionService = require('./application/fraud/TransactionService');
const FraudReportService = require('./application/fraud/FraudReportService');
const ThresholdService = require('./application/fraud/ThresholdService');
const OperationalService = require('./application/operational/OperationalService');
const DataQualityService = require('./application/quality/DataQualityService');
const BenchmarkService = require('./application/analytics/BenchmarkService');
const AiService = require('./application/ai/AiService');

// Importación de los 3 Controladores HTTP (Capa de Interfaces)
const DeliveryController = require('./interfaces/http/controllers/DeliveryController');
const FraudController = require('./interfaces/http/controllers/FraudController');
const OperationalController = require('./interfaces/http/controllers/OperationalController');

/**
 * Construye y cablea todo el grafo de objetos del backend.
 */
function buildContainer({
  db = defaultDb,
  logger = defaultLogger,
  secret = config.hmacSecret,
  timeZone = config.timezone,
  clock = () => new Date(),
  repositories: customRepositories = {},
} = {}) {
  // 1. CAPA DE INFRAESTRUCTURA: Instanciamos cada repositorio pasándole el pool `db`
  const repositories = {
    orderRepository: customRepositories.orderRepository || new OrderRepository({ db }),
    routeRepository: customRepositories.routeRepository || new RouteRepository({ db }),
    userRepository: customRepositories.userRepository || new UserRepository({ db }),
    transactionRepository:
      customRepositories.transactionRepository || new TransactionRepository({ db }),
    anomalyRepository: customRepositories.anomalyRepository || new AnomalyRepository({ db }),
    thresholdRepository:
      customRepositories.thresholdRepository || new ThresholdRepository({ db }),
    catalogRepository: customRepositories.catalogRepository || new CatalogRepository({ db }),
    billingRepository: customRepositories.billingRepository || new BillingRepository({ db }),
  };

  // 2. ESTADO EN MEMORIA COMPARTIDO: Ventana móvil de timestamps por correo electrónico
  const slidingWindow = new SlidingWindow();

  // Helper que etiqueta los logs con el nombre del servicio emisor
  const childLogger = (mod) => (typeof logger.child === 'function' ? logger.child(mod) : logger);

  const thresholdService = new ThresholdService({
    thresholdRepository: repositories.thresholdRepository,
    logger: childLogger('ThresholdService'),
  });

  const aiService = new AiService({
    userRepository: repositories.userRepository,
    orderRepository: repositories.orderRepository,
    billingRepository: repositories.billingRepository,
    transactionRepository: repositories.transactionRepository,
    logger: childLogger('AiService'),
  });

  const operationalService = new OperationalService({
    userRepository: repositories.userRepository,
    catalogRepository: repositories.catalogRepository,
    orderRepository: repositories.orderRepository,
    billingRepository: repositories.billingRepository,
    aiService,
    secret,
    logger: childLogger('OperationalService'),
  });

  const dataQualityService = new DataQualityService({
    userRepository: repositories.userRepository,
    catalogRepository: repositories.catalogRepository,
    billingRepository: repositories.billingRepository,
    db,
    logger: childLogger('DataQualityService'),
  });

  const benchmarkService = new BenchmarkService({
    orderRepository: repositories.orderRepository,
    billingRepository: repositories.billingRepository,
    transactionRepository: repositories.transactionRepository,
    catalogRepository: repositories.catalogRepository,
    logger: childLogger('BenchmarkService'),
  });

  // 3. CAPA DE APLICACIÓN
  const services = {
    routeService: new RouteService({
      routeRepository: repositories.routeRepository,
      logger: childLogger('RouteService'),
    }),
    thresholdService,
    transactionService: new TransactionService({
      userRepository: repositories.userRepository,
      transactionRepository: repositories.transactionRepository,
      anomalyRepository: repositories.anomalyRepository,
      thresholdService,
      slidingWindow,
      secret,
      timeZone,
      clock,
      logger: childLogger('TransactionService'),
    }),
    fraudReportService: new FraudReportService({
      transactionRepository: repositories.transactionRepository,
      anomalyRepository: repositories.anomalyRepository,
      logger: childLogger('FraudReportService'),
    }),
    operationalService,
    dataQualityService,
    benchmarkService,
    aiService,
  };

  // 4. CAPA DE INTERFACES HTTP
  const controllers = {
    deliveryController: new DeliveryController({ routeService: services.routeService }),
    fraudController: new FraudController({
      transactionService: services.transactionService,
      fraudReportService: services.fraudReportService,
      thresholdService: services.thresholdService,
    }),
    operationalController: new OperationalController({
      operationalService: services.operationalService,
      dataQualityService: services.dataQualityService,
      benchmarkService: services.benchmarkService,
      aiService: services.aiService,
    }),
  };

  return {
    db,
    logger,
    slidingWindow,
    repositories,
    services,
    controllers,
  };
}

module.exports = {
  buildContainer,
};
