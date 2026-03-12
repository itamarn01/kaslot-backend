const express = require('express');
const router = express.Router();
const ClientPayment = require('../models/ClientPayment');
const Event = require('../models/Event');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET all client payments for current user (optionally filter by eventId)
router.get('/', async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.eventId) filter.eventId = req.query.eventId;
    const payments = await ClientPayment.find(filter)
      .populate('eventId', 'title date totalPrice currency')
      .sort({ date: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST create a client payment
router.post('/', async (req, res) => {
  try {
    const { eventId, amount, method, type, date, note } = req.body;
    // Verify event belongs to user
    const event = await Event.findOne({ _id: eventId, userId: req.userId });
    if (!event) return res.status(404).json({ message: 'אירוע לא נמצא' });

    const payment = new ClientPayment({
      userId: req.userId,
      eventId,
      amount: Number(amount),
      method,
      type: type || 'regular',
      date: date || new Date(),
      note: note || ''
    });
    await payment.save();
    const populated = await ClientPayment.findById(payment._id).populate('eventId', 'title date totalPrice currency');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// PUT update a client payment
router.put('/:id', async (req, res) => {
  try {
    const payment = await ClientPayment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    ).populate('eventId', 'title date totalPrice currency');
    if (!payment) return res.status(404).json({ message: 'תשלום לא נמצא' });
    res.json(payment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// DELETE a client payment
router.delete('/:id', async (req, res) => {
  try {
    const payment = await ClientPayment.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!payment) return res.status(404).json({ message: 'תשלום לא נמצא' });
    res.json({ message: 'נמחק בהצלחה' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET summary: per-event balance (how much paid vs total price)
router.get('/summary', async (req, res) => {
  try {
    const events = await Event.find({ userId: req.userId }).sort({ date: -1 });
    const payments = await ClientPayment.find({ userId: req.userId });

    const eventSummaries = events.map(ev => {
      const evPayments = payments.filter(p => p.eventId.toString() === ev._id.toString());
      const totalPaid = evPayments.reduce((sum, p) => sum + p.amount, 0);
      const balance = ev.totalPrice - totalPaid;
      return {
        _id: ev._id,
        title: ev.title,
        date: ev.date,
        totalPrice: ev.totalPrice,
        currency: ev.currency,
        eventType: ev.eventType,
        totalPaid,
        balance,
        payments: evPayments,
        isPaid: balance <= 0
      };
    });

    const totalExpected = eventSummaries.reduce((sum, e) => sum + e.totalPrice, 0);
    const totalReceived = eventSummaries.reduce((sum, e) => sum + e.totalPaid, 0);
    const totalOutstanding = eventSummaries.reduce((sum, e) => sum + Math.max(0, e.balance), 0);

    res.json({
      events: eventSummaries,
      totalExpected,
      totalReceived,
      totalOutstanding
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
