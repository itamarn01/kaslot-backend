const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner');

// GET all partners
router.get('/', async (req, res) => {
  try {
    const partners = await Partner.find().populate('linkedSupplierIds');
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
    const existingPartners = await Partner.find();
    const currentTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0);
    if (currentTotal + percentage > 100) {
      return res.status(400).json({
        message: `לא ניתן להוסיף ${percentage}%. סה"כ נוכחי: ${currentTotal}%. מקסימום: ${100 - currentTotal}%`
      });
    }

    const { Supplier } = require('../models/Supplier'); // if needed, but we can just require it at the top
    
    // Find suppliers with matching exact name
    const SupplierModel = require('../models/Supplier');
    const autoLinkedSuppliers = await SupplierModel.find({ name: name });
    const autoLinkedIds = autoLinkedSuppliers.map(s => s._id.toString());
    
    // Combine explicit and auto-linked
    let combinedIds = Array.isArray(linkedSupplierIds) ? linkedSupplierIds.map(id => id.toString()) : [];
    autoLinkedIds.forEach(id => {
      if (!combinedIds.includes(id)) combinedIds.push(id);
    });

    const partner = new Partner({ name, percentage, linkedSupplierIds: combinedIds });
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

    // Validate total percentage won't exceed 100 (excluding current partner)
    const existingPartners = await Partner.find({ _id: { $ne: req.params.id } });
    const currentTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0);
    if (currentTotal + percentage > 100) {
      return res.status(400).json({
        message: `לא ניתן לעדכן ל-${percentage}%. סה"כ שותפים אחרים: ${currentTotal}%. מקסימום: ${100 - currentTotal}%`
      });
    }

    // Find suppliers with matching exact name
    const SupplierModel = require('../models/Supplier');
    const autoLinkedSuppliers = await SupplierModel.find({ name: name });
    const autoLinkedIds = autoLinkedSuppliers.map(s => s._id.toString());
    
    // Combine explicit and auto-linked
    let combinedIds = Array.isArray(linkedSupplierIds) ? linkedSupplierIds.map(id => id.toString()) : [];
    autoLinkedIds.forEach(id => {
      if (!combinedIds.includes(id)) combinedIds.push(id);
    });

    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
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
    const partner = await Partner.findByIdAndDelete(req.params.id);
    if (!partner) return res.status(404).json({ message: 'שותף לא נמצא' });
    res.json({ message: 'השותף נמחק בהצלחה' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET partner report
router.get('/:id/report', async (req, res) => {
  try {
    const partner = await Partner.findById(req.params.id).populate('linkedSupplierIds');
    if (!partner) return res.status(404).json({ message: 'שותף לא נמצא' });

    const Event = require('../models/Event');
    const Payment = require('../models/Payment');
    const events = await Event.find().sort({ date: -1 });

    const eventsWithParticipant = [];
    const totalExpected = { Shekel: 0, Dollar: 0, Euro: 0 };
    
    events.forEach(ev => {
      const evCurrency = ev.currency || 'Shekel';
      const eventSupplierCosts = (ev.participants || [])
        .filter(p => (p.currency || 'Shekel') === evCurrency)
        .reduce((sum, p) => sum + (p.expectedPay || 0), 0);
      const eventProfit = (ev.totalPrice || 0) - eventSupplierCosts;

      let partnerShare = eventProfit * (partner.percentage / 100);
      let supplierEarnings = 0;
      let hasSupplierEarning = false;

      const linkedIds = partner.linkedSupplierIds ? partner.linkedSupplierIds.map(s => s._id.toString()) : [];
      (ev.participants || []).forEach(p => {
        if (p.supplierId && linkedIds.includes(p.supplierId.toString())) {
          // Add supplier earning (only supporting matching currency for simplicity, or we separate them)
          const pCurrency = p.currency || 'Shekel';
          if (pCurrency === evCurrency) {
             supplierEarnings += (p.expectedPay || 0);
             hasSupplierEarning = true;
          } else {
             // If different currency, just add it to totalExpected for that currency but for reporting per event we keep it simple
             totalExpected[pCurrency] = (totalExpected[pCurrency] || 0) + (p.expectedPay || 0);
          }
        }
      });

      // If partner earned anything from this event
      if (partnerShare > 0 || hasSupplierEarning) {
         eventsWithParticipant.push({
           _id: ev._id,
           title: ev.title,
           date: ev.date,
           location: ev.location,
           partnerShare,
           supplierEarnings,
           expectedPay: partnerShare + supplierEarnings,
           currency: evCurrency
         });
         totalExpected[evCurrency] = (totalExpected[evCurrency] || 0) + partnerShare + supplierEarnings;
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

    res.json({
      partner,
      events: eventsWithParticipant,
      payments,
      totalExpected,
      totalPaid
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
