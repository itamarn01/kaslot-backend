const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  deductionDay: {
    type: Number,
    required: true,
    min: 1,
    max: 28
  }
}, { timestamps: true });

// Ensure one budget per user per year
BudgetSchema.index({ userId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Budget', BudgetSchema);
