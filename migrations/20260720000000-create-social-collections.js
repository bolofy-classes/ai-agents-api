/**
 * Migration: create the `linkedinaccounts` and `socialposts` collections
 * for the Social Media feature, with their indexes.
 */
module.exports = {
  async up(db) {
    const linkedin = await db.listCollections({ name: 'linkedinaccounts' }).toArray();
    if (linkedin.length === 0) {
      await db.createCollection('linkedinaccounts');
    }
    await db.collection('linkedinaccounts').createIndex({ user: 1 }, { unique: true });

    const posts = await db.listCollections({ name: 'socialposts' }).toArray();
    if (posts.length === 0) {
      await db.createCollection('socialposts');
    }
    await db.collection('socialposts').createIndex({ user: 1, createdAt: -1 });
  },

  async down(db) {
    await db.collection('linkedinaccounts').drop();
    await db.collection('socialposts').drop();
  },
};
