const express = require('express');
const ctrl = require('../controllers/agentController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.use(protect);
router.post('/summarize', ctrl.summarize);
router.post('/analyze', ctrl.analyze);
router.post('/reply', ctrl.reply);
router.post('/schedule', ctrl.schedule);
router.post('/suggest-delete', ctrl.suggestDelete);

module.exports = router;
