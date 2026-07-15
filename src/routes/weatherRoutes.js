const express = require('express');
const ctrl = require('../controllers/weatherController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.get('/', protect, ctrl.getWeather);

module.exports = router;
