const { ValidationError } = require('../../../domain/errors');

function validateCalculateRoute(req, _res, next) {
  const { from, to } = req.query || {};
  if (!from || !to) {
    return next(new ValidationError('from y to son obligatorios'));
  }
  return next();
}

function validateCreateRoute(req, _res, next) {
  const { origin, destination, distanceKm } = req.body || {};
  if (!origin || !destination || !distanceKm) {
    return next(new ValidationError('origin, destination y distanceKm son obligatorios'));
  }
  return next();
}

module.exports = {
  validateCalculateRoute,
  validateCreateRoute,
};
