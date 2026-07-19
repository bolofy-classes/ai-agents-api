const mongoose = require('mongoose');

// A connected LinkedIn member for an app user. Mirrors GmailAccount:
// tokens are select:false and stripped from JSON output.
const linkedInAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one connected LinkedIn per app user
    },
    linkedinSub: String, // OpenID `sub` — the member id used to build the author URN
    name: String,
    email: { type: String, trim: true, lowercase: true },
    accessToken: { type: String, select: false },
    refreshToken: { type: String, select: false },
    scope: String,
    expiryDate: Number, // ms epoch
    connectedAt: Date,
  },
  { timestamps: true }
);

linkedInAccountSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject();
  delete obj.accessToken;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('LinkedInAccount', linkedInAccountSchema);
