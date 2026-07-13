const { google } = require('googleapis');
const { getAuthorizedClient } = require('./google');

function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

/**
 * Recursively pull the plaintext body out of a Gmail payload.
 */
function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  return '';
}

/**
 * List the most recent messages (metadata + snippet) for a user.
 * @param {string} userId
 * @param {number} max
 */
async function listRecentMessages(userId, max = 10) {
  const auth = await getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: max,
    labelIds: ['INBOX'],
  });

  const ids = (listRes.data.messages || []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });
      const { payload, snippet, labelIds, threadId } = res.data;
      const headers = payload?.headers || [];
      return {
        gmailId: id,
        threadId,
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        subject: headerValue(headers, 'Subject'),
        snippet: snippet || '',
        date: new Date(Number(res.data.internalDate)),
        unread: (labelIds || []).includes('UNREAD'),
      };
    })
  );

  return messages;
}

/**
 * Fetch a single message's full plaintext body.
 */
async function getMessageBody(userId, gmailId) {
  const auth = await getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' });
  const headers = res.data.payload?.headers || [];
  return {
    gmailId,
    from: headerValue(headers, 'From'),
    subject: headerValue(headers, 'Subject'),
    date: headerValue(headers, 'Date'),
    body: extractPlainText(res.data.payload).slice(0, 8000),
    snippet: res.data.snippet || '',
  };
}

/**
 * Move one or more messages to Trash (reversible).
 * @param {string} userId
 * @param {string[]} gmailIds
 * @returns {Promise<{trashed: string[], failed: {gmailId: string, error: string}[]}>}
 */
async function trashMessages(userId, gmailIds) {
  const auth = await getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const results = await Promise.allSettled(
    gmailIds.map((id) => gmail.users.messages.trash({ userId: 'me', id }))
  );

  const trashed = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') trashed.push(gmailIds[i]);
    else failed.push({ gmailId: gmailIds[i], error: r.reason?.message || 'Failed' });
  });

  return { trashed, failed };
}

/**
 * Extract the bare email address from a "Name <email@x.com>" header.
 */
function extractEmail(headerValueStr) {
  const match = /<([^>]+)>/.exec(headerValueStr || '');
  return (match ? match[1] : headerValueStr || '').trim();
}

/**
 * Send a plaintext reply on the same thread as the given message.
 * @param {string} userId
 * @param {string} gmailId - message being replied to
 * @param {string} bodyText
 */
async function sendReply(userId, gmailId, bodyText) {
  const auth = await getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const orig = await gmail.users.messages.get({
    userId: 'me',
    id: gmailId,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Message-ID', 'References'],
  });
  const headers = orig.data.payload?.headers || [];
  const to = extractEmail(headerValue(headers, 'From'));
  const rawSubject = headerValue(headers, 'Subject') || '';
  const subject = /^re:/i.test(rawSubject) ? rawSubject : `Re: ${rawSubject}`;
  const messageId = headerValue(headers, 'Message-ID');
  const references = headerValue(headers, 'References');

  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
  ];
  if (messageId) {
    lines.push(`In-Reply-To: ${messageId}`);
    lines.push(`References: ${references ? `${references} ${messageId}` : messageId}`);
  }
  lines.push('', bodyText || '');

  const raw = Buffer.from(lines.join('\r\n'), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: orig.data.threadId },
  });
  return { id: res.data.id, threadId: res.data.threadId, to, subject };
}

/**
 * Block a sender by creating a filter that skips the inbox and trashes
 * future mail from that address. Returns the sender + filter id.
 * @param {string} userId
 * @param {string} gmailId - message whose sender to block
 */
async function blockSender(userId, gmailId) {
  const auth = await getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: gmailId,
    format: 'metadata',
    metadataHeaders: ['From'],
  });
  const fromEmail = extractEmail(headerValue(msg.data.payload?.headers || [], 'From'));
  if (!fromEmail) {
    const err = new Error('Could not determine sender address');
    err.status = 422;
    throw err;
  }

  const res = await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: {
      criteria: { from: fromEmail },
      action: { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] },
    },
  });

  return { fromEmail, filterId: res.data.id };
}

/**
 * Fetch the authenticated Gmail address.
 */
async function getProfileEmail(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data.emailAddress;
}

module.exports = {
  listRecentMessages,
  getMessageBody,
  trashMessages,
  sendReply,
  blockSender,
  getProfileEmail,
};
