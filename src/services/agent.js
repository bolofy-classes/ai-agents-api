const { GoogleGenAI } = require('@google/genai');
const config = require('../config');

let client = null;
function getClient() {
  if (!config.gemini.apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 500;
    throw err;
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return client;
}

/**
 * Strip markdown code fences and parse JSON from a model response.
 */
function parseJson(text) {
  const cleaned = (text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Produce a one-line summary of an email.
 * @param {object} email { subject, from, body/snippet }
 * @returns {Promise<string>}
 */
async function summarizeEmail(email) {
  const ai = getClient();
  const prompt = `Summarize this email in ONE short sentence (max 15 words). Reply with only the sentence, no quotes.

From: ${email.from || ''}
Subject: ${email.subject || ''}
Body: ${(email.body || email.snippet || '').slice(0, 3000)}`;

  const res = await ai.models.generateContent({
    model: config.gemini.model,
    contents: prompt,
  });
  return (res.text || '').trim();
}

/**
 * Analyze an email: summary, suggested actions, and any meeting details.
 * @param {object} email
 * @returns {Promise<{summary:string, suggestedActions:string[], meeting:object}>}
 */
async function analyzeEmail(email) {
  const ai = getClient();
  const prompt = `You are an email assistant. Analyze the email and respond with STRICT JSON only:
{
  "summary": "one short sentence",
  "suggestedActions": ["Reply", "Schedule", "Archive"],  // pick 1-3 from: Reply, Schedule, Archive, Follow up, Ignore
  "meeting": {
    "hasMeeting": true/false,
    "title": "string or null",
    "start": "ISO 8601 datetime or null",
    "end": "ISO 8601 datetime or null",
    "attendees": ["email", ...]
  }
}
Assume the current year is ${new Date().getFullYear()}. If no meeting is proposed, hasMeeting=false and other meeting fields null.

From: ${email.from || ''}
Subject: ${email.subject || ''}
Body: ${(email.body || email.snippet || '').slice(0, 4000)}`;

  const res = await ai.models.generateContent({
    model: config.gemini.model,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const parsed = parseJson(res.text);
    return {
      summary: parsed.summary || '',
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
      meeting: parsed.meeting || { hasMeeting: false },
    };
  } catch {
    return {
      summary: (res.text || '').trim().slice(0, 140),
      suggestedActions: ['Reply'],
      meeting: { hasMeeting: false },
    };
  }
}

/**
 * Draft a reply to an email.
 */
async function draftReply(email) {
  const ai = getClient();
  const prompt = `Write a concise, professional reply to this email. Return only the reply body (no subject line).

From: ${email.from || ''}
Subject: ${email.subject || ''}
Body: ${(email.body || email.snippet || '').slice(0, 3000)}`;

  const res = await ai.models.generateContent({
    model: config.gemini.model,
    contents: prompt,
  });
  return (res.text || '').trim();
}

/**
 * Summarize a news article in one short sentence.
 * @param {object} article { title, description, source }
 * @returns {Promise<string>}
 */
async function summarizeArticle(article) {
  const ai = getClient();
  const prompt = `Summarize this news article in ONE clear sentence (max 25 words). Reply with only the sentence, no quotes or preamble.

Title: ${article.title || ''}
Source: ${article.source || ''}
Description: ${(article.description || '').slice(0, 2000)}`;

  const res = await ai.models.generateContent({
    model: config.gemini.model,
    contents: prompt,
  });
  return (res.text || '').trim();
}

/**
 * From a list of emails, suggest which are safe to bulk-delete
 * (promotions, social/notification noise, expired alerts, newsletters).
 * @param {Array<{gmailId, from, subject, snippet, unread}>} messages
 * @returns {Promise<Array<{gmailId, reason}>>}
 */
async function suggestDeletions(messages) {
  if (!messages.length) return [];
  const ai = getClient();

  const list = messages
    .map(
      (m, i) =>
        `${i}. id=${m.gmailId} | from=${m.from || ''} | subject=${m.subject || ''} | ${
          m.unread ? 'UNREAD' : 'read'
        } | ${(m.snippet || '').slice(0, 120)}`
    )
    .join('\n');

  const prompt = `You are an inbox-cleanup assistant. From the emails below, pick the ones that are SAFE to delete in bulk — promotional offers, marketing newsletters, social/app notifications, and expired/no-longer-relevant automated alerts. Do NOT suggest deleting anything that looks personal, financial (invoices, receipts, statements), security-critical, or a real conversation.

Respond with STRICT JSON only, an array:
[{ "gmailId": "the id", "reason": "short reason (max 8 words)" }]
Only include emails you recommend deleting. If none, return [].

Emails:
${list}`;

  const res = await ai.models.generateContent({
    model: config.gemini.model,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const parsed = parseJson(res.text);
    if (!Array.isArray(parsed)) return [];
    // Only keep ids that exist in the input set.
    const valid = new Set(messages.map((m) => m.gmailId));
    return parsed.filter((p) => p && valid.has(p.gmailId)).map((p) => ({
      gmailId: p.gmailId,
      reason: p.reason || 'Suggested for cleanup',
    }));
  } catch {
    return [];
  }
}

module.exports = { summarizeEmail, analyzeEmail, draftReply, suggestDeletions, summarizeArticle };
