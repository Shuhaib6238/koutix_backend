// ============================================================
// SelfPay — BranchManager Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const BranchManagerSchema = new Schema(
  {
    email:         { type: String, required: true, lowercase: true, trim: true },
    firebaseUid:   { type: String, sparse: true, index: true },
    name:          { type: String, trim: true },
    phone:         { type: String, trim: true },
    role:          { type: String, default: 'branch_manager', immutable: true },
    chainId:       { type: Schema.Types.ObjectId, ref: 'ChainManager', required: true, index: true },
    branchName:    { type: String, required: true, trim: true },
    branchAddress: { type: String, trim: true },
    isActive:      { type: Boolean, default: false },
    activatedAt:   Date,
  },
  { timestamps: true }
)

BranchManagerSchema.index({ email: 1, chainId: 1 }, { unique: true })

module.exports = mongoose.model('BranchManager', BranchManagerSchema)
