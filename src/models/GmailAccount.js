const mongoose = require('mongoose');

// Cached copy of a Gmail message so the dashboard/list can read fast
// without hitting the Gmail API on every render.
const cachedMessageSchema = new mongoose.Schema(
  {
    gmailId: String,
    threadId: String,
    from: String,
    to: String,
    subject: String,
    snippet: String,
    date: Date,
    unread: Boolean,
    summary: String, // AI one-liner, filled on demand
  },
  { _id: false }
);

const gmailAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one connected Gmail per app user
    },
    gmailEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    tokenType: { type: String, default: 'Bearer' },
    scope: String,
    expiryDate: Number, // ms epoch
    lastSyncedAt: Date,
    messages: [cachedMessageSchema],
  },
  { timestamps: true }
);

gmailAccountSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.accessToken;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('GmailAccount', gmailAccountSchema);
