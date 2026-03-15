const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Get all payments or payments for a specific event / supplier
router.get('/', async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.eventId) filter.eventId = req.query.eventId;
    if (req.query.supplierId) filter.supplierId = req.query.supplierId;
    if (req.query.partnerId) filter.partnerId = req.query.partnerId;
    
    const payments = await Payment.find(filter)
      .populate('supplierId', 'name')
      .populate('partnerId', 'name')
      .populate('eventId', 'title')
      .sort({ date: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a payment
router.post('/', async (req, res) => {
  try {
    const newPayment = new Payment({ ...req.body, userId: req.userId });
    const savedPayment = await newPayment.save();
    res.status(201).json(savedPayment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a payment
router.put('/:id', async (req, res) => {
  try {
    const updated = await Payment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'תשלום לא נמצא' });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a payment
router.delete('/:id', async (req, res) => {
  try {
    await Payment.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
