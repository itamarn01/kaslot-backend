const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner');

// GET all partners
router.get('/', async (req, res) => {
  try {
    const partners = await Partner.find().populate('linkedSupplierId');
    res.json(partners);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create partner
router.post('/', async (req, res) => {
  try {
    const { name, percentage, linkedSupplierId } = req.body;

    // Validate total percentage won't exceed 100
    const existingPartners = await Partner.find();
    const currentTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0);
    if (currentTotal + percentage > 100) {
      return res.status(400).json({
        message: `לא ניתן להוסיף ${percentage}%. סה"כ נוכחי: ${currentTotal}%. מקסימום: ${100 - currentTotal}%`
      });
    }

    const partner = new Partner({ name, percentage, linkedSupplierId: linkedSupplierId || null });
    await partner.save();
    const populated = await Partner.findById(partner._id).populate('linkedSupplierId');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT update partner
router.put('/:id', async (req, res) => {
  try {
    const { name, percentage, linkedSupplierId } = req.body;

    // Validate total percentage won't exceed 100 (excluding current partner)
    const existingPartners = await Partner.find({ _id: { $ne: req.params.id } });
    const currentTotal = existingPartners.reduce((sum, p) => sum + p.percentage, 0);
    if (currentTotal + percentage > 100) {
      return res.status(400).json({
        message: `לא ניתן לעדכן ל-${percentage}%. סה"כ שותפים אחרים: ${currentTotal}%. מקסימום: ${100 - currentTotal}%`
      });
    }

    const partner = await Partner.findByIdAndUpdate(
      req.params.id,
      { name, percentage, linkedSupplierId: linkedSupplierId || null },
      { new: true }
    ).populate('linkedSupplierId');

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

module.exports = router;
