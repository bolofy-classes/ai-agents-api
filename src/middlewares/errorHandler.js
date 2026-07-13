const { error } = require('../helpers/response');
const config = require('../config');

// 404 handler for unmatched routes.
function notFound(req, res, next) {
  return error(res, { message: `Route not found: ${req.originalUrl}`, status: 404 });
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let errors = null;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    status = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // Duplicate key error
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = `Duplicate value for field: ${field}`;
  }

  // Log full stack only for genuine server errors (5xx). Handled client
  // errors (4xx, e.g. "Gmail is not connected") are expected — log a concise
  // line so the terminal doesn't look like the server crashed.
  if (status >= 500) {
    console.error(err);
  } else if (config.env === 'development') {
    console.warn(`↩ ${status} ${req.method} ${req.originalUrl} — ${message}`);
  }

  return error(res, { message, status, errors });
}

module.exports = { notFound, errorHandler };
