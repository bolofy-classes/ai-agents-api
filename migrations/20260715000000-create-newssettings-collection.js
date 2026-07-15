/**
 * Migration: create the `newssettings` collection with a unique
 * index on the owning app user.
 */
module.exports = {
  async up(db) {
    const collections = await db.listCollections({ name: 'newssettings' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('newssettings');
    }
    await db.collection('newssettings').createIndex({ user: 1 }, { unique: true });
  },

  async down(db) {
    await db.collection('newssettings').drop();
  },
};
