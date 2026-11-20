const { ValidationError } = require('../../../domain/errors');

function validatePredictSales(req, _res, next) {
  const { salesHistory } = req.body || {};
  if (!Array.isArray(salesHistory) || salesHistory.length < 2) {
    return next(
      new ValidationError('salesHistory debe ser un arreglo con al menos 2 valores')
    );
  }
  return next();
}

module.exports = {
  validatePredictSales,
};
