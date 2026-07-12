const User = require('../src/models/User');

const users = [
  {
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'password123',
    role: 'admin',
  },
  {
    name: 'Demo User',
    email: 'user@example.com',
    password: 'password123',
    role: 'user',
  },
];

/**
 * Seed the users collection. Idempotent: skips users that already exist.
 */
async function seedUsers() {
  for (const data of users) {
    const exists = await User.findOne({ email: data.email });
    if (exists) {
      console.log(`↷ Skipped (exists): ${data.email}`);
      continue;
    }
    // Use create() so the pre-save hook hashes the password.
    await User.create(data);
    console.log(`✓ Created: ${data.email}`);
  }
}

module.exports = seedUsers;
