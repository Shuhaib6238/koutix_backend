// ============================================================
// KOUTIX — Audit Log Model
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

const AuditLogSchema = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userEmail:  { type: String, index: true },
    action:     { type: String, required: true }, // e.g., 'STORE_APPROVED', 'USER_DEACTIVATED'
    entityType: { type: String, required: true }, // e.g., 'Store', 'User', 'Chain'
    entityId:   { type: Schema.Types.ObjectId, index: true },
    details:    { type: Schema.Types.Mixed }, // Arbitrary JSON data
    ipAddress:  String,
    userAgent:  String,
    severity:   { type: String, enum: ['info', 'warning', 'error', 'critical'], default: 'info' },
  },
  { timestamps: true }
)

AuditLogSchema.index({ createdAt: -1 })
AuditLogSchema.index({ action: 1, createdAt: -1 })

module.exports = mongoose.model('AuditLog', AuditLogSchema)
