const asyncHandler = require('../helpers/asyncHandler');
const { success } = require('../helpers/response');
const weatherSvc = require('../services/weather');

/**
 * @route GET /api/weather  (protected)  ?q=<city|lat,lon>
 * Current weather + 3-day forecast. Defaults to Bangalore.
 */
const getWeather = asyncHandler(async (req, res) => {
  const data = await weatherSvc.getWeather(req.query.q);
  return success(res, { data });
});

module.exports = { getWeather };
