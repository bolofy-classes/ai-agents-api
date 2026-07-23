const cron = require('node-cron');
const asyncHandler = require('../helpers/asyncHandler');
const { success, error } = require('../helpers/response');
const { signToken, verifyToken } = require('../helpers/jwt');
const config = require('../config');
const agentSvc = require('../services/agent');
const linkedinSvc = require('../services/linkedin');
const schedulerSvc = require('../services/scheduler');
const LinkedInAccount = require('../models/LinkedInAccount');
const SocialPost = require('../models/SocialPost');
const SocialSchedule = require('../models/SocialSchedule');

// LinkedIn access tokens are typically valid for ~60 days.
const DEFAULT_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// LinkedIn connection
// ---------------------------------------------------------------------------

/**
 * @route GET /api/social/linkedin/auth/url  (protected)
 */
const getAuthUrl = asyncHandler(async (req, res) => {
  if (!config.linkedin.clientId) {
    return error(res, { message: 'LinkedIn OAuth is not configured', status: 500 });
  }
  const state = signToken({ id: req.user._id, purpose: 'linkedin_oauth' });
  return success(res, { data: { url: linkedinSvc.getAuthUrl(state) } });
});

/**
 * @route GET /api/social/linkedin/auth/callback  (public, browser redirect)
 */
const oauthCallback = asyncHandler(async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const redirect = (status) => res.redirect(`${config.webAppUrl}/?linkedin=${status}`);

  if (oauthError || !code || !state) return redirect('error');

  let userId;
  try {
    const decoded = verifyToken(state);
    if (decoded.purpose !== 'linkedin_oauth') return redirect('error');
    userId = decoded.id;
  } catch {
    return redirect('error');
  }

  try {
    const tokens = await linkedinSvc.exchangeCode(code);
    const profile = await linkedinSvc.getProfile(tokens.access_token);

    await LinkedInAccount.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        linkedinSub: profile.sub,
        name: profile.name,
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
        expiryDate: Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : DEFAULT_TOKEN_TTL_MS),
        connectedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return redirect('connected');
  } catch {
    return redirect('error');
  }
});

/**
 * @route GET /api/social/linkedin/status  (protected)
 */
const getStatus = asyncHandler(async (req, res) => {
  const account = await LinkedInAccount.findOne({ user: req.user._id });
  return success(res, {
    data: {
      connected: Boolean(account && account.linkedinSub),
      name: account?.name || null,
      email: account?.email || null,
      connectedAt: account?.connectedAt || null,
    },
  });
});

/**
 * @route DELETE /api/social/linkedin/disconnect  (protected)
 */
const disconnect = asyncHandler(async (req, res) => {
  await LinkedInAccount.deleteOne({ user: req.user._id });
  return success(res, { message: 'LinkedIn disconnected' });
});

// ---------------------------------------------------------------------------
// Generation + drafts
// ---------------------------------------------------------------------------

/**
 * @route POST /api/social/generate  (protected)  { query }
 * Generate platform variants. Does NOT persist anything.
 */
const generate = asyncHandler(async (req, res) => {
  const query = (req.body?.query || '').trim();
  if (!query) return error(res, { message: 'query is required', status: 400 });

  const schedule = await SocialSchedule.findOne({ user: req.user._id }).select('footer');
  const posts = await agentSvc.generateSocialPosts(query, schedule?.footer);
  return success(res, { message: 'Posts generated', data: { query, posts } });
});

/**
 * @route GET /api/social/posts  (protected)  ?status=draft|posted
 */
const listPosts = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const posts = await SocialPost.find(filter).sort({ createdAt: -1 });
  return success(res, { data: { posts } });
});

/**
 * @route POST /api/social/posts  (protected)  { platform, content, prompt? }
 * Save a draft.
 */
const createPost = asyncHandler(async (req, res) => {
  const { platform, content, prompt } = req.body || {};
  if (!['linkedin', 'x', 'instagram'].includes(platform)) {
    return error(res, { message: 'platform must be linkedin, x, or instagram', status: 400 });
  }
  if (!content || !content.trim()) {
    return error(res, { message: 'content is required', status: 400 });
  }

  const post = await SocialPost.create({
    user: req.user._id,
    platform,
    content: content.trim(),
    prompt: prompt || '',
  });
  return success(res, { message: 'Draft saved', status: 201, data: { post } });
});

/**
 * Load a post owned by the current user, or throw 404.
 */
async function findOwnedPost(userId, id) {
  const post = await SocialPost.findOne({ _id: id, user: userId });
  if (!post) {
    const err = new Error('Post not found');
    err.status = 404;
    throw err;
  }
  return post;
}

/**
 * @route PUT /api/social/posts/:id  (protected)
 * Edit content / metrics / postUrl / status.
 */
const updatePost = asyncHandler(async (req, res) => {
  const post = await findOwnedPost(req.user._id, req.params.id);
  const { content, postUrl, status, metrics } = req.body || {};

  if (typeof content === 'string') post.content = content.trim();
  if (typeof postUrl === 'string') post.postUrl = postUrl.trim();
  if (status && ['draft', 'posted'].includes(status)) post.status = status;
  if (metrics && typeof metrics === 'object') {
    if (metrics.likes != null) post.metrics.likes = Number(metrics.likes) || 0;
    if (metrics.comments != null) post.metrics.comments = Number(metrics.comments) || 0;
    if (metrics.impressions != null) post.metrics.impressions = Number(metrics.impressions) || 0;
  }

  await post.save();
  return success(res, { message: 'Post updated', data: { post } });
});

/**
 * @route DELETE /api/social/posts/:id  (protected)
 */
const deletePost = asyncHandler(async (req, res) => {
  await findOwnedPost(req.user._id, req.params.id);
  await SocialPost.deleteOne({ _id: req.params.id, user: req.user._id });
  return success(res, { message: 'Post deleted' });
});

/**
 * @route POST /api/social/posts/:id/publish  (protected)
 * Publish a LinkedIn post via the API.
 */
const publishPost = asyncHandler(async (req, res) => {
  const post = await findOwnedPost(req.user._id, req.params.id);

  if (post.platform !== 'linkedin') {
    return error(res, {
      message: 'Only LinkedIn posts can be published automatically. Use "Mark as posted" for X/Instagram.',
      status: 400,
    });
  }
  if (post.status === 'posted') {
    return error(res, { message: 'This post has already been published', status: 400 });
  }

  const account = await linkedinSvc.getAuthorizedAccount(req.user._id);
  const { urn, url } = await linkedinSvc.createTextPost(
    account.accessToken,
    account.linkedinSub,
    post.content
  );

  post.status = 'posted';
  post.postUrn = urn;
  post.postUrl = url;
  post.postedAt = new Date();
  await post.save();

  return success(res, { message: 'Published to LinkedIn', data: { post } });
});

/**
 * @route POST /api/social/posts/:id/mark-posted  (protected)  { postUrl }
 * Manual flow for X / Instagram.
 */
const markPosted = asyncHandler(async (req, res) => {
  const post = await findOwnedPost(req.user._id, req.params.id);
  const { postUrl } = req.body || {};
  if (!postUrl || !postUrl.trim()) {
    return error(res, { message: 'postUrl is required', status: 400 });
  }

  post.status = 'posted';
  post.postUrl = postUrl.trim();
  post.postedAt = post.postedAt || new Date();
  await post.save();

  return success(res, { message: 'Marked as posted', data: { post } });
});

/**
 * @route POST /api/social/posts/:id/refresh-metrics  (protected)
 * Pull LinkedIn like/comment counts where the API allows.
 */
const refreshMetrics = asyncHandler(async (req, res) => {
  const post = await findOwnedPost(req.user._id, req.params.id);

  if (post.platform !== 'linkedin' || !post.postUrn) {
    return error(res, {
      message: 'Metrics can only be refreshed for published LinkedIn posts',
      status: 400,
    });
  }

  const account = await linkedinSvc.getAuthorizedAccount(req.user._id);
  const { likes, comments } = await linkedinSvc.getPostMetrics(account.accessToken, post.postUrn);

  if (likes == null && comments == null) {
    return error(res, {
      message: 'LinkedIn did not return metrics for this post (permission may be required). Enter them manually.',
      status: 400,
    });
  }

  if (likes != null) post.metrics.likes = likes;
  if (comments != null) post.metrics.comments = comments;
  await post.save();

  return success(res, { message: 'Metrics refreshed', data: { post } });
});

/**
 * @route GET /api/social/analytics  (protected)
 * Aggregate totals + recent posted posts for the dashboard.
 */
const analytics = asyncHandler(async (req, res) => {
  const posts = await SocialPost.find({ user: req.user._id }).sort({ createdAt: -1 });

  const emptyPlatform = () => ({ posted: 0, drafts: 0, likes: 0, comments: 0 });
  const byPlatform = { linkedin: emptyPlatform(), x: emptyPlatform(), instagram: emptyPlatform() };

  let postedCount = 0;
  let draftCount = 0;
  let totalLikes = 0;
  let totalComments = 0;

  for (const p of posts) {
    const bucket = byPlatform[p.platform];
    if (p.status === 'posted') {
      postedCount += 1;
      totalLikes += p.metrics?.likes || 0;
      totalComments += p.metrics?.comments || 0;
      if (bucket) {
        bucket.posted += 1;
        bucket.likes += p.metrics?.likes || 0;
        bucket.comments += p.metrics?.comments || 0;
      }
    } else {
      draftCount += 1;
      if (bucket) bucket.drafts += 1;
    }
  }

  const account = await LinkedInAccount.findOne({ user: req.user._id });
  const recent = posts
    .filter((p) => p.status === 'posted')
    .slice(0, 5)
    .map((p) => ({
      _id: p._id,
      platform: p.platform,
      content: p.content,
      postUrl: p.postUrl,
      likes: p.metrics?.likes || 0,
      comments: p.metrics?.comments || 0,
      postedAt: p.postedAt,
    }));

  return success(res, {
    data: {
      totals: { postedCount, draftCount, totalLikes, totalComments },
      byPlatform,
      linkedinConnected: Boolean(account && account.linkedinSub),
      recent,
    },
  });
});

// ---------------------------------------------------------------------------
// Auto-posting schedule (cron)
// ---------------------------------------------------------------------------

/**
 * @route GET /api/social/schedule  (protected)
 */
const getSchedule = asyncHandler(async (req, res) => {
  let schedule = await SocialSchedule.findOne({ user: req.user._id });
  if (!schedule) {
    schedule = await SocialSchedule.create({ user: req.user._id });
  }
  return success(res, { data: { schedule } });
});

/**
 * @route PUT /api/social/schedule  (protected)  { enabled?, cron?, platform?, topic?, autoPublish? }
 */
const updateSchedule = asyncHandler(async (req, res) => {
  const { enabled, cron: cronExpr, platform, topic, footer, autoPublish } = req.body || {};

  const update = {};
  if (typeof enabled === 'boolean') update.enabled = enabled;
  if (typeof cronExpr === 'string') {
    if (!cron.validate(cronExpr.trim())) {
      return error(res, { message: 'Invalid cron expression', status: 400 });
    }
    update.cron = cronExpr.trim();
  }
  if (platform) {
    if (!['linkedin', 'x', 'instagram'].includes(platform)) {
      return error(res, { message: 'platform must be linkedin, x, or instagram', status: 400 });
    }
    update.platform = platform;
  }
  if (typeof topic === 'string') update.topic = topic.trim();
  if (typeof footer === 'string') update.footer = footer.trim();
  if (typeof autoPublish === 'boolean') update.autoPublish = autoPublish;

  const schedule = await SocialSchedule.findOneAndUpdate(
    { user: req.user._id },
    { user: req.user._id, ...update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await schedulerSvc.reschedule(req.user._id);

  return success(res, { message: 'Schedule saved', data: { schedule } });
});

module.exports = {
  getAuthUrl,
  oauthCallback,
  getStatus,
  disconnect,
  generate,
  listPosts,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  markPosted,
  refreshMetrics,
  analytics,
  getSchedule,
  updateSchedule,
};
