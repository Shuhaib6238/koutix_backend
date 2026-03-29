// ============================================================
// SelfPay — StoreManager Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const StoreManagerSchema = new Schema(
  {
    email:                { type: String, required: true, unique: true, lowercase: true, trim: true },
    firebaseUid:          { type: String, required: true, unique: true, index: true },
    name:                 { type: String, required: true, trim: true },
    phone:                { type: String, trim: true },
    role:                 { type: String, default: 'store_manager', immutable: true },
    storeName:            { type: String, required: true, trim: true },
    storeAddress:         { type: String, trim: true },
    plan:                 {
      type: String,
      enum: ['basic', 'standard', 'pro'],
      default: 'basic',
    },
    stripeCustomerId:     String,
    stripeSubscriptionId: String,
    subscriptionStatus:   {
      type: String,
      enum: ['pending', 'trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete'],
      default: 'pending',
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('StoreManager', StoreManagerSchema)
