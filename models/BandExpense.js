const mongoose = require('mongoose');

const BandExpenseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  method: {
    type: String,
    enum: ['Cash', 'Bit', 'Paybox', 'Bank Transfer', 'Check', 'Loan', 'Credit Card'],
    required: true
  },
  installments: {
    type: Number,
    default: 1,
    min: 1
  },
  date: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String,
    required: true
  },
  linkedSupplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    default: null
  },
  linkedPartnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('BandExpense', BandExpenseSchema);
