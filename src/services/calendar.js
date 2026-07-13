const { google } = require('googleapis');
const { getAuthorizedClient } = require('./google');

/**
 * Create a Calendar event on the user's primary calendar.
 * @param {string} userId
 * @param {object} meeting { title, description, start, end, attendees }
 */
async function createEvent(userId, meeting) {
  const auth = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth });

  const start = new Date(meeting.start);
  // Default to a 30-minute meeting when no end is provided.
  const end = meeting.end ? new Date(meeting.end) : new Date(start.getTime() + 30 * 60 * 1000);

  const res = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'none',
    requestBody: {
      summary: meeting.title || 'Meeting',
      description: meeting.description || 'Scheduled by AI Gmail Agent',
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: (meeting.attendees || [])
        .filter(Boolean)
        .map((email) => ({ email })),
    },
  });

  return {
    id: res.data.id,
    htmlLink: res.data.htmlLink,
    start: res.data.start,
    end: res.data.end,
    summary: res.data.summary,
  };
}

module.exports = { createEvent };
