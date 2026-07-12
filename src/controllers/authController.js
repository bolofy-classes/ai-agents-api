const User = require('../models/User');
const { signToken } = require('../helpers/jwt');
const { success, error } = require('../helpers/response');
const asyncHandler = require('../helpers/asyncHandler');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return error(res, { message: 'name, email and password are required', status: 400 });
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    return error(res, { message: 'Email already registered', status: 409 });
  }

  const user = await User.create({ name, email, password, role });
  const token = signToken({ id: user._id, role: user.role });

  return success(res, {
    status: 201,
    message: 'User registered successfully',
    data: { user, token },
  });
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return a JWT
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return error(res, { message: 'email and password are required', status: 400 });
  }

  // password has select:false, so explicitly include it
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return error(res, { message: 'Invalid credentials', status: 401 });
  }

  if (!user.isActive) {
    return error(res, { message: 'Account is disabled', status: 403 });
  }

  const token = signToken({ id: user._id, role: user.role });

  return success(res, {
    message: 'Login successful',
    data: { user, token },
  });
});

/**
 * @route   GET /api/auth/me
 * @desc    Get the currently authenticated user
 * @access  Private
 */
const me = asyncHandler(async (req, res) => {
  return success(res, { data: { user: req.user } });
});

module.exports = { register, login, me };
