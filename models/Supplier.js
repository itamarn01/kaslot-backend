const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  contact_info: {
    type: String
  },
  default_price: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'Shekel'
  }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', SupplierSchema);
