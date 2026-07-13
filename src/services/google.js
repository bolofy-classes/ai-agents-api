const { google } = require('googleapis');
const config = require('../config');
const GmailAccount = require('../models/GmailAccount');

// Scopes: read Gmail + create Calendar events.
const SCOPES = [
  // modify = read + move to Trash (reversible). Superset of readonly.
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send', // send replies
  'https://www.googleapis.com/auth/gmail.settings.basic', // create filters (block sender)
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

/**
 * Create a bare OAuth2 client from app credentials.
 */
function createOAuthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Build the Google consent URL. `state` carries the app user identity
 * through the redirect so the callback knows who is connecting.
 */
function getAuthUrl(state) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline', // request a refresh token
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange an authorization code for tokens.
 */
async function exchangeCode(code) {
  const client = createOAuthClient();
  const { tokens } = client.getToken ? await client.getToken(code) : {};
  return tokens;
}

/**
 * Return an authorized OAuth2 client for a given app user, loading the
 * stored refresh token and persisting any refreshed access token.
 */
async function getAuthorizedClient(userId) {
  const account = await GmailAccount.findOne({ user: userId }).select(
    '+accessToken +refreshToken'
  );
  if (!account || !account.refreshToken) {
    const err = new Error('Gmail is not connected for this user');
    err.status = 400;
    throw err;
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.expiryDate,
    token_type: account.tokenType,
    scope: account.scope,
  });

  // Persist tokens whenever googleapis refreshes them.
  client.on('tokens', async (tokens) => {
    const update = {};
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.expiry_date) update.expiryDate = tokens.expiry_date;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
    if (Object.keys(update).length) {
      await GmailAccount.updateOne({ user: userId }, { $set: update });
    }
  });

  return client;
}

module.exports = {
  SCOPES,
  createOAuthClient,
  getAuthUrl,
  exchangeCode,
  getAuthorizedClient,
};
