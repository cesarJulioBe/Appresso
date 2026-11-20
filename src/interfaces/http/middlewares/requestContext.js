const crypto = require('crypto');
const { runWithContext } = require('../../../infrastructure/logging/requestContext');

function requestContextMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0
      ? incomingId.trim()
      : crypto.randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  runWithContext({ requestId }, () => {
    next();
  });
}

module.exports = requestContextMiddleware;
