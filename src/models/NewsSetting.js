const mongoose = require('mongoose');

// GNews top-headlines categories.
const CATEGORIES = [
  'general',
  'world',
  'nation',
  'business',
  'technology',
  'entertainment',
  'sports',
  'science',
  'health',
];

const newsSettingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one news config per app user
    },
    apiKey: {
      type: String,
      select: false, // per-user GNews key; never returned by default
      trim: true,
    },
    categories: {
      type: [String],
      enum: CATEGORIES,
      default: ['general', 'technology'],
    },
    lang: { type: String, default: 'en', trim: true },
    country: { type: String, default: 'us', trim: true },
    maxArticles: { type: Number, default: 10, min: 1, max: 10 }, // GNews free tier caps at 10
  },
  { timestamps: true }
);

newsSettingSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  // Expose whether a key is set, but never the key itself.
  obj.hasApiKey = Boolean(this.apiKey);
  delete obj.apiKey;
  delete obj.__v;
  return obj;
};

const NewsSetting = mongoose.model('NewsSetting', newsSettingSchema);
NewsSetting.CATEGORIES = CATEGORIES;

module.exports = NewsSetting;
