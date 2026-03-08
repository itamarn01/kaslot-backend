const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    default: null
  },
  note: {
    type: String,
    default: ''
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    default: null
  },
  partnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner',
    default: null
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    enum: ['Shekel', 'Dollar', 'Euro'],
    default: 'Shekel'
  },
  method: {
    type: String,
    enum: ['Cash', 'Bit', 'Paybox', 'Bank Transfer', 'Check', 'Loan'],
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
