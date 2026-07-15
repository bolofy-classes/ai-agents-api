const GNEWS_BASE = 'https://gnews.io/api/v4';

// In-memory response cache to stay under GNews rate limits. Keyed by the
// full request signature; entries expire after TTL_MS.
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { at: Date.now(), value });
}

/**
 * Fetch articles from GNews. Uses /search when a query is provided,
 * otherwise /top-headlines for the given category.
 *
 * @param {object} opts
 * @param {string} opts.apiKey  - the user's GNews API key
 * @param {string} [opts.category]
 * @param {string} [opts.q]     - free-text search
 * @param {string} [opts.lang]
 * @param {string} [opts.country]
 * @param {number} [opts.max]
 * @returns {Promise<{articles: Array, totalArticles: number}>}
 */
async function fetchNews({ apiKey, category, q, lang = 'en', country = 'us', max = 10 }) {
  if (!apiKey) {
    const err = new Error('No GNews API key configured. Add one in News Settings.');
    err.status = 400;
    throw err;
  }

  // Serve from cache when possible (drastically cuts GNews requests).
  const cacheKey = JSON.stringify({ apiKey, category, q: q || '', lang, country, max });
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const endpoint = q ? 'search' : 'top-headlines';
  const url = new URL(`${GNEWS_BASE}/${endpoint}`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('lang', lang);
  url.searchParams.set('country', country);
  url.searchParams.set('max', String(Math.min(Math.max(Number(max) || 10, 1), 10)));
  if (q) url.searchParams.set('q', q);
  else url.searchParams.set('category', category || 'general');

  let res;
  try {
    res = await fetch(url);
  } catch {
    const err = new Error('Could not reach GNews.');
    err.status = 502;
    throw err;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // GNews returns { errors: [...] }. 400/401/403 => bad/invalid key or params,
    // 429 => rate limit/quota; anything else is an upstream failure.
    const detail = Array.isArray(data.errors) ? data.errors.join('; ') : `status ${res.status}`;
    const err = new Error(`GNews: ${detail}`);
    if ([400, 401, 403].includes(res.status)) err.status = 400; // user must fix their key/settings
    else if (res.status === 429) err.status = 429;
    else err.status = 502;
    throw err;
  }

  const articles = (data.articles || []).map((a) => ({
    title: a.title,
    description: a.description,
    url: a.url,
    image: a.image,
    publishedAt: a.publishedAt,
    source: a.source?.name || '',
  }));

  const result = { articles, totalArticles: data.totalArticles || articles.length };
  cacheSet(cacheKey, result);
  return result;
}

module.exports = { fetchNews };
