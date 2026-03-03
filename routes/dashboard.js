const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Payment = require('../models/Payment');
const Supplier = require('../models/Supplier');
const Partner = require('../models/Partner');

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
        Euro: totalEventsPrice.Euro - totalExpectedPay.Euro,
    };

    // Partner earnings calculation
    const partners = await Partner.find().populate('linkedSupplierId');
    const partnerEarnings = partners.map(partner => {
      let profitShare = { Shekel: 0, Dollar: 0, Euro: 0 };
      let supplierEarnings = { Shekel: 0, Dollar: 0, Euro: 0 };

      events.forEach(ev => {
        const evCurrency = ev.currency || 'Shekel';
        // Calculate event profit (revenue - supplier costs in event currency)
        const eventSupplierCosts = (ev.participants || [])
          .filter(p => (p.currency || 'Shekel') === evCurrency)
          .reduce((sum, p) => sum + (p.expectedPay || 0), 0);
        const eventProfit = (ev.totalPrice || 0) - eventSupplierCosts;

        // Partner's share of the profit
        profitShare[evCurrency] += eventProfit * (partner.percentage / 100);

        // If partner is linked to a supplier, add their supplier pay from this event
        if (partner.linkedSupplierId) {
          const linkedId = partner.linkedSupplierId._id.toString();
          (ev.participants || []).forEach(p => {
            if (p.supplierId && p.supplierId.toString() === linkedId) {
              const pCurrency = p.currency || 'Shekel';
              supplierEarnings[pCurrency] += (p.expectedPay || 0);
            }
          });
        }
      });

      return {
        _id: partner._id,
        name: partner.name,
        percentage: partner.percentage,
        linkedSupplierName: partner.linkedSupplierId ? partner.linkedSupplierId.name : null,
        profitShare,
        supplierEarnings,
        totalEarnings: {
          Shekel: profitShare.Shekel + supplierEarnings.Shekel,
          Dollar: profitShare.Dollar + supplierEarnings.Dollar,
          Euro: profitShare.Euro + supplierEarnings.Euro,
        }
      };
    });

    res.json({
      totalEvents: events.length,
      totalEventsPrice,
      totalExpectedPay,
      totalPaymentsMade,
      totalProfit,
      totalOwed,
      estimatedFinalProfit,
      partnerEarnings
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

