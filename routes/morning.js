const express = require('express');
const router = express.Router();
const https = require('https');

const MORNING_API_BASE = 'https://api.greeninvoice.co.il/api/v1';

// Helper: make JSON POST request
function morningPost(path, token, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.greeninvoice.co.il',
      path: `/api/v1${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData) });
        } catch {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// POST /api/morning/token - get a JWT from Morning using apiId + apiSecret
// This is called from the report page (public)
router.post('/token', async (req, res) => {
  try {
    const { apiId, apiSecret } = req.body;
    if (!apiId || !apiSecret) {
      return res.status(400).json({ message: 'יש לספק apiId ו-apiSecret' });
    }
    const result = await morningPost('/account/token', null, { id: apiId, secret: apiSecret });
    if (result.status === 200 && result.data.token) {
      res.json({ token: result.data.token });
    } else {
      res.status(result.status).json({ message: result.data.errorMessage || 'שגיאה בהתחברות למורנינג', details: result.data });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/morning/create-invoice - create an income receipt invoice
// Body: { token, eventTitle, eventDate, amount, clientName }
router.post('/create-invoice', async (req, res) => {
  try {
    const { token, eventTitle, eventDate, amount, clientName, description } = req.body;
    if (!token || !amount) {
      return res.status(400).json({ message: 'חסרים פרטים הכרחיים' });
    }

    // Format date as YYYY-MM-DD
    const dateStr = eventDate ? new Date(eventDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    const invoiceBody = {
      description: description || eventTitle || 'שירותי נגינה',
      type: 320, // קבלה (Receipt)
      date: dateStr,
      dueDate: dateStr,
      lang: 'he',
      currency: 'ILS',
      vatType: 1, // כולל מע"מ
      discount: { amount: 0, type: 'sum' },
      client: {
        name: clientName || 'לקוח',
        add: true
      },
      income: [
        {
          description: eventTitle || 'שירותי נגינה',
          quantity: 1,
          price: amount,
          currency: 'ILS',
          vatType: 1
        }
      ],
      payment: [
        {
          type: 1, // Bank transfer
          price: amount,
          currency: 'ILS',
          date: dateStr
        }
      ]
    };

    const result = await morningPost('/documents', token, invoiceBody);
    if (result.status === 200 || result.status === 201) {
      res.json({
        success: true,
        documentId: result.data.id,
        url: result.data.url,
        data: result.data
      });
    } else {
      res.status(result.status).json({
        message: result.data.errorMessage || 'שגיאה בהפקת החשבונית',
        details: result.data
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
