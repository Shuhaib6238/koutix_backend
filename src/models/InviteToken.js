// ============================================================
// SelfPay — InviteToken Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const InviteTokenSchema = new Schema(
  {
    token:      { type: String, required: true, unique: true, index: true },
    email:      { type: String, required: true, lowercase: true, trim: true },
    chainId:    { type: Schema.Types.ObjectId, ref: 'ChainManager', required: true },
    branchName: { type: String, required: true, trim: true },
    expiresAt:  { type: Date, required: true },
    used:       { type: Boolean, default: false },
    usedAt:     Date,
  },
  { timestamps: true }
)

// Auto-delete expired tokens after 1 hour past expiry
InviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 })
InviteTokenSchema.index({ email: 1, chainId: 1 })

module.exports = mongoose.model('InviteToken', InviteTokenSchema)
