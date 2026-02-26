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
  }
}, { timestamps: true });

module.exports = mongoose.model('Supplier', SupplierSchema);
