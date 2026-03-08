const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { generateCode, sendVerificationEmail, sendResetPasswordEmail } = require('../utils/email');
const bcrypt = require('bcryptjs');

// ─── REGISTER ───
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'נא למלא את כל השדות.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'הסיסמה חייבת להיות לפחות 6 תווים.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'כתובת המייל כבר רשומה במערכת.' });
    }

    const code = generateCode();
    const user = new User({
      name,
      email,
      password,
      authProvider: 'email',
      isVerified: false,
      verificationCode: code,
      verificationCodeExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });
    await user.save();

    // Send verification email
    try {
      await sendVerificationEmail(email, code, name);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);
      // Still register the user but let them know
    }

    res.status(201).json({
      message: 'נרשמת בהצלחה! קוד אימות נשלח למייל שלך.',
      userId: user._id,
      requiresVerification: true
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── VERIFY EMAIL ───
router.post('/verify-email', async (req, res) => {
  try {
    const { userId, code } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'משתמש לא נמצא.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'החשבון כבר מאומת.' });
    }

    if (!user.verificationCode || user.verificationCode !== code) {
      return res.status(400).json({ message: 'קוד אימות שגוי.' });
    }

    if (user.verificationCodeExpires < new Date()) {
      return res.status(400).json({ message: 'קוד האימות פג תוקף. בקש קוד חדש.' });
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      message: 'החשבון אומת בהצלחה!',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── RESEND VERIFICATION CODE ───
router.post('/resend-code', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'משתמש לא נמצא.' });

    const code = generateCode();
    user.verificationCode = code;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user.email, code, user.name);

    res.json({ message: 'קוד אימות חדש נשלח.' });
  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({ message: 'שגיאה בשליחת הקוד.' });
  }
});

// ─── LOGIN ───
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'נא למלא מייל וסיסמה.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'מייל או סיסמה שגויים.' });
    }

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({ message: 'חשבון זה נרשם באמצעות Google. השתמש בכפתור "התחבר עם Google".' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'מייל או סיסמה שגויים.' });
    }

    if (!user.isVerified) {
      // Send new verification code
      const code = generateCode();
      user.verificationCode = code;
      user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      try {
        await sendVerificationEmail(user.email, code, user.name);
      } catch (e) { console.error(e); }

      return res.status(403).json({
        message: 'החשבון לא אומת עדיין. קוד חדש נשלח למייל.',
        userId: user._id,
        requiresVerification: true
      });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── GOOGLE SIGN-IN ───
router.post('/google', async (req, res) => {
  try {
    const { googleId, email, name } = req.body;

    if (!googleId || !email) {
      return res.status(400).json({ message: 'מידע גוגל חסר.' });
    }

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      // Existing user - update google ID if needed
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = 'google';
      }
      if (!user.isVerified) {
        user.isVerified = true; // Google users are auto-verified
      }
      await user.save();
    } else {
      // New Google user
      user = new User({
        name: name || email.split('@')[0],
        email,
        googleId,
        authProvider: 'google',
        isVerified: true // Google users are auto-verified
      });
      await user.save();
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ message: 'שגיאה באימות Google.' });
  }
});

// ─── FORGOT PASSWORD ───
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'אם המייל קיים במערכת, נשלח קוד לאיפוס סיסמה.' });
    }

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({ message: 'חשבון זה נרשם באמצעות Google ואין לו סיסמה.' });
    }

    const code = generateCode();
    user.resetPasswordCode = code;
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendResetPasswordEmail(user.email, code, user.name);

    res.json({ message: 'קוד איפוס נשלח למייל שלך.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── RESET PASSWORD ───
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'הסיסמה חייבת להיות לפחות 6 תווים.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'קוד איפוס שגוי.' });
    }

    if (!user.resetPasswordCode || user.resetPasswordCode !== code) {
      return res.status(400).json({ message: 'קוד איפוס שגוי.' });
    }

    if (user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: 'קוד האיפוס פג תוקף.' });
    }

    user.password = newPassword;
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'הסיסמה שונתה בהצלחה! ניתן להתחבר.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── GET CURRENT USER ───
router.get('/me', authMiddleware, async (req, res) => {
  try {
    res.json({
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        authProvider: req.user.authProvider,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── CHANGE PASSWORD ───
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'הסיסמה חייבת להיות לפחות 6 תווים.' });
    }

    const user = await User.findById(req.userId);

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({ message: 'חשבון Google לא יכול לשנות סיסמה.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'הסיסמה הנוכחית שגויה.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'הסיסמה שונתה בהצלחה!' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

// ─── CHANGE NAME ───
router.put('/change-name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'השם חייב להיות לפחות 2 תווים.' });
    }

    const user = await User.findById(req.userId);
    user.name = name.trim();
    await user.save();

    res.json({
      message: 'השם שונה בהצלחה!',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider
      }
    });
  } catch (error) {
    console.error('Change name error:', error);
    res.status(500).json({ message: 'שגיאה בשרת.' });
  }
});

module.exports = router;
