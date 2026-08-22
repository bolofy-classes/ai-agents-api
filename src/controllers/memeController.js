const asyncHandler = require('../helpers/asyncHandler');
const { success, error } = require('../helpers/response');
const agentSvc = require('../services/agent');
const linkedinSvc = require('../services/linkedin');
const SocialPost = require('../models/SocialPost');

/**
 * @route POST /api/memes/captions  (protected)  { topic }
 * Suggest classic top/bottom meme captions from a topic.
 */
const suggestCaptions = asyncHandler(async (req, res) => {
  const topic = (req.body?.topic || '').trim();
  if (!topic) return error(res, { message: 'topic is required', status: 400 });

  const captions = await agentSvc.generateMemeCaptions(topic);
  return success(res, { message: 'Captions generated', data: captions });
});

/**
 * @route POST /api/memes/image  (protected)  { prompt }
 * Generate an original meme image via a Gemini image model.
 */
const generateImage = asyncHandler(async (req, res) => {
  const prompt = (req.body?.prompt || '').trim();
  if (!prompt) return error(res, { message: 'prompt is required', status: 400 });

  const { base64, mimeType } = await agentSvc.generateMemeImage(prompt);
  return success(res, {
    message: 'Image generated',
    data: { imageBase64: base64, mimeType },
  });
});

/**
 * @route POST /api/memes/post  (protected)  { imageBase64, caption, platform }
 * Publish a meme image. LinkedIn posts via the API; X/Instagram are manual.
 */
const postMeme = asyncHandler(async (req, res) => {
  const { imageBase64, caption, platform } = req.body || {};

  if (!['linkedin', 'x', 'instagram'].includes(platform)) {
    return error(res, { message: 'platform must be linkedin, x, or instagram', status: 400 });
  }
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return error(res, { message: 'imageBase64 is required', status: 400 });
  }

  // X / Instagram have no server-side image API here — the frontend downloads
  // and the user posts manually, mirroring the Social Media "mark posted" flow.
  if (platform !== 'linkedin') {
    return success(res, {
      message: 'Download the meme and post it manually on this platform',
      data: { manual: true },
    });
  }

  // Strip any data: URI prefix, then decode to a Buffer.
  const commaIdx = imageBase64.indexOf(',');
  const raw = imageBase64.startsWith('data:') && commaIdx !== -1
    ? imageBase64.slice(commaIdx + 1)
    : imageBase64;
  const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const buffer = Buffer.from(raw, 'base64');

  const account = await linkedinSvc.getAuthorizedAccount(req.user._id);
  const { urn, url } = await linkedinSvc.createImagePost(
    account.accessToken,
    account.linkedinSub,
    (caption || '').trim(),
    buffer,
    mimeType
  );

  const post = await SocialPost.create({
    user: req.user._id,
    platform: 'linkedin',
    content: (caption || '').trim() || 'Meme',
    mediaCategory: 'image',
    status: 'posted',
    postUrn: urn,
    postUrl: url,
    postedAt: new Date(),
  });

  return success(res, { message: 'Meme published to LinkedIn', data: { post } });
});

module.exports = {
  suggestCaptions,
  generateImage,
  postMeme,
};
