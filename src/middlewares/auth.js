const { verifyToken } = require('../helpers/jwt');
const { error } = require('../helpers/response');
const User = require('../models/User');

/**
 * Protect routes: requires a valid Bearer token and attaches req.user.
 */
async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return error(res, { message: 'Not authorized, no token', status: 401 });
    }

    const token = header.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return error(res, { message: 'Not authorized, user unavailable', status: 401 });
    }

    req.user = user;
    return next();
  } catch (err) {
    return error(res, { message: 'Not authorized, token failed', status: 401 });
  }
}

/**
 * Restrict a route to specific roles. Use after `protect`.
 * @param  {...string} roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return error(res, { message: 'Forbidden: insufficient permissions', status: 403 });
    }
    return next();
  };
}

module.exports = { protect, authorize };
