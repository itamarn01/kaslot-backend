const mongoose = require('mongoose');

const ClientPaymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  method: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Check', 'Bit', 'Paybox'],
    required: true
  },
  type: {
    type: String,
    enum: ['advance', 'regular'],
    default: 'regular'
  },
  date: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('ClientPayment', ClientPaymentSchema);
