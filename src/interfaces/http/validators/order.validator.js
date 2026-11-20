const { VALID_ORDER_STATUSES } = require('../../../domain/constants/orderStatus');
const { ValidationError } = require('../../../domain/errors');

function validateCreateOrder(req, _res, next) {
  const { customer, products } = req.body || {};
  if (!customer || !products) {
    return next(new ValidationError('customer y products son obligatorios'));
  }
  return next();
}

function validateUpdateOrderStatus(req, _res, next) {
  const { status } = req.body || {};
  if (!VALID_ORDER_STATUSES.includes(status)) {
    return next(new ValidationError('Estado inválido'));
  }
  return next();
}

module.exports = {
  validateCreateOrder,
  validateUpdateOrderStatus,
};
