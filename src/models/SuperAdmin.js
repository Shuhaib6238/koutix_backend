// ============================================================
// SelfPay — SuperAdmin Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const SuperAdminSchema = new Schema(
  {
    email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    firebaseUid: { type: String, required: true, unique: true, index: true },
    role:       { type: String, default: 'superadmin', immutable: true },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('SuperAdmin', SuperAdminSchema)
