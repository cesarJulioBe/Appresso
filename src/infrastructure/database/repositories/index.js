/**
 * ============================================================================
 * ARCHIVO: src/infrastructure/database/repositories/index.js
 * CAPA: Infraestructura — Punto Único de Re-exportación (*Barrel File*)
 * ============================================================================
 * RESPONSABILIDAD ÚNICA (SRP):
 *   Agrupar y exportar los 8 repositorios SQL activos del sistema unificado
 *   para inyectarlos limpiamente desde `src/container.js`.
 * ============================================================================
 */

const OrderRepository = require('./OrderRepository');
const RouteRepository = require('./RouteRepository');
const UserRepository = require('./UserRepository');
const TransactionRepository = require('./TransactionRepository');
const AnomalyRepository = require('./AnomalyRepository');
const ThresholdRepository = require('./ThresholdRepository');
const CatalogRepository = require('./CatalogRepository');
const BillingRepository = require('./BillingRepository');

module.exports = {
  OrderRepository,
  RouteRepository,
  UserRepository,
  TransactionRepository,
  AnomalyRepository,
  ThresholdRepository,
  CatalogRepository,
  BillingRepository,
};
