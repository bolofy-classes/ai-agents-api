const express = require('express');
const authRoutes = require('./authRoutes');
const gmailRoutes = require('./gmailRoutes');
const agentRoutes = require('./agentRoutes');
const newsRoutes = require('./newsRoutes');
const weatherRoutes = require('./weatherRoutes');
const socialRoutes = require('./socialRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is healthy', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/gmail', gmailRoutes);
router.use('/agent', agentRoutes);
router.use('/news', newsRoutes);
router.use('/weather', weatherRoutes);
router.use('/social', socialRoutes);

module.exports = router;
