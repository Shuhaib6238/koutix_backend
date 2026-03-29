// ============================================================
// SelfPay — ChainManager Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const ChainManagerSchema = new Schema(
  {
    email:                { type: String, required: true, unique: true, lowercase: true, trim: true },
    firebaseUid:          { type: String, required: true, unique: true, index: true },
    businessName:         { type: String, required: true, trim: true },
    phone:                { type: String, trim: true },
    role:                 { type: String, default: 'chain_manager', immutable: true },
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
    branches: [{ type: Schema.Types.ObjectId, ref: 'BranchManager' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

module.exports = mongoose.model('ChainManager', ChainManagerSchema)
