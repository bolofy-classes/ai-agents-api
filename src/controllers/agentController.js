const asyncHandler = require('../helpers/asyncHandler');
const { success, error } = require('../helpers/response');
const gmailSvc = require('../services/gmail');
const calendarSvc = require('../services/calendar');
const agentSvc = require('../services/agent');
const GmailAccount = require('../models/GmailAccount');

/**
 * Load a cached message + its full body for the current user.
 */
async function loadEmail(userId, gmailId) {
  const account = await GmailAccount.findOne({ user: userId }).select('+refreshToken');
  if (!account || !account.refreshToken) {
    const err = new Error('Gmail is not connected');
    err.status = 400;
    throw err;
  }
  const cached = (account.messages || []).find((m) => m.gmailId === gmailId);
  const full = await gmailSvc.getMessageBody(userId, gmailId);
  return { account, email: { ...(cached ? cached.toObject() : {}), ...full } };
}

/**
 * @route POST /api/agent/summarize  { gmailId }
 * One-line AI summary; cached back onto the message.
 */
const summarize = asyncHandler(async (req, res) => {
  const { gmailId } = req.body;
  if (!gmailId) return error(res, { message: 'gmailId is required', status: 400 });

  const { account, email } = await loadEmail(req.user._id, gmailId);
  const summary = await agentSvc.summarizeEmail(email);

  const msg = account.messages.find((m) => m.gmailId === gmailId);
  if (msg) {
    msg.summary = summary;
    await account.save();
  }

  return success(res, { data: { gmailId, summary } });
});

/**
 * @route POST /api/agent/analyze  { gmailId }
 * Summary + suggested actions + detected meeting.
 */
const analyze = asyncHandler(async (req, res) => {
  const { gmailId } = req.body;
  if (!gmailId) return error(res, { message: 'gmailId is required', status: 400 });

  const { account, email } = await loadEmail(req.user._id, gmailId);
  const analysis = await agentSvc.analyzeEmail(email);

  const msg = account.messages.find((m) => m.gmailId === gmailId);
  if (msg && analysis.summary) {
    msg.summary = analysis.summary;
    await account.save();
  }

  return success(res, { data: { gmailId, ...analysis } });
});

/**
 * @route POST /api/agent/reply  { gmailId }
 * Draft an AI reply (returned, not sent — read-only scope).
 */
const reply = asyncHandler(async (req, res) => {
  const { gmailId } = req.body;
  if (!gmailId) return error(res, { message: 'gmailId is required', status: 400 });

  const { email } = await loadEmail(req.user._id, gmailId);
  const draft = await agentSvc.draftReply(email);
  return success(res, { data: { gmailId, draft } });
});

/**
 * @route POST /api/agent/schedule  { gmailId }  or  { meeting }
 * Detect a meeting in the email (if not supplied) and create a Calendar event.
 */
const schedule = asyncHandler(async (req, res) => {
  const { gmailId, meeting: providedMeeting } = req.body;

  let meeting = providedMeeting;
  if (!meeting) {
    if (!gmailId) return error(res, { message: 'gmailId or meeting is required', status: 400 });
    const { email } = await loadEmail(req.user._id, gmailId);
    const analysis = await agentSvc.analyzeEmail(email);
    meeting = analysis.meeting;
  }

  if (!meeting || !meeting.hasMeeting || !meeting.start) {
    return error(res, { message: 'No schedulable meeting was detected in this email', status: 422 });
  }

  const event = await calendarSvc.createEvent(req.user._id, meeting);
  return success(res, { message: 'Meeting scheduled', data: { event } });
});

/**
 * @route POST /api/agent/suggest-delete  (protected)
 * AI reviews the synced inbox and suggests which emails are safe to delete.
 */
const suggestDelete = asyncHandler(async (req, res) => {
  const account = await GmailAccount.findOne({ user: req.user._id });
  if (!account) return error(res, { message: 'Gmail is not connected', status: 400 });

  const messages = account.messages || [];
  const suggestions = await agentSvc.suggestDeletions(
    messages.map((m) => ({
      gmailId: m.gmailId,
      from: m.from,
      subject: m.subject,
      snippet: m.snippet,
      unread: m.unread,
    }))
  );

  // Enrich with subject/from for display.
  const byId = new Map(messages.map((m) => [m.gmailId, m]));
  const enriched = suggestions.map((s) => {
    const m = byId.get(s.gmailId);
    return { gmailId: s.gmailId, reason: s.reason, subject: m?.subject || '', from: m?.from || '' };
  });

  return success(res, { data: { suggestions: enriched } });
});

module.exports = { summarize, analyze, reply, schedule, suggestDelete };
