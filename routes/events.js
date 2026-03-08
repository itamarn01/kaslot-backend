const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Payment = require('../models/Payment');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Get all events (for current user)
router.get('/', async (req, res) => {
  try {
    const events = await Event.find({ userId: req.userId })
      .populate('participants.supplierId', 'name role')
      .sort({ date: -1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, userId: req.userId })
      .populate('participants.supplierId', 'name role contact_info');
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create an event
router.post('/', async (req, res) => {
  try {
    const newEvent = new Event({ ...req.body, userId: req.userId });
    const savedEvent = await newEvent.save();
    res.status(201).json(savedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update an event
router.put('/:id', async (req, res) => {
  try {
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    );
    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete an event
router.delete('/:id', async (req, res) => {
  try {
    await Event.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    await Payment.deleteMany({ eventId: req.params.id, userId: req.userId });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add participant to event
router.post('/:id/participants', async (req, res) => {
  try {
    const { supplierId, expectedPay, currency } = req.body;
    const event = await Event.findOne({ _id: req.params.id, userId: req.userId });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    
    const exists = event.participants.find(p => p.supplierId.toString() === supplierId);
    if (exists) return res.status(400).json({ message: 'Supplier already added to this event' });

    event.participants.push({ supplierId, expectedPay, currency });
    await event.save();
    
    const updatedEvent = await Event.findById(req.params.id).populate('participants.supplierId', 'name role');
    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Remove participant from event
router.delete('/:id/participants/:supplierId', async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, userId: req.userId });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    
    event.participants = event.participants.filter(p => p.supplierId.toString() !== req.params.supplierId);
    await event.save();
    
    await Payment.deleteMany({ eventId: req.params.id, supplierId: req.params.supplierId, userId: req.userId });
    
    res.json(event);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update participant in event
router.put('/:id/participants/:supplierId', async (req, res) => {
  try {
    const { expectedPay, currency } = req.body;
    const event = await Event.findOne({ _id: req.params.id, userId: req.userId });
    if (!event) return res.status(404).json({ message: 'Event not found' });
    
    const participant = event.participants.find(p => p.supplierId.toString() === req.params.supplierId);
    if (!participant) return res.status(404).json({ message: 'Supplier not found in this event' });

    if (expectedPay !== undefined) participant.expectedPay = expectedPay;
    if (currency !== undefined) participant.currency = currency;

    await event.save();
    
    const updatedEvent = await Event.findById(req.params.id).populate('participants.supplierId', 'name role');
    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
