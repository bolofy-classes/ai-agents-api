/**
 * Standardized success response.
 */
function success(res, { data = null, message = 'Success', status = 200 } = {}) {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
}

/**
 * Standardized error response.
 */
function error(res, { message = 'Something went wrong', status = 500, errors = null } = {}) {
  return res.status(status).json({
    success: false,
    message,
    errors,
  });
}

module.exports = { success, error };
