const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Payment = require('../models/Payment');
const Supplier = require('../models/Supplier');

router.get('/summary', async (req, res) => {
  try {
    const events = await Event.find();
    
    // Using objects to store sums per currency
    const totalEventsPrice = { Shekel: 0, Dollar: 0, Euro: 0 };
    const totalExpectedPay = { Shekel: 0, Dollar: 0, Euro: 0 };
    
    events.forEach(e => {
      const currency = e.currency || 'Shekel';
      totalEventsPrice[currency] += (e.totalPrice || 0);
      
      if (e.participants) {
        e.participants.forEach(p => {
          const pCurrency = p.currency || 'Shekel';
          totalExpectedPay[pCurrency] += (p.expectedPay || 0);
        });
      }
    });

    const payments = await Payment.find();
    
    const totalPaymentsMade = { Shekel: 0, Dollar: 0, Euro: 0 };
    payments.forEach(p => {
        const pCurrency = p.currency || 'Shekel';
        totalPaymentsMade[pCurrency] += (p.amount || 0);
    });

    const totalProfit = {
        Shekel: totalEventsPrice.Shekel - totalPaymentsMade.Shekel,
        Dollar: totalEventsPrice.Dollar - totalPaymentsMade.Dollar,
        Euro: totalEventsPrice.Euro - totalPaymentsMade.Euro,
    };
    
    const totalOwed = {
        Shekel: totalExpectedPay.Shekel - totalPaymentsMade.Shekel,
        Dollar: totalExpectedPay.Dollar - totalPaymentsMade.Dollar,
        Euro: totalExpectedPay.Euro - totalPaymentsMade.Euro,
    };
    
    const estimatedFinalProfit = {
        Shekel: totalEventsPrice.Shekel - totalExpectedPay.Shekel,
        Dollar: totalEventsPrice.Dollar - totalExpectedPay.Dollar,
        Euro: totalEventsPrice.Euro - totalExpectedPay.Euro, // Corrected logic based on cash in vs out wasn't accurate before, but we'll adapt to currency 
    };

    // Calculate profit dynamically based on (Total collected vs Payments) can be tricky if payments to players exceed total events price in that currency
    // For now, we will simply pass the raw object breakdowns

    res.json({
      totalEvents: events.length,
      totalEventsPrice,
      totalExpectedPay,
      totalPaymentsMade,
      totalProfit,
      totalOwed,
      estimatedFinalProfit
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
