const config = require('../config');
const LinkedInAccount = require('../models/LinkedInAccount');

// LinkedIn uses plain OAuth 2.0 + REST (no SDK), so we talk to it with the
// global fetch (Node 18+). This module isolates all LinkedIn HTTP calls,
// the same way services/google.js isolates the Google client.

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const UGC_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';
const SOCIAL_ACTIONS_URL = 'https://api.linkedin.com/v2/socialActions';

// openid/profile/email → identify the member; w_member_social → post on their behalf.
const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

/**
 * Build the LinkedIn consent URL. `state` carries the app user identity
 * through the redirect so the callback knows who is connecting.
 */
function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.linkedin.clientId,
    redirect_uri: config.linkedin.redirectUri,
    state,
    scope: SCOPES.join(' '),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 * @returns {Promise<{access_token, expires_in, scope, refresh_token?}>}
 */
async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.linkedin.redirectUri,
    client_id: config.linkedin.clientId,
    client_secret: config.linkedin.clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Fetch the connected member's basic profile (OpenID userinfo).
 * @returns {Promise<{sub, name, email}>}
 */
async function getProfile(accessToken) {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn profile fetch failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { sub: data.sub, name: data.name, email: data.email };
}

/**
 * Load a connected account and return a usable access token, or throw a
 * 400 if the user hasn't connected LinkedIn (or the token has expired).
 * Analogous to requireConnected() in gmailController.
 */
async function getAuthorizedAccount(userId) {
  const account = await LinkedInAccount.findOne({ user: userId }).select(
    '+accessToken +refreshToken'
  );
  if (!account || !account.accessToken) {
    const err = new Error('LinkedIn is not connected');
    err.status = 400;
    throw err;
  }
  if (account.expiryDate && account.expiryDate < Date.now()) {
    const err = new Error('LinkedIn session expired — please reconnect');
    err.status = 400;
    throw err;
  }
  return account;
}

/**
 * Publish a plain-text share on behalf of the member.
 * @returns {Promise<{urn, url}>}
 */
async function createTextPost(accessToken, authorSub, text) {
  const payload = {
    author: `urn:li:person:${authorSub}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch(UGC_POSTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LinkedIn post failed (${res.status}): ${detail}`);
  }

  const data = await res.json().catch(() => ({}));
  const urn = data.id || res.headers.get('x-restli-id');
  if (!urn) throw new Error('LinkedIn did not return a post id');

  return { urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
}

/**
 * Fetch like/comment counts for one of the member's own posts.
 * Returns nulls (never throws) so the caller can fall back to manual entry
 * when the app lacks the required social-actions permission.
 * @returns {Promise<{likes:number|null, comments:number|null}>}
 */
async function getPostMetrics(accessToken, urn) {
  try {
    const res = await fetch(`${SOCIAL_ACTIONS_URL}/${encodeURIComponent(urn)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    if (!res.ok) return { likes: null, comments: null };
    const data = await res.json();
    return {
      likes: data?.likesSummary?.totalLikes ?? null,
      comments: data?.commentsSummary?.aggregatedTotalComments ?? null,
    };
  } catch {
    return { likes: null, comments: null };
  }
}

module.exports = {
  SCOPES,
  getAuthUrl,
  exchangeCode,
  getProfile,
  getAuthorizedAccount,
  createTextPost,
  getPostMetrics,
};
