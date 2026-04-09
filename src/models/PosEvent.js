// ============================================================
// KOUTIX — POS Event Model (sync event log)
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const PosEventSchema = new Schema(
  {
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    posType: {
      type: String,
      enum: ['ls_retail', 'sap', 'custom'],
      required: true,
    },
    rawPayload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    convertedPayload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['success', 'fail'],
      required: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
)

PosEventSchema.index({ branchId: 1, receivedAt: -1 })
PosEventSchema.index({ branchId: 1, status: 1 })

module.exports = mongoose.model('PosEvent', PosEventSchema)
