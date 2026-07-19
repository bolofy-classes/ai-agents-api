require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwt: {
    secret: process.env.JWT_SECRET || 'insecure_dev_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
  weather: {
    apiKey: process.env.WEATHER_API_KEY,
    defaultLocation: process.env.WEATHER_DEFAULT_LOCATION || 'Bangalore',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/gmail/auth/callback',
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri:
      process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5000/api/social/linkedin/auth/callback',
  },
  webAppUrl: process.env.WEB_APP_URL || 'http://localhost:5174',
};

if (!config.mongoUri) {
  throw new Error('MONGO_URI is not defined in environment variables');
}

module.exports = config;
