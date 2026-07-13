/**
 * Migration: create the `gmailaccounts` collection with a unique
 * index on the owning app user.
 */
module.exports = {
  async up(db) {
    const collections = await db.listCollections({ name: 'gmailaccounts' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('gmailaccounts');
    }
    await db.collection('gmailaccounts').createIndex({ user: 1 }, { unique: true });
  },

  async down(db) {
    await db.collection('gmailaccounts').drop();
  },
};
