const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Payment = require('../models/Payment');
const Supplier = require('../models/Supplier');
const Partner = require('../models/Partner');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

router.get('/summary', async (req, res) => {
  try {
    const events = await Event.find({ userId: req.userId });
    
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

    const payments = await Payment.find({ userId: req.userId });
    
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

    const partners = await Partner.find({ userId: req.userId }).populate('linkedSupplierIds');
    const partnerEarnings = partners.map(partner => {
      let profitShare = { Shekel: 0, Dollar: 0, Euro: 0 };
      let supplierEarnings = { Shekel: 0, Dollar: 0, Euro: 0 };
      let substituteDeductions = { Shekel: 0, Dollar: 0, Euro: 0 };

      events.forEach(ev => {
        const evCurrency = ev.currency || 'Shekel';
        // Only non-substitute suppliers reduce the shared profit pool
        const eventSupplierCosts = (ev.participants || [])
          .filter(p => !p.isSubstitute && (p.currency || 'Shekel') === evCurrency)
          .reduce((sum, p) => sum + (p.expectedPay || 0), 0);
        const eventProfit = (ev.totalPrice || 0) - eventSupplierCosts;

        profitShare[evCurrency] += eventProfit * (partner.percentage / 100);

        // Deduct substitute costs that replace THIS partner
        (ev.participants || []).forEach(p => {
          if (p.isSubstitute && p.replacesPartnerId && p.replacesPartnerId.toString() === partner._id.toString()) {
            const pCurrency = p.currency || 'Shekel';
            substituteDeductions[pCurrency] += (p.expectedPay || 0);
          }
        });

        if (partner.linkedSupplierIds && partner.linkedSupplierIds.length > 0) {
          const linkedIds = partner.linkedSupplierIds.map(s => s._id.toString());
          (ev.participants || []).forEach(p => {
            if (p.supplierId && linkedIds.includes(p.supplierId.toString()) && !p.isSubstitute) {
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
        linkedSupplierNames: partner.linkedSupplierIds ? partner.linkedSupplierIds.map(s => s.name).join(', ') : null,
        profitShare,
        supplierEarnings,
        substituteDeductions,
        totalEarnings: {
          Shekel: profitShare.Shekel + supplierEarnings.Shekel - substituteDeductions.Shekel,
          Dollar: profitShare.Dollar + supplierEarnings.Dollar - substituteDeductions.Dollar,
          Euro: profitShare.Euro + supplierEarnings.Euro - substituteDeductions.Euro,
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
