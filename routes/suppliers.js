const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const Payment = require('../models/Payment');
const Event = require('../models/Event');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Get all suppliers (for current user)
router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a supplier
router.post('/', async (req, res) => {
  try {
    const newSupplier = new Supplier({ ...req.body, userId: req.userId });
    const savedSupplier = await newSupplier.save();
    
    // Auto-link to partner if name matches
    const Partner = require('../models/Partner');
    const matchingPartner = await Partner.findOne({ name: savedSupplier.name, userId: req.userId });
    if (matchingPartner) {
      if (!matchingPartner.linkedSupplierIds.includes(savedSupplier._id)) {
        matchingPartner.linkedSupplierIds.push(savedSupplier._id);
        await matchingPartner.save();
      }
    }

    res.status(201).json(savedSupplier);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a supplier
router.put('/:id', async (req, res) => {
  try {
    const updatedSupplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    );
    
    // Auto-link to partner if name matches
    const Partner = require('../models/Partner');
    const matchingPartner = await Partner.findOne({ name: updatedSupplier.name, userId: req.userId });
    if (matchingPartner) {
      if (!matchingPartner.linkedSupplierIds.includes(updatedSupplier._id)) {
        matchingPartner.linkedSupplierIds.push(updatedSupplier._id);
        await matchingPartner.save();
      }
    }

    res.json(updatedSupplier);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a supplier
router.delete('/:id', async (req, res) => {
  try {
    await Supplier.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    await Event.updateMany({ userId: req.userId }, { $pull: { participants: { supplierId: req.params.id } } });
    await Payment.deleteMany({ supplierId: req.params.id, userId: req.userId });
    res.json({ message: 'Supplier deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get full supplier report (public - for sharing)
router.get('/:id/report', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const events = await Event.find({ 'participants.supplierId': req.params.id, userId: supplier.userId }).sort({ date: -1 });
    const eventsWithParticipant = events.map(ev => {
      const participant = ev.participants.find(p => p.supplierId.toString() === req.params.id);
      return {
        _id: ev._id,
        title: ev.title,
        date: ev.date,
        location: ev.location,
        expectedPay: participant ? participant.expectedPay : 0,
        currency: participant ? participant.currency : 'Shekel'
      };
    });

    const payments = await Payment.find({ supplierId: req.params.id, userId: supplier.userId })
      .populate('eventId', 'title date')
      .sort({ date: -1 });

    const totalExpected = { Shekel: 0, Dollar: 0, Euro: 0 };
    eventsWithParticipant.forEach(ev => {
      totalExpected[ev.currency] = (totalExpected[ev.currency] || 0) + ev.expectedPay;
    });

    const totalPaid = { Shekel: 0, Dollar: 0, Euro: 0 };
    payments.forEach(p => {
      totalPaid[p.currency] = (totalPaid[p.currency] || 0) + p.amount;
    });

    res.json({
      supplier,
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
