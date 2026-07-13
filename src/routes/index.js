const express = require('express');
const authRoutes = require('./authRoutes');
const gmailRoutes = require('./gmailRoutes');
const agentRoutes = require('./agentRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API is healthy', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/gmail', gmailRoutes);
router.use('/agent', agentRoutes);

module.exports = router;
