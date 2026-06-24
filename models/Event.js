const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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
  eventType: {
    type: String,
    enum: ['חתונה', 'בר/בת מצווה', 'צוות 1', 'צוות 2', 'אירוע עירייה', 'מופע', 'אחר'],
    default: 'חתונה'
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
    },
    isSubstitute: {
      type: Boolean,
      default: false
    },
    replacesPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      default: null
    }
  }],
  customPartners: {
    type: Boolean,
    default: false
  },
  participatingPartners: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Partner'
  }],
  expenses: [{
    description: {
      type: String,
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
    date: {
      type: Date,
      default: Date.now
    },
    method: {
      type: String,
      enum: ['Cash', 'Bit', 'Paybox', 'Bank Transfer', 'Check', 'Credit Card'],
      default: 'Credit Card'
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
    }
  }],
  fromGoogleCalendar: {
    type: Boolean,
    default: false
  },
  googleCalendarEventId: {
    type: String,
    default: null
  },
  googleCalendarId: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Event', EventSchema);
