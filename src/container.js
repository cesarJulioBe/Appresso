const config = require('./config/env');
const defaultDb = require('./infrastructure/database/connection');
const defaultLogger = require('./infrastructure/logging/logger');

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

const ActionStack = require('./domain/delivery/ActionStack');
const SlidingWindow = require('./domain/fraud/SlidingWindow');

const OrderService = require('./application/orders/OrderService');
const QueueService = require('./application/delivery/QueueService');
const RouteService = require('./application/delivery/RouteService');
const AnalyticsService = require('./application/analytics/AnalyticsService');
const TransactionService = require('./application/fraud/TransactionService');
const FraudReportService = require('./application/fraud/FraudReportService');
const ThresholdService = require('./application/fraud/ThresholdService');
const OperationalService = require('./application/operational/OperationalService');
const DataQualityService = require('./application/quality/DataQualityService');
const BenchmarkService = require('./application/analytics/BenchmarkService');
const AiService = require('./application/ai/AiService');

const OrderController = require('./interfaces/http/controllers/OrderController');
const QueueController = require('./interfaces/http/controllers/QueueController');
const DeliveryController = require('./interfaces/http/controllers/DeliveryController');
const AnalyticsController = require('./interfaces/http/controllers/AnalyticsController');
const FraudController = require('./interfaces/http/controllers/FraudController');
const OperationalController = require('./interfaces/http/controllers/OperationalController');

function buildContainer({
  db = defaultDb,
  logger = defaultLogger,
  secret = config.hmacSecret,
  timeZone = config.timezone,
  clock = () => new Date(),
  repositories: customRepositories = {},
} = {}) {
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

  // Estado compartido en memoria (pila de acciones para deshacer y ventana deslizante de fraude)
  const actionStack = new ActionStack();
  const slidingWindow = new SlidingWindow();

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

  const services = {
    orderService: new OrderService({
      orderRepository: repositories.orderRepository,
      actionStack,
      logger: childLogger('OrderService'),
    }),
    queueService: new QueueService({
      orderRepository: repositories.orderRepository,
      actionStack,
      logger: childLogger('QueueService'),
    }),
    routeService: new RouteService({
      routeRepository: repositories.routeRepository,
      logger: childLogger('RouteService'),
    }),
    analyticsService: new AnalyticsService({
      orderRepository: repositories.orderRepository,
      logger: childLogger('AnalyticsService'),
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

  const controllers = {
    orderController: new OrderController({ orderService: services.orderService }),
    queueController: new QueueController({ queueService: services.queueService }),
    deliveryController: new DeliveryController({ routeService: services.routeService }),
    analyticsController: new AnalyticsController({ analyticsService: services.analyticsService }),
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
    actionStack,
    slidingWindow,
    repositories,
    services,
    controllers,
  };
}

module.exports = {
  buildContainer,
};
