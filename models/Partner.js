const mongoose = require('mongoose');

const PartnerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  linkedSupplierIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  }]
}, { timestamps: true });

module.exports = mongoose.model('Partner', PartnerSchema);
