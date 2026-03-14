const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner');
const { authMiddleware } = require('../middleware/auth');

// GET partner report (public for sharing)
router.get('/:id/report', async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id).populate('linkedSupplierIds');
    if (!partner) return res.status(404).json({ message: 'שותף לא נמצא' });

    const Event = require('../models/Event');
    const Payment = require('../models/Payment');
    const events = await Event.find({ userId: partner.userId })
      .populate('participants.supplierId', 'name role')
      .sort({ date: -1 });

    const eventsWithParticipant = [];
    const totalExpected = { Shekel: 0, Dollar: 0, Euro: 0 };
    
    events.forEach(ev => {
      const evCurrency = ev.currency || 'Shekel';
      const eventSupplierCosts = (ev.participants || [])
        .filter(p => !p.isSubstitute && (p.currency || 'Shekel') === evCurrency)
        .reduce((sum, p) => sum + (p.expectedPay || 0), 0);
      const eventProfit = (ev.totalPrice || 0) - eventSupplierCosts;

      let partnerShare = eventProfit * (partner.percentage / 100);
      let supplierEarnings = 0;
      let substituteDeduction = 0;
      let hasSupplierEarning = false;
      const substitutes = [];

      (ev.participants || []).forEach(p => {
        if (p.isSubstitute && p.replacesPartnerId && p.replacesPartnerId.toString() === partner._id.toString()) {
          const pCurrency = p.currency || 'Shekel';
          const substituteName = p.supplierId?.name || 'ספק לא ידוע';
          const substituteRole = p.supplierId?.role || '';
          substitutes.push({
            name: substituteName,
            role: substituteRole,
            pay: p.expectedPay || 0,
            currency: pCurrency
          });
          if (pCurrency === evCurrency) {
            substituteDeduction += (p.expectedPay || 0);
          }
        }
      });

      const linkedIds = partner.linkedSupplierIds ? partner.linkedSupplierIds.map(s => s._id.toString()) : [];
      (ev.participants || []).forEach(p => {
        if (p.supplierId && linkedIds.includes(p.supplierId._id?.toString() || p.supplierId.toString()) && !p.isSubstitute) {
          const pCurrency = p.currency || 'Shekel';
          if (pCurrency === evCurrency) {
             supplierEarnings += (p.expectedPay || 0);
             hasSupplierEarning = true;
          } else {
             totalExpected[pCurrency] = (totalExpected[pCurrency] || 0) + (p.expectedPay || 0);
          }
        }
      });

      if (partnerShare > 0 || hasSupplierEarning || substituteDeduction > 0) {
         const netEarning = partnerShare + supplierEarnings - substituteDeduction;
         eventsWithParticipant.push({
           _id: ev._id,
           title: ev.title,
           date: ev.date,
           location: ev.location,
           partnerShare,
           supplierEarnings,
           substituteDeduction,
           substitutes,
           expectedPay: netEarning,
           currency: evCurrency
         });
         totalExpected[evCurrency] = (totalExpected[evCurrency] || 0) + netEarning;
      }
    });

    const linkedIds = partner.linkedSupplierIds ? partner.linkedSupplierIds.map(s => s._id) : [];
    const payments = await Payment.find({
      $or: [
        { partnerId: req.params.id },
        { supplierId: { $in: linkedIds } }
      ]
    }).populate('eventId', 'title date').sort({ date: -1 });

    const totalPaid = { Shekel: 0, Dollar: 0, Euro: 0 };
    payments.forEach(p => {
      const pCurrency = p.currency || 'Shekel';
      totalPaid[pCurrency] = (totalPaid[pCurrency] || 0) + p.amount;
    });

    // Budget deduction info for this partner
    const Budget = require('../models/Budget');
    const currentYear = new Date().getFullYear();
    const budget = await Budget.findOne({ userId: partner.userId, year: currentYear });

    let monthsElapsed = 0;
    let monthlyBudgetDeduction = 0;
    let totalBudgetDeduction = 0;

    if (budget) {
      const now = new Date();
      monthsElapsed = now.getMonth() + 1;
      if (now.getDate() < budget.deductionDay) {
        monthsElapsed = Math.max(0, monthsElapsed - 1);
      }
      monthlyBudgetDeduction = Math.round((budget.amount / 12) * (partner.percentage / 100) * 100) / 100;
      totalBudgetDeduction = Math.round(monthlyBudgetDeduction * monthsElapsed * 100) / 100;
    }

    res.json({
      partner,
      events: eventsWithParticipant,
      payments,
      totalExpected,
      totalPaid,
      budgetInfo: {
        budget,
        monthlyBudgetDeduction,
        totalBudgetDeduction,
        monthsElapsed
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// All routes below require authentication
router.use(authMiddleware);

// GET all partners (for current user)
router.get('/', async (req, res) => {
  try {
    const partners = await Partner.find({ userId: req.userId }).populate('linkedSupplierIds');
    res.json(partners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create partner
router.post('/', async (req, res) => {
  try {
    const { name, percentage, linkedSupplierIds } = req.body;

    // Validate total percentage won't exceed 100
    const existingPartners = await Partner.find({ userId: req.userId });
    const currentTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0);
    if (currentTotal + percentage > 100) {
      return res.status(400).json({
        message: `לא ניתן להוסיף ${percentage}%. סה"כ נוכחי: ${currentTotal}%. מקסימום: ${100 - currentTotal}%`
      });
    }

    const SupplierModel = require('../models/Supplier');
    const autoLinkedSuppliers = await SupplierModel.find({ name: name, userId: req.userId });
    const autoLinkedIds = autoLinkedSuppliers.map(s => s._id.toString());
    
    let combinedIds = Array.isArray(linkedSupplierIds) ? linkedSupplierIds.map(id => id.toString()) : [];
    autoLinkedIds.forEach(id => {
      if (!combinedIds.includes(id)) combinedIds.push(id);
    });

    const partner = new Partner({ name, percentage, linkedSupplierIds: combinedIds, userId: req.userId });
    await partner.save();
    const populated = await Partner.findById(partner._id).populate('linkedSupplierIds');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update partner
router.put('/:id', async (req, res) => {
  try {
    const { name, percentage, linkedSupplierIds } = req.body;

    const existingPartners = await Partner.find({ _id: { $ne: req.params.id }, userId: req.userId });
    const currentTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0);
    if (currentTotal + percentage > 100) {
      return res.status(400).json({
        message: `לא ניתן לעדכן ל-${percentage}%. סה"כ שותפים אחרים: ${currentTotal}%. מקסימום: ${100 - currentTotal}%`
      });
    }

    const SupplierModel = require('../models/Supplier');
    const autoLinkedSuppliers = await SupplierModel.find({ name: name, userId: req.userId });
    const autoLinkedIds = autoLinkedSuppliers.map(s => s._id.toString());
    
    let combinedIds = Array.isArray(linkedSupplierIds) ? linkedSupplierIds.map(id => id.toString()) : [];
    autoLinkedIds.forEach(id => {
      if (!combinedIds.includes(id)) combinedIds.push(id);
    });

    const partner = await Partner.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { name, percentage, linkedSupplierIds: combinedIds },
      { new: true }
    ).populate('linkedSupplierIds');

    if (!partner) return res.status(404).json({ message: 'שותף לא נמצא' });
    res.json(partner);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE partner
router.delete('/:id', async (req, res) => {
  try {
    const partner = await Partner.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!partner) return res.status(404).json({ message: 'שותף לא נמצא' });
    res.json({ message: 'השותף נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;
