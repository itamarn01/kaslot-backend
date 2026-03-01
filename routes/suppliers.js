const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const Payment = require('../models/Payment');
const Event = require('../models/Event');

// Get all suppliers
router.get('/', async (req, res) => {
  try {
    const suppliers = await Supplier.find().sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a supplier
router.post('/', async (req, res) => {
  try {
    const newSupplier = new Supplier(req.body);
    const savedSupplier = await newSupplier.save();
    res.status(201).json(savedSupplier);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a supplier
router.put('/:id', async (req, res) => {
  try {
    const updatedSupplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedSupplier);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a supplier
router.delete('/:id', async (req, res) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id);
    // Optionally: remove from all events and delete their payments
    await Event.updateMany({}, { $pull: { participants: { supplierId: req.params.id } } });
    await Payment.deleteMany({ supplierId: req.params.id });
    res.json({ message: 'Supplier deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get full supplier report (for sharing)
router.get('/:id/report', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    // Events where this supplier participates
    const events = await Event.find({ 'participants.supplierId': req.params.id }).sort({ date: -1 });
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

    // All payments to this supplier
    const payments = await Payment.find({ supplierId: req.params.id })
      .populate('eventId', 'title date')
      .sort({ date: -1 });

    // Calculate totals per currency
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
