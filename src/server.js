const app = require('./app');
const connectDB = require('./config/db');
const config = require('./config');
const scheduler = require('./services/scheduler');

async function start() {
  await connectDB();
  await scheduler.start();

  const server = app.listen(config.port, () => {
    console.log(`🚀 Server running in ${config.env} mode on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    server.close(() => process.exit(1));
  });
}

start();
