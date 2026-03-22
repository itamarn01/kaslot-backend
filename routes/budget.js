const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const BandExpense = require('../models/BandExpense');
const Partner = require('../models/Partner');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { google } = require('googleapis');
const { Readable } = require('stream');

// All routes require authentication
router.use(authMiddleware);

// Helper: upload image to Google Drive and return { fileId, webViewLink }
async function uploadReceiptToDrive(userId, base64Image, mimeType, filename) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.googleTokens) return null;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(user.googleTokens);
    oauth2Client.on('tokens', async (newTokens) => {
      user.googleTokens = { ...user.googleTokens, ...newTokens };
      await user.save();
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Ensure folder exists
    let folderId;
    const folderSearch = await drive.files.list({
      q: `name='Kaslot Receipts' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)'
    });
    if (folderSearch.data.files.length > 0) {
      folderId = folderSearch.data.files[0].id;
    } else {
      const folder = await drive.files.create({
        requestBody: { name: 'Kaslot Receipts', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id'
      });
      folderId = folder.data.id;
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Image, 'base64');
    const stream = Readable.from(buffer);

    const file = await drive.files.create({
      requestBody: { name: filename, mimeType, parents: [folderId] },
      media: { mimeType, body: stream },
      fields: 'id,webViewLink,webContentLink'
    });

    // Make publicly readable
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    return { fileId: file.data.id, url: `https://drive.google.com/uc?export=view&id=${file.data.id}` };
  } catch (e) {
    console.error('Drive upload error:', e.message);
    return null;
  }
}

// ============ BUDGET CRUD ============

// GET all budgets for user
router.get('/', async (req, res) => {
  try {
    const budgets = await Budget.find({ userId: req.userId }).sort({ year: -1 });
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create budget (upsert by year)
router.post('/', async (req, res) => {
  try {
    const { year, amount, deductionDay } = req.body;
    const budget = await Budget.findOneAndUpdate(
      { userId: req.userId, year },
      { amount, deductionDay },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(budget);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'תקציב לשנה זו כבר קיים' });
    }
    res.status(500).json({ message: error.message });
  }
});

// PUT update budget
router.put('/:id', async (req, res) => {
  try {
    const { year, amount, deductionDay } = req.body;
    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { year, amount, deductionDay },
      { new: true, runValidators: true }
    );
    if (!budget) return res.status(404).json({ message: 'תקציב לא נמצא' });
    res.json(budget);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE budget
router.delete('/:id', async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!budget) return res.status(404).json({ message: 'תקציב לא נמצא' });
    res.json({ message: 'התקציב נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============ BAND EXPENSE CRUD ============

// GET all band expenses (with optional year filter)
router.get('/expenses', async (req, res) => {
  try {
    const query = { userId: req.userId };
    if (req.query.year) {
      const year = parseInt(req.query.year);
      query.date = {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      };
    }
    const expenses = await BandExpense.find(query)
      .populate('linkedSupplierId', 'name role')
      .populate('linkedPartnerId', 'name')
      .populate('receiptRecipientPartnerId', 'name')
      .sort({ date: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create expense
router.post('/expenses', async (req, res) => {
  try {
    const { amount, method, installments, date, description, linkedSupplierId, linkedPartnerId, receiptRecipientPartnerId, receiptImage, receiptImageMime } = req.body;

    let receiptImageUrl = null;
    let receiptDriveFileId = null;

    if (receiptImage && receiptImageMime) {
      // Try Google Drive upload first
      const driveResult = await uploadReceiptToDrive(
        req.userId,
        receiptImage,
        receiptImageMime,
        `receipt_${Date.now()}.${receiptImageMime.split('/')[1] || 'jpg'}`
      );
      if (driveResult) {
        receiptImageUrl = driveResult.url;
        receiptDriveFileId = driveResult.fileId;
      } else {
        // Fallback: store as data URL (small compressed image)
        receiptImageUrl = `data:${receiptImageMime};base64,${receiptImage}`;
      }
    }

    const expense = new BandExpense({
      userId: req.userId,
      amount,
      method,
      installments: installments || 1,
      date: date || new Date(),
      description,
      linkedSupplierId: linkedSupplierId || null,
      linkedPartnerId: linkedPartnerId || null,
      receiptRecipientPartnerId: receiptRecipientPartnerId || null,
      receiptImageUrl,
      receiptDriveFileId
    });
    await expense.save();
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update expense
router.put('/expenses/:id', async (req, res) => {
  try {
    const { amount, method, installments, date, description, linkedSupplierId, linkedPartnerId, receiptRecipientPartnerId, receiptImage, receiptImageMime } = req.body;

    const existing = await BandExpense.findOne({ _id: req.params.id, userId: req.userId });
    if (!existing) return res.status(404).json({ message: 'הוצאה לא נמצאה' });

    let receiptImageUrl = existing.receiptImageUrl;
    let receiptDriveFileId = existing.receiptDriveFileId;

    if (receiptImage && receiptImageMime) {
      const driveResult = await uploadReceiptToDrive(
        req.userId,
        receiptImage,
        receiptImageMime,
        `receipt_${Date.now()}.${receiptImageMime.split('/')[1] || 'jpg'}`
      );
      if (driveResult) {
        receiptImageUrl = driveResult.url;
        receiptDriveFileId = driveResult.fileId;
      } else {
        receiptImageUrl = `data:${receiptImageMime};base64,${receiptImage}`;
        receiptDriveFileId = null;
      }
    } else if (receiptImage === null) {
      // Explicit removal
      receiptImageUrl = null;
      receiptDriveFileId = null;
    }

    const expense = await BandExpense.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { amount, method, installments, date, description,
        linkedSupplierId: linkedSupplierId || null,
        linkedPartnerId: linkedPartnerId || null,
        receiptRecipientPartnerId: receiptRecipientPartnerId || null,
        receiptImageUrl,
        receiptDriveFileId
      },
      { new: true, runValidators: true }
    ).populate('receiptRecipientPartnerId', 'name');
    if (!expense) return res.status(404).json({ message: 'הוצאה לא נמצאה' });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE expense
router.delete('/expenses/:id', async (req, res) => {
  try {
    const expense = await BandExpense.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!expense) return res.status(404).json({ message: 'הוצאה לא נמצאה' });
    res.json({ message: 'ההוצאה נמחקה בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============ SUMMARY ============

// GET budget summary for a year
router.get('/summary', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const budget = await Budget.findOne({ userId: req.userId, year });

    const expenses = await BandExpense.find({
      userId: req.userId,
      date: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1)
      }
    })
      .populate('linkedSupplierId', 'name role')
      .populate('linkedPartnerId', 'name')
      .populate('receiptRecipientPartnerId', 'name')
      .sort({ date: -1 });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const budgetAmount = budget ? budget.amount : 0;
    const balance = budgetAmount - totalExpenses;

    // Calculate per-partner monthly deduction
    const partners = await Partner.find({ userId: req.userId });
    const monthlyBudget = budgetAmount / 12;
    const partnerDeductions = partners.map(p => ({
      _id: p._id,
      name: p.name,
      percentage: p.percentage,
      monthlyDeduction: Math.round((monthlyBudget * p.percentage / 100) * 100) / 100
    }));

    // Calculate how many months have elapsed in this year
    const now = new Date();
    let monthsElapsed = 0;
    if (now.getFullYear() > year) {
      monthsElapsed = 12;
    } else if (now.getFullYear() === year) {
      monthsElapsed = now.getMonth() + 1; // Jan = 1 month elapsed
      // If we haven't reached the deduction day yet this month, subtract 1
      if (budget && now.getDate() < budget.deductionDay) {
        monthsElapsed = Math.max(0, monthsElapsed - 1);
      }
    }

    res.json({
      budget,
      expenses,
      totalExpenses,
      budgetAmount,
      balance,
      partnerDeductions,
      monthlyBudget,
      monthsElapsed
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
