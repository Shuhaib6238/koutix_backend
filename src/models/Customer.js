// ============================================================
// SelfPay — Customer Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const CustomerSchema = new Schema(
  {
    firebaseUid:   { type: String, required: true, unique: true, index: true },
    phone:         { type: String, sparse: true, trim: true },
    email:         { type: String, sparse: true, lowercase: true, trim: true },
    name:          { type: String, trim: true },
    photoUrl:      String,
    role:          { type: String, default: 'customer', immutable: true },
    authProvider:  {
      type: String,
      enum: ['phone', 'google', 'apple'],
      required: true,
    },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Customer', CustomerSchema)
