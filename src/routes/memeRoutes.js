const express = require('express');
const ctrl = require('../controllers/memeController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/captions', protect, ctrl.suggestCaptions);
router.post('/image', protect, ctrl.generateImage);
router.post('/post', protect, ctrl.postMeme);

module.exports = router;
