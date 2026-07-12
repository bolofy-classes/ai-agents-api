/**
 * Migration: create the `users` collection with schema validation
 * and a unique index on email.
 */
module.exports = {
  async up(db) {
    const collections = await db.listCollections({ name: 'users' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'email', 'password'],
            properties: {
              name: { bsonType: 'string' },
              email: { bsonType: 'string' },
              password: { bsonType: 'string' },
              role: { enum: ['user', 'admin'] },
              isActive: { bsonType: 'bool' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
            },
          },
        },
      });
    }

    await db.collection('users').createIndex({ email: 1 }, { unique: true });
  },

  async down(db) {
    await db.collection('users').drop();
  },
};
