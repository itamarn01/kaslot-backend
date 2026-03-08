const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { google } = require('googleapis');
const Event = require('../models/Event');
const Supplier = require('../models/Supplier');
const Payment = require('../models/Payment');
const { getAuthenticatedClient } = require('./google');
const { authMiddleware } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

// All routes require authentication
router.use(authMiddleware);

// ========== EXCEL EXPORT ==========

router.get('/export/events/excel', async (req, res) => {
  try {
    const events = await Event.find({ userId: req.userId }).populate('participants.supplierId', 'name role email').sort({ date: -1 });
    const rows = [];
    for (const ev of events) {
      const participants = (ev.participants || []).map(p =>
        `${p.supplierId?.name} (${p.supplierId?.role}) - ${ev.currency === 'Dollar' ? '$' : ev.currency === 'Euro' ? '€' : '₪'}${p.expectedPay}`
      ).join('; ');
      rows.push({
        'שם אירוע': ev.title, 'תאריך': new Date(ev.date).toLocaleDateString('he-IL'),
        'מיקום': ev.location || '', 'טלפון': ev.phone_number || '',
        'מחיר סגירה': ev.totalPrice, 'מטבע': ev.currency, 'הרכב/ספקים': participants,
      });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'אירועים');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=events.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.get('/export/suppliers/excel', async (req, res) => {
  try {
    const suppliers = await Supplier.find({ userId: req.userId }).sort({ name: 1 });
    const rows = suppliers.map(s => ({
      'שם': s.name, 'תפקיד': s.role, 'אימייל': s.email || '',
      'פרטי קשר': s.contact_info || '', 'מחיר ברירת מחדל': s.default_price || 0, 'מטבע': s.currency || 'Shekel',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ספקים');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=suppliers.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.get('/export/payments/excel', async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.userId })
      .populate('supplierId', 'name role').populate('partnerId', 'name').populate('eventId', 'title date').sort({ date: -1 });
    const rows = payments.map(p => ({
      'ספק': p.supplierId?.name || p.partnerId?.name || '', 'תפקיד': p.supplierId?.role || 'שותף',
      'אירוע': p.eventId?.title || 'כללי',
      'תאריך אירוע': p.eventId?.date ? new Date(p.eventId.date).toLocaleDateString('he-IL') : '',
      'סכום': p.amount, 'אמצעי תשלום': p.method || '',
      'תאריך תשלום': p.date ? new Date(p.date).toLocaleDateString('he-IL') : '', 'הערות': p.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'תשלומים');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ========== EXCEL IMPORT ==========

router.post('/import/suppliers/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    let imported = 0, skipped = 0;
    for (const row of data) {
      const name = row['שם'] || row['name'] || row['Name'];
      const role = row['תפקיד'] || row['role'] || row['Role'];
      if (!name || !role) { skipped++; continue; }
      const existing = await Supplier.findOne({ name, role, userId: req.userId });
      if (existing) { skipped++; continue; }
      await Supplier.create({
        name, role, userId: req.userId,
        email: row['אימייל'] || row['email'] || '',
        contact_info: row['פרטי קשר'] || row['contact'] || '',
        default_price: Number(row['מחיר ברירת מחדל'] || row['price'] || 0),
        currency: row['מטבע'] || row['currency'] || 'Shekel',
      });
      imported++;
    }
    res.json({ message: `Imported ${imported} suppliers, skipped ${skipped}` });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

router.post('/import/events/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    let imported = 0, skipped = 0;
    for (const row of data) {
      const title = row['שם אירוע'] || row['title'] || row['Title'];
      const dateStr = row['תאריך'] || row['date'] || row['Date'];
      const totalPrice = Number(row['מחיר סגירה'] || row['price'] || row['totalPrice'] || 0);
      if (!title || !dateStr) { skipped++; continue; }
      let parsedDate;
      if (typeof dateStr === 'number') { parsedDate = new Date((dateStr - 25569) * 86400 * 1000); }
      else {
        const parts = dateStr.split(/[\/\.\-]/);
        if (parts.length === 3 && parts[0].length <= 2) {
          parsedDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        } else { parsedDate = new Date(dateStr); }
      }
      if (isNaN(parsedDate.getTime())) { skipped++; continue; }
      await Event.create({
        title, date: parsedDate, userId: req.userId,
        location: row['מיקום'] || row['location'] || '', phone_number: row['טלפון'] || row['phone'] || '',
        totalPrice, currency: row['מטבע'] || row['currency'] || 'Shekel',
      });
      imported++;
    }
    res.json({ message: `Imported ${imported} events, skipped ${skipped}` });
  } catch (error) { res.status(500).json({ message: error.message }); }
});

// ========== GOOGLE SHEETS EXPORT ==========

router.post('/export/events/sheets', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) return res.status(401).json({ message: 'Google account not connected' });
    const sheets = google.sheets({ version: 'v4', auth });
    const events = await Event.find({ userId: req.userId }).populate('participants.supplierId', 'name role').sort({ date: -1 });
    const headers = ['שם אירוע', 'תאריך', 'מיקום', 'טלפון', 'מחיר סגירה', 'מטבע', 'הרכב/ספקים'];
    const rows = events.map(ev => {
      const participants = (ev.participants || []).map(p => `${p.supplierId?.name} (${p.supplierId?.role}) - ${p.expectedPay}`).join('; ');
      return [ev.title, new Date(ev.date).toLocaleDateString('he-IL'), ev.location || '', ev.phone_number || '', ev.totalPrice, ev.currency, participants];
    });
    const spreadsheet = await sheets.spreadsheets.create({
      resource: {
        properties: { title: `Kaslot - אירועים - ${new Date().toLocaleDateString('he-IL')}` },
        sheets: [{ properties: { title: 'אירועים', sheetId: 0 }, data: [{ startRow: 0, startColumn: 0,
          rowData: [
            { values: headers.map(h => ({ userEnteredValue: { stringValue: h } })) },
            ...rows.map(r => ({ values: r.map(cell => ({ userEnteredValue: typeof cell === 'number' ? { numberValue: cell } : { stringValue: String(cell) } })) }))
          ]
        }] }]
      }
    });
    res.json({ message: 'Events exported to Google Sheets', spreadsheetUrl: spreadsheet.data.spreadsheetUrl, spreadsheetId: spreadsheet.data.spreadsheetId });
  } catch (error) { console.error('Sheets export error:', error); res.status(500).json({ message: error.message }); }
});

router.post('/export/suppliers/sheets', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) return res.status(401).json({ message: 'Google account not connected' });
    const sheets = google.sheets({ version: 'v4', auth });
    const suppliers = await Supplier.find({ userId: req.userId }).sort({ name: 1 });
    const headers = ['שם', 'תפקיד', 'אימייל', 'פרטי קשר', 'מחיר ברירת מחדל', 'מטבע'];
    const rows = suppliers.map(s => [s.name, s.role, s.email || '', s.contact_info || '', s.default_price || 0, s.currency || 'Shekel']);
    const spreadsheet = await sheets.spreadsheets.create({
      resource: {
        properties: { title: `Kaslot - ספקים - ${new Date().toLocaleDateString('he-IL')}` },
        sheets: [{ properties: { title: 'ספקים', sheetId: 0 }, data: [{ startRow: 0, startColumn: 0,
          rowData: [
            { values: headers.map(h => ({ userEnteredValue: { stringValue: h } })) },
            ...rows.map(r => ({ values: r.map(cell => ({ userEnteredValue: typeof cell === 'number' ? { numberValue: cell } : { stringValue: String(cell) } })) }))
          ]
        }] }]
      }
    });
    res.json({ message: 'Suppliers exported to Google Sheets', spreadsheetUrl: spreadsheet.data.spreadsheetUrl, spreadsheetId: spreadsheet.data.spreadsheetId });
  } catch (error) { console.error('Sheets export error:', error); res.status(500).json({ message: error.message }); }
});

// ========== GOOGLE SHEETS IMPORT ==========

router.post('/import/sheets', async (req, res) => {
  try {
    const { spreadsheetUrl, type } = req.body;
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) return res.status(401).json({ message: 'Google account not connected' });
    let spreadsheetId = spreadsheetUrl;
    const match = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) spreadsheetId = match[1];
    const sheetsApi = google.sheets({ version: 'v4', auth });
    const response = await sheetsApi.spreadsheets.values.get({ spreadsheetId, range: 'A:Z' });
    const rows = response.data.values;
    if (!rows || rows.length < 2) return res.status(400).json({ message: 'Sheet is empty or has no data rows' });
    const headers = rows[0];
    const dataRows = rows.slice(1);
    let imported = 0, skipped = 0;
    if (type === 'suppliers') {
      for (const row of dataRows) {
        const obj = {}; headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        const name = obj['שם'] || obj['name']; const role = obj['תפקיד'] || obj['role'];
        if (!name || !role) { skipped++; continue; }
        const existing = await Supplier.findOne({ name, role, userId: req.userId });
        if (existing) { skipped++; continue; }
        await Supplier.create({ name, role, userId: req.userId, email: obj['אימייל'] || obj['email'] || '', contact_info: obj['פרטי קשר'] || '', default_price: Number(obj['מחיר ברירת מחדל'] || 0), currency: obj['מטבע'] || 'Shekel' });
        imported++;
      }
    } else if (type === 'events') {
      for (const row of dataRows) {
        const obj = {}; headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        const title = obj['שם אירוע'] || obj['title']; const dateStr = obj['תאריך'] || obj['date']; const totalPrice = Number(obj['מחיר סגירה'] || 0);
        if (!title || !dateStr) { skipped++; continue; }
        let parsedDate; const parts = dateStr.split(/[\/\.\-]/);
        if (parts.length === 3 && parts[0].length <= 2) { parsedDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`); }
        else { parsedDate = new Date(dateStr); }
        if (isNaN(parsedDate.getTime())) { skipped++; continue; }
        await Event.create({ title, date: parsedDate, userId: req.userId, location: obj['מיקום'] || '', phone_number: obj['טלפון'] || '', totalPrice, currency: obj['מטבע'] || 'Shekel' });
        imported++;
      }
    } else { return res.status(400).json({ message: 'Type must be "suppliers" or "events"' }); }
    res.json({ message: `Imported ${imported}, skipped ${skipped}` });
  } catch (error) { console.error('Sheets import error:', error); res.status(500).json({ message: error.message }); }
});

module.exports = router;
