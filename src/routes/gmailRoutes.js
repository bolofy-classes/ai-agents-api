const express = require('express');
const ctrl = require('../controllers/gmailController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// Public browser redirect target.
router.get('/auth/callback', ctrl.oauthCallback);

// Everything else requires an authenticated app user.
router.get('/auth/url', protect, ctrl.getAuthUrl);
router.get('/status', protect, ctrl.getStatus);
router.get('/messages', protect, ctrl.getMessages);
router.post('/sync', protect, ctrl.sync);
router.post('/trash', protect, ctrl.trash);
router.post('/send', protect, ctrl.send);
router.post('/block', protect, ctrl.block);
router.delete('/disconnect', protect, ctrl.disconnect);

module.exports = router;
