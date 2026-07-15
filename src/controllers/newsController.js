const asyncHandler = require('../helpers/asyncHandler');
const { success, error } = require('../helpers/response');
const NewsSetting = require('../models/NewsSetting');
const newsSvc = require('../services/news');
const agentSvc = require('../services/agent');

// Cache article summaries by URL so repeated clicks don't re-call Gemini.
const summaryCache = new Map();

/**
 * @route GET /api/news/settings  (protected)
 * Return the user's news settings (never the raw API key).
 */
const getSettings = asyncHandler(async (req, res) => {
  let settings = await NewsSetting.findOne({ user: req.user._id }).select('+apiKey');
  if (!settings) {
    settings = await NewsSetting.create({ user: req.user._id });
  }
  return success(res, { data: { settings, categories: NewsSetting.CATEGORIES } });
});

/**
 * @route PUT /api/news/settings  (protected)
 * Upsert the user's news settings. Only overwrites the API key when a
 * non-empty value is provided (so saving other fields keeps the key).
 */
const saveSettings = asyncHandler(async (req, res) => {
  const { apiKey, categories, lang, country, maxArticles } = req.body;

  const update = {};
  if (Array.isArray(categories)) {
    const valid = categories.filter((c) => NewsSetting.CATEGORIES.includes(c));
    update.categories = valid.length ? valid : ['general'];
  }
  if (typeof lang === 'string' && lang.trim()) update.lang = lang.trim();
  if (typeof country === 'string' && country.trim()) update.country = country.trim();
  if (maxArticles != null) update.maxArticles = Math.min(Math.max(Number(maxArticles) || 10, 1), 10);
  if (typeof apiKey === 'string' && apiKey.trim()) update.apiKey = apiKey.trim();

  await NewsSetting.findOneAndUpdate(
    { user: req.user._id },
    { $set: update, $setOnInsert: { user: req.user._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Re-query with the key selected so the response's hasApiKey is accurate
  // (findOneAndUpdate won't return the select:false apiKey field).
  const settings = await NewsSetting.findOne({ user: req.user._id }).select('+apiKey');

  return success(res, { message: 'News settings saved', data: { settings } });
});

/**
 * @route GET /api/news  (protected)  ?category=&q=
 * Fetch articles using the user's stored API key.
 */
const getNews = asyncHandler(async (req, res) => {
  const settings = await NewsSetting.findOne({ user: req.user._id }).select('+apiKey');
  if (!settings || !settings.apiKey) {
    return error(res, { message: 'Add your GNews API key in News Settings first.', status: 400 });
  }

  const category = req.query.category || settings.categories[0] || 'general';
  const q = req.query.q || undefined;

  const { articles, totalArticles } = await newsSvc.fetchNews({
    apiKey: settings.apiKey,
    category,
    q,
    lang: settings.lang,
    country: settings.country,
    max: settings.maxArticles,
  });

  return success(res, { data: { articles, totalArticles, category, q: q || null } });
});

/**
 * @route POST /api/news/summarize  (protected)  { title, description, source, url }
 * One-line AI summary of an article (cached by URL).
 */
const summarize = asyncHandler(async (req, res) => {
  const { title, description, source, url } = req.body;
  if (!title && !description) {
    return error(res, { message: 'title or description is required', status: 400 });
  }

  if (url && summaryCache.has(url)) {
    return success(res, { data: { url, summary: summaryCache.get(url), cached: true } });
  }

  const summary = await agentSvc.summarizeArticle({ title, description, source });
  if (url) summaryCache.set(url, summary);

  return success(res, { data: { url, summary } });
});

module.exports = { getSettings, saveSettings, getNews, summarize };
