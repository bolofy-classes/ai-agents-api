require('dotenv').config();

// migrate-mongo configuration.
// See https://github.com/seppevs/migrate-mongo
const config = {
  mongodb: {
    url: process.env.MONGO_URI,
    // Database name is taken from the connection string when omitted.
    options: {},
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};

module.exports = config;
