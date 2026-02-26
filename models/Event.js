const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  location: {
    type: String
  },
  phone_number: {
    type: String
  },
  totalPrice: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    enum: ['Shekel', 'Dollar', 'Euro'],
    default: 'Shekel'
  },
  participants: [{
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true
    },
    expectedPay: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      enum: ['Shekel', 'Dollar', 'Euro'],
      default: 'Shekel'
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Event', EventSchema);
