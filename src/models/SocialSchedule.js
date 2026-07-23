const mongoose = require('mongoose');

// One auto-posting cron job per user. When `enabled`, the scheduler runs
// this cron expression, generates a post from `topic` (or today's top news
// headline when `topic` is blank), and either auto-publishes (LinkedIn,
// when `autoPublish` is on) or saves it as a draft for manual review.
const socialScheduleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    enabled: { type: Boolean, default: false },
    cron: { type: String, default: '0 9 * * *', trim: true }, // default: daily at 09:00 server time
    platform: {
      type: String,
      enum: ['linkedin', 'x', 'instagram'],
      default: 'linkedin',
    },
    topic: { type: String, trim: true, default: '' }, // blank => use today's top news headline
    footer: { type: String, trim: true, default: '' }, // inserted just above the hashtags on every generated post
    autoPublish: { type: Boolean, default: true }, // LinkedIn only; other platforms always save as draft
    lastRunAt: Date,
    lastResult: String,
  },
  { timestamps: true }
);

socialScheduleSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('SocialSchedule', socialScheduleSchema);
