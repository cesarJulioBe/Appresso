class AppError extends Error {
  constructor(message, { statusCode = 500, code = null, details = null, payload = null, resultTag = null } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.payload = payload;
    this.resultTag = resultTag;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, { statusCode: 400, ...options });
  }
}

class NotFoundError extends AppError {
  constructor(message, options = {}) {
    super(message, { statusCode: 404, ...options });
  }
}

class ConflictError extends AppError {
  constructor(message, options = {}) {
    super(message, { statusCode: 409, ...options });
  }
}

class ConfigurationError extends AppError {
  constructor(message, options = {}) {
    super(message, { statusCode: 500, ...options });
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ConfigurationError,
};
