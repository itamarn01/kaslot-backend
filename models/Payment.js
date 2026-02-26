const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true
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
    enum: ['Cash', 'Bit', 'Paybox', 'Bank Transfer', 'Check'],
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
