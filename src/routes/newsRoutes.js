const express = require('express');
const ctrl = require('../controllers/newsController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.use(protect);
router.get('/settings', ctrl.getSettings);
router.put('/settings', ctrl.saveSettings);
router.post('/summarize', ctrl.summarize);
router.get('/', ctrl.getNews);

module.exports = router;
