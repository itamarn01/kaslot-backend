const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Get authenticated client for a specific user
async function getAuthenticatedClient(userId) {
  const user = await User.findById(userId);
  if (!user || !user.googleTokens) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(user.googleTokens);

  // Auto-refresh token
  oauth2Client.on('tokens', async (newTokens) => {
    const u = await User.findById(userId);
    if (u) {
      u.googleTokens = { ...u.googleTokens, ...newTokens };
      await u.save();
    }
  });

  return oauth2Client;
}

// Get Google OAuth URL (requires auth to know which user)
router.get('/auth-url', authMiddleware, (req, res) => {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/spreadsheets',
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: req.userId.toString() // Pass userId in state for callback
  });
  res.json({ url });
});

// OAuth callback - this is called by Google, no auth header
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    // Save tokens to user document
    if (state) {
      const user = await User.findById(state);
      if (user) {
        user.googleTokens = tokens;
        await user.save();
      }
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?google=connected`);
  } catch (error) {
    console.error('Google OAuth error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?google=error`);
  }
});

// Check connection status
router.get('/status', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  const connected = !!(user && user.googleTokens);
  res.json({ connected });
});

// Disconnect Google account
router.delete('/disconnect', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  if (user) {
    user.googleTokens = null;
    await user.save();
  }
  res.json({ message: 'Disconnected' });
});

module.exports = router;
module.exports.getAuthenticatedClient = getAuthenticatedClient;
