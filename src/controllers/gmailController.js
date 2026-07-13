const asyncHandler = require('../helpers/asyncHandler');
const { success, error } = require('../helpers/response');
const { signToken, verifyToken } = require('../helpers/jwt');
const config = require('../config');
const googleSvc = require('../services/google');
const gmailSvc = require('../services/gmail');
const agentSvc = require('../services/agent');
const GmailAccount = require('../models/GmailAccount');

async function requireConnected(userId) {
  const account = await GmailAccount.findOne({ user: userId }).select('+refreshToken');
  if (!account || !account.refreshToken) {
    const err = new Error('Gmail is not connected');
    err.status = 400;
    throw err;
  }
  return account;
}

/**
 * @route GET /api/gmail/auth/url  (protected)
 * Return the Google consent URL for the current user.
 */
const getAuthUrl = asyncHandler(async (req, res) => {
  if (!config.google.clientId) {
    return error(res, { message: 'Google OAuth is not configured', status: 500 });
  }
  // Short-lived state token identifies the user on callback.
  const state = signToken({ id: req.user._id, purpose: 'gmail_oauth' });
  const url = googleSvc.getAuthUrl(state);
  return success(res, { data: { url } });
});

/**
 * @route GET /api/gmail/auth/callback  (public, browser redirect)
 * Exchange the code for tokens, persist them, redirect back to the web app.
 */
const oauthCallback = asyncHandler(async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const redirect = (status) => res.redirect(`${config.webAppUrl}/?gmail=${status}`);

  if (oauthError || !code || !state) return redirect('error');

  let userId;
  try {
    userId = verifyToken(state).id;
  } catch {
    return redirect('error');
  }

  const client = googleSvc.createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const gmailEmail = await gmailSvc.getProfileEmail(client);

  await GmailAccount.findOneAndUpdate(
    { user: userId },
    {
      user: userId,
      gmailEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      expiryDate: tokens.expiry_date,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return redirect('connected');
});

/**
 * @route GET /api/gmail/status  (protected)
 */
const getStatus = asyncHandler(async (req, res) => {
  const account = await GmailAccount.findOne({ user: req.user._id });
  return success(res, {
    data: {
      connected: Boolean(account && account.gmailEmail),
      gmailEmail: account?.gmailEmail || null,
      lastSyncedAt: account?.lastSyncedAt || null,
    },
  });
});

/**
 * @route POST /api/gmail/sync  (protected)
 * Pull recent inbox messages from Gmail and cache them.
 */
const sync = asyncHandler(async (req, res) => {
  const account = await GmailAccount.findOne({ user: req.user._id }).select('+refreshToken');
  if (!account || !account.refreshToken) {
    return error(res, { message: 'Gmail is not connected', status: 400 });
  }

  // How many to pull: ?max=… (or body.max), default 25, capped at 100.
  const requested = Number(req.query.max ?? req.body?.max ?? 25);
  const max = Math.min(Math.max(Number.isFinite(requested) ? requested : 25, 1), 100);

  const messages = await gmailSvc.listRecentMessages(req.user._id, max);

  // Preserve any AI summaries we already computed for these messages.
  const prev = new Map((account.messages || []).map((m) => [m.gmailId, m.summary]));
  account.messages = messages.map((m) => ({ ...m, summary: prev.get(m.gmailId) || '' }));
  account.lastSyncedAt = new Date();
  await account.save();

  return success(res, {
    message: 'Inbox synced',
    data: { messages: account.messages, lastSyncedAt: account.lastSyncedAt },
  });
});

/**
 * @route GET /api/gmail/messages  (protected)
 * Return cached messages (fast; used by dashboard + list).
 */
const getMessages = asyncHandler(async (req, res) => {
  const account = await GmailAccount.findOne({ user: req.user._id });
  return success(res, {
    data: {
      connected: Boolean(account),
      messages: account?.messages || [],
      lastSyncedAt: account?.lastSyncedAt || null,
    },
  });
});

/**
 * @route POST /api/gmail/trash  (protected)  { gmailIds: [] }
 * Move messages to Gmail Trash and drop them from the cache.
 */
const trash = asyncHandler(async (req, res) => {
  const { gmailIds } = req.body;
  if (!Array.isArray(gmailIds) || gmailIds.length === 0) {
    return error(res, { message: 'gmailIds (non-empty array) is required', status: 400 });
  }

  const account = await GmailAccount.findOne({ user: req.user._id }).select('+refreshToken');
  if (!account || !account.refreshToken) {
    return error(res, { message: 'Gmail is not connected', status: 400 });
  }

  const result = await gmailSvc.trashMessages(req.user._id, gmailIds);

  // Remove successfully trashed messages from the cache.
  if (result.trashed.length) {
    const gone = new Set(result.trashed);
    account.messages = (account.messages || []).filter((m) => !gone.has(m.gmailId));
    await account.save();
  }

  return success(res, {
    message: `Moved ${result.trashed.length} email(s) to Trash`,
    data: { ...result, messages: account.messages },
  });
});

/**
 * @route POST /api/gmail/send  (protected)  { gmailId, body? }
 * Send a reply on the thread. If `body` is omitted, the AI drafts one.
 */
const send = asyncHandler(async (req, res) => {
  const { gmailId, body } = req.body;
  if (!gmailId) return error(res, { message: 'gmailId is required', status: 400 });

  await requireConnected(req.user._id);

  let replyBody = body;
  if (!replyBody || !replyBody.trim()) {
    const full = await gmailSvc.getMessageBody(req.user._id, gmailId);
    replyBody = await agentSvc.draftReply(full);
  }

  const result = await gmailSvc.sendReply(req.user._id, gmailId, replyBody);
  return success(res, { message: 'Reply sent', data: { ...result, body: replyBody } });
});

/**
 * @route POST /api/gmail/block  (protected)  { gmailId }
 * Create a filter that auto-trashes future mail from the sender, and
 * trash the current message.
 */
const block = asyncHandler(async (req, res) => {
  const { gmailId } = req.body;
  if (!gmailId) return error(res, { message: 'gmailId is required', status: 400 });

  const account = await requireConnected(req.user._id);
  const { fromEmail, filterId } = await gmailSvc.blockSender(req.user._id, gmailId);

  // Trash the current message and drop it from the cache.
  await gmailSvc.trashMessages(req.user._id, [gmailId]);
  account.messages = (account.messages || []).filter((m) => m.gmailId !== gmailId);
  await account.save();

  return success(res, {
    message: `Blocked ${fromEmail}`,
    data: { fromEmail, filterId, messages: account.messages },
  });
});

/**
 * @route DELETE /api/gmail/disconnect  (protected)
 */
const disconnect = asyncHandler(async (req, res) => {
  await GmailAccount.deleteOne({ user: req.user._id });
  return success(res, { message: 'Gmail disconnected' });
});

module.exports = {
  getAuthUrl,
  oauthCallback,
  getStatus,
  sync,
  getMessages,
  trash,
  send,
  block,
  disconnect,
};
