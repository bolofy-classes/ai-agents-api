const mongoose = require('mongoose');

// One AI-generated post variant for a single platform. A draft becomes
// `posted` either by publishing to LinkedIn via the API, or (X/Instagram)
// by the user marking it posted with the URL they shared it at.
const socialPostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['linkedin', 'x', 'instagram'],
      required: true,
    },
    content: { type: String, required: true },
    prompt: String, // the original query that generated this post
    // Image posts (e.g. from the Memes Generator). Default keeps text posts unchanged.
    mediaCategory: { type: String, enum: ['none', 'image'], default: 'none' },
    imageUrl: String, // optional hosted URL; LinkedIn stores the asset itself
    status: {
      type: String,
      enum: ['draft', 'posted'],
      default: 'draft',
    },
    postUrl: String,
    postUrn: String, // LinkedIn share/ugcPost URN, used to fetch metrics
    postedAt: Date,
    metrics: {
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

socialPostSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('SocialPost', socialPostSchema);
