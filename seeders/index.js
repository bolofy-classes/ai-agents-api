const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const seedUsers = require('./users.seeder');

/**
 * Run all seeders in order.
 */
async function run() {
  await connectDB();

  try {
    console.log('🌱 Seeding database...');
    await seedUsers();
    console.log('✅ Seeding complete.');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    process.exit(process.exitCode || 0);
  }
}

run();
