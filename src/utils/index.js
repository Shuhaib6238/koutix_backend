// ============================================================
// KOUTIX — Utility Helpers
// ============================================================
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')

// ── API Response helpers ──────────────────────────────────
function success(res, data, status = 200, message) {
  return res.status(status).json({
    success: true,
    data,
    ...(message && { message }),
  })
}

function successList(res, data, pagination) {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  })
}

function error(res, message, status = 400) {
  return res.status(status).json({ success: false, message })
}

// ── Order number generator ────────────────────────────────
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ORD-${timestamp}-${random}`
}

// ── Invite token ──────────────────────────────────────────
function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex')
}

// ── Pagination helper ─────────────────────────────────────
function getPaginationParams(query) {
  const page  = Math.max(1, parseInt(query.page  || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')))
  const skip  = (page - 1) * limit
  const sortBy    = query.sortBy    || 'createdAt'
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1
  return { page, limit, skip, sort: { [sortBy]: sortOrder } }
}

// ── Date range helper ─────────────────────────────────────
function getDateRange(query) {
  const from = query.from ? new Date(query.from) : null
  const to   = query.to   ? new Date(query.to)   : null
  if (!from && !to) return undefined
  const range = {}
  if (from) range.$gte = from
  if (to) {
    to.setHours(23, 59, 59, 999)
    range.$lte = to
  }
  return range
}

// ── VAT calculator ────────────────────────────────────────
function calculateVAT(subtotal, vatRate, vatIncluded) {
  if (vatIncluded) {
    const vatAmount = subtotal - subtotal / (1 + vatRate / 100)
    return {
      subtotal:  parseFloat((subtotal - vatAmount).toFixed(2)),
      vatAmount: parseFloat(vatAmount.toFixed(2)),
      total:     parseFloat(subtotal.toFixed(2)),
    }
  } else {
    const vatAmount = subtotal * (vatRate / 100)
    return {
      subtotal:  parseFloat(subtotal.toFixed(2)),
      vatAmount: parseFloat(vatAmount.toFixed(2)),
      total:     parseFloat((subtotal + vatAmount).toFixed(2)),
    }
  }
}

// ── HMAC webhook signature verifier ──────────────────────
function verifyHmacSignature(payload, signature, secret, algorithm = 'sha256') {
  const expected = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.replace(/^sha\d+=/, '')),
      Buffer.from(expected)
    )
  } catch {
    return false
  }
}

module.exports = {
  success,
  successList,
  error,
  generateOrderNumber,
  generateInviteToken,
  getPaginationParams,
  getDateRange,
  calculateVAT,
  verifyHmacSignature,
}
