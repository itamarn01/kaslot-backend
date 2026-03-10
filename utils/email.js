const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL || 'kolotmusic@gmail.com',
    pass: process.env.SMTP_PASSWORD // App Password from Google
  }
});

// Generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(toEmail, code, userName) {
  const mailOptions = {
    from: `"Kaslot" <${process.env.SMTP_EMAIL || 'kolotmusic@gmail.com'}>`,
    to: toEmail,
    subject: '🔐 אימות חשבון Kaslot - קוד אימות',
    html: `
      <div style="direction: rtl; text-align: right; font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; width: 50px; height: 50px; background: linear-gradient(135deg, #3b82f6, #34d399); border-radius: 12px; line-height: 50px; font-size: 24px; font-weight: bold; color: white;">K</div>
          <h1 style="color: #f1f5f9; margin: 10px 0 0; font-size: 28px;">Kaslot</h1>
        </div>
        <h2 style="color: #60a5fa; text-align: center;">שלום ${userName}! 👋</h2>
        <p style="color: #94a3b8; text-align: center; font-size: 16px;">קוד האימות שלך:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #34d399); padding: 20px 40px; border-radius: 12px; letter-spacing: 12px; font-size: 36px; font-weight: bold; color: white;">${code}</div>
        </div>
        <p style="color: #94a3b8; text-align: center; font-size: 14px;">הקוד תקף ל-10 דקות בלבד.</p>
        <hr style="border: 1px solid #334155; margin: 30px 0;" />
        <p style="color: #64748b; text-align: center; font-size: 12px;">אם לא ביקשת קוד אימות, התעלם מהודעה זו.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
}

// Send password reset email
async function sendResetPasswordEmail(toEmail, code, userName) {
  const mailOptions = {
    from: `"Kaslot" <${process.env.SMTP_EMAIL || 'kolotmusic@gmail.com'}>`,
    to: toEmail,
    subject: '🔑 איפוס סיסמה - Kaslot',
    html: `
      <div style="direction: rtl; text-align: right; font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; width: 50px; height: 50px; background: linear-gradient(135deg, #3b82f6, #34d399); border-radius: 12px; line-height: 50px; font-size: 24px; font-weight: bold; color: white;">K</div>
          <h1 style="color: #f1f5f9; margin: 10px 0 0; font-size: 28px;">Kaslot</h1>
        </div>
        <h2 style="color: #f87171; text-align: center;">איפוס סיסמה 🔑</h2>
        <p style="color: #94a3b8; text-align: center; font-size: 16px;">שלום ${userName}, הנה קוד האיפוס שלך:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; background: linear-gradient(135deg, #f87171, #fb923c); padding: 20px 40px; border-radius: 12px; letter-spacing: 12px; font-size: 36px; font-weight: bold; color: white;">${code}</div>
        </div>
        <p style="color: #94a3b8; text-align: center; font-size: 14px;">הקוד תקף ל-10 דקות בלבד.</p>
        <hr style="border: 1px solid #334155; margin: 30px 0;" />
        <p style="color: #64748b; text-align: center; font-size: 12px;">אם לא ביקשת איפוס סיסמה, מישהו אחר אולי ניסה להיכנס לחשבונך.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
}

module.exports = { generateCode, sendVerificationEmail, sendResetPasswordEmail };
