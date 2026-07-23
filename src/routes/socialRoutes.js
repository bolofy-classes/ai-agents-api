const express = require('express');
const ctrl = require('../controllers/socialController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// Public browser redirect target.
router.get('/linkedin/auth/callback', ctrl.oauthCallback);

// Everything else requires an authenticated app user.
router.get('/linkedin/auth/url', protect, ctrl.getAuthUrl);
router.get('/linkedin/status', protect, ctrl.getStatus);
router.delete('/linkedin/disconnect', protect, ctrl.disconnect);

router.post('/generate', protect, ctrl.generate);
router.get('/analytics', protect, ctrl.analytics);

router.get('/schedule', protect, ctrl.getSchedule);
router.put('/schedule', protect, ctrl.updateSchedule);

router.get('/posts', protect, ctrl.listPosts);
router.post('/posts', protect, ctrl.createPost);
router.put('/posts/:id', protect, ctrl.updatePost);
router.delete('/posts/:id', protect, ctrl.deletePost);
router.post('/posts/:id/publish', protect, ctrl.publishPost);
router.post('/posts/:id/mark-posted', protect, ctrl.markPosted);
router.post('/posts/:id/refresh-metrics', protect, ctrl.refreshMetrics);

module.exports = router;
