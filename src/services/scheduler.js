const cron = require('node-cron');
const SocialSchedule = require('../models/SocialSchedule');
const SocialPost = require('../models/SocialPost');
const NewsSetting = require('../models/NewsSetting');
const agentSvc = require('./agent');
const newsSvc = require('./news');
const linkedinSvc = require('./linkedin');

// One in-memory cron task per user, keyed by user id string. Rebuilt from
// the DB on boot and kept in sync whenever a schedule is saved.
const tasks = new Map();

/**
 * Build the AI prompt for a scheduled run: the user's own topic if they set
 * one, otherwise today's top headline from their configured news feed.
 * Returns null when there's nothing to post about.
 */
async function resolveQuery(userId, schedule) {
  if (schedule.topic && schedule.topic.trim()) {
    return schedule.topic.trim();
  }

  const setting = await NewsSetting.findOne({ user: userId }).select('+apiKey');
  if (!setting || !setting.apiKey) return null;

  const { articles } = await newsSvc.fetchNews({
    apiKey: setting.apiKey,
    category: setting.categories?.[0] || 'general',
    lang: setting.lang,
    country: setting.country,
    max: 1,
  });
  const top = articles[0];
  if (!top) return null;

  const bits = [`Title: "${top.title}"`];
  if (top.description) bits.push(`Details: ${top.description}`);
  if (top.source) bits.push(`Source: ${top.source}`);
  if (top.url) bits.push(`Link: ${top.url}`);
  return `Write a social media post about today's top news story.\n${bits.join('\n')}`;
}

/**
 * Execute one scheduled run for a user: generate a post and either
 * auto-publish (LinkedIn) or leave it as a draft for manual review.
 */
async function runJob(userId) {
  const schedule = await SocialSchedule.findOne({ user: userId });
  if (!schedule || !schedule.enabled) return;

  let resultMsg;
  try {
    const query = await resolveQuery(userId, schedule);
    if (!query) {
      resultMsg = 'Skipped — no topic set and no news source configured.';
    } else {
      const posts = await agentSvc.generateSocialPosts(query, schedule.footer);
      const content = posts[schedule.platform];

      const post = await SocialPost.create({
        user: userId,
        platform: schedule.platform,
        content,
        prompt: query,
      });

      if (schedule.platform === 'linkedin' && schedule.autoPublish) {
        try {
          const account = await linkedinSvc.getAuthorizedAccount(userId);
          const { urn, url } = await linkedinSvc.createTextPost(
            account.accessToken,
            account.linkedinSub,
            content
          );
          post.status = 'posted';
          post.postUrn = urn;
          post.postUrl = url;
          post.postedAt = new Date();
          await post.save();
          resultMsg = `Published to LinkedIn: ${url}`;
        } catch (err) {
          resultMsg = `Draft saved — auto-publish failed: ${err.message}`;
        }
      } else {
        resultMsg = 'Draft saved for review.';
      }
    }
  } catch (err) {
    resultMsg = `Failed: ${err.message}`;
  }

  schedule.lastRunAt = new Date();
  schedule.lastResult = resultMsg;
  await schedule.save();
}

function unregister(userId) {
  const key = String(userId);
  const existing = tasks.get(key);
  if (existing) {
    existing.stop();
    tasks.delete(key);
  }
}

function register(schedule) {
  const key = String(schedule.user);
  unregister(key);
  if (!schedule.enabled || !cron.validate(schedule.cron)) return;

  const task = cron.schedule(schedule.cron, () => {
    runJob(schedule.user).catch((err) => console.error('Social schedule run failed:', err));
  });
  tasks.set(key, task);
}

/**
 * Re-read one user's schedule from the DB and (re)register its cron task.
 * Call this after every schedule save.
 */
async function reschedule(userId) {
  const schedule = await SocialSchedule.findOne({ user: userId });
  if (!schedule) {
    unregister(userId);
    return;
  }
  register(schedule);
}

/** Load every enabled schedule and register its cron task. Call once at boot. */
async function start() {
  const schedules = await SocialSchedule.find({ enabled: true });
  schedules.forEach(register);
  console.log(`⏰ Social auto-posting scheduler: ${schedules.length} active job(s)`);
}

module.exports = { start, reschedule, runJob };
