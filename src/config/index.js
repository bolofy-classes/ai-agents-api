require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure_dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
};

if (!config.mongoUri) {
  throw new Error('MONGO_URI is not defined in environment variables');
}

module.exports = config;
