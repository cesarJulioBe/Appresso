const { ValidationError } = require('../../../domain/errors');

function validateSimulateTransaction(req, _res, next) {
  const { user, value } = req.body || {};
  if (!user || !value) {
    return next(new ValidationError('user y value son obligatorios'));
  }
  return next();
}

function validateUpdateThreshold(req, _res, next) {
  const { umbralTransacciones, ventanaSegundos } = req.body || {};
  if (!umbralTransacciones || !ventanaSegundos) {
    return next(
      new ValidationError('umbralTransacciones y ventanaSegundos son obligatorios')
    );
  }
  return next();
}

module.exports = {
  validateSimulateTransaction,
  validateUpdateThreshold,
};
