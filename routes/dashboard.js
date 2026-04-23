const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Payment = require('../models/Payment');
const Supplier = require('../models/Supplier');
const Partner = require('../models/Partner');
const Budget = require('../models/Budget');
const ClientPayment = require('../models/ClientPayment');
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

    // Client payments received (cash received from clients)
    const clientPayments = await ClientPayment.find({ userId: req.userId });
    const clientPaymentsReceived = { Shekel: 0, Dollar: 0, Euro: 0 };
    clientPayments.forEach(cp => {
      clientPaymentsReceived.Shekel += (cp.amount || 0);
    });

    // רווח קופה = מה שהתקבל מלקוחות פחות מה שנדרש לספקים/מוזיקאים
    const totalProfit = {
        Shekel: clientPaymentsReceived.Shekel - totalExpectedPay.Shekel,
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

    // ----- Budget deduction logic -----
    const currentYear = new Date().getFullYear();
    const budget = await Budget.findOne({ userId: req.userId, year: currentYear });

    // How many months of budget have been charged up to today
    let monthsElapsed = 0;
    if (budget) {
      const now = new Date();
      monthsElapsed = now.getMonth() + 1; // 1-based month (Jan=1)
      if (now.getDate() < budget.deductionDay) {
        monthsElapsed = Math.max(0, monthsElapsed - 1);
      }
    }

    const partners = await Partner.find({ userId: req.userId }).populate('linkedSupplierIds');
    const partnerEarnings = partners.map(partner => {
      let profitShare = { Shekel: 0, Dollar: 0, Euro: 0 };
      let supplierEarnings = { Shekel: 0, Dollar: 0, Euro: 0 };
      let substituteDeductions = { Shekel: 0, Dollar: 0, Euro: 0 };

      events.forEach(ev => {
        const evCurrency = ev.currency || 'Shekel';
        const eventSupplierCosts = (ev.participants || [])
          .filter(p => !p.isSubstitute && (p.currency || 'Shekel') === evCurrency)
          .reduce((sum, p) => sum + (p.expectedPay || 0), 0);
        const eventProfit = (ev.totalPrice || 0) - eventSupplierCosts;

        let effectivePercentage = partner.percentage;
        if (ev.customPartners) {
          if (!ev.participatingPartners || !ev.participatingPartners.map(id => id.toString()).includes(partner._id.toString())) {
             effectivePercentage = 0;
          } else {
             const activePartners = partners.filter(p => ev.participatingPartners.map(id => id.toString()).includes(p._id.toString()));
             const totalActivePercentage = activePartners.reduce((sum, p) => sum + p.percentage, 0);
             effectivePercentage = totalActivePercentage > 0 ? (partner.percentage / totalActivePercentage) * 100 : 0;
          }
        }

        profitShare[evCurrency] += eventProfit * (effectivePercentage / 100);

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

      // Monthly budget deduction for this partner (charged months so far this year)
      const monthlyBudgetDeduction = budget
        ? (budget.amount / 12) * (partner.percentage / 100)
        : 0;
      const totalBudgetDeduction = Math.round(monthlyBudgetDeduction * monthsElapsed * 100) / 100;

      return {
        _id: partner._id,
        name: partner.name,
        percentage: partner.percentage,
        linkedSupplierNames: partner.linkedSupplierIds ? partner.linkedSupplierIds.map(s => s.name).join(', ') : null,
        profitShare,
        supplierEarnings,
        substituteDeductions,
        budgetDeduction: totalBudgetDeduction,
        monthlyBudgetDeduction: Math.round(monthlyBudgetDeduction * 100) / 100,
        totalEarnings: {
          Shekel: profitShare.Shekel + supplierEarnings.Shekel - substituteDeductions.Shekel - totalBudgetDeduction,
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
      partnerEarnings,
      budget: budget || null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
