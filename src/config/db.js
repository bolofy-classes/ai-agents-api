const mongoose = require('mongoose');
const config = require('./index');

/**
 * Establish a connection to MongoDB using Mongoose.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDB() {
  mongoose.set('strictQuery', true);

  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error(`❌ MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = connectDB;
