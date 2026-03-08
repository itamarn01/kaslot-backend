const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'kaslot-super-secret-key-2024';

// Generate access token (7 days)
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

// Auth middleware - verifies JWT and attaches user to req
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'אין הרשאה. נדרשת התחברות.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password -verificationCode -resetPasswordCode');
    if (!user) {
      return res.status(401).json({ message: 'משתמש לא נמצא.' });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'הטוקן פג תוקף. יש להתחבר מחדש.' });
    }
    return res.status(401).json({ message: 'טוקן לא תקין.' });
  }
}

module.exports = { authMiddleware, generateToken, JWT_SECRET };
