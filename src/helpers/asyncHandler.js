/**
 * Wrap an async route handler so rejected promises are forwarded to Express
 * error middleware instead of crashing the process.
 * @param {Function} fn
 * @returns {Function}
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
