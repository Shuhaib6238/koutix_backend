// ============================================================
// SelfPay — All Middleware
// ============================================================
const rateLimit = require('express-rate-limit')
const { admin, verifyIdToken } = require('../config/firebase')
const { SuperAdmin, ChainManager, BranchManager, StoreManager, Customer, Store } = require('../models')
const logger = require('../config/logger')

// ── Model lookup by role ─────────────────────────────────
const MODEL_BY_ROLE = {
  superadmin:     SuperAdmin,
  chain_manager:  ChainManager,
  branch_manager: BranchManager,
  store_manager:  StoreManager,
  customer:       Customer,
}

// ── Auth Middleware (Bearer token OR session cookie) ──────
async function authenticate(req, res, next) {
  try {
    let decoded

    // 1. Try Bearer token first (mobile app)
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split(' ')[1]
      decoded = await verifyIdToken(idToken)
    }

    // 2. Try session cookie (web)
    if (!decoded && req.cookies && req.cookies.session) {
      decoded = await admin.auth().verifySessionCookie(req.cookies.session, true)
    }

    if (!decoded) {
      return res.status(401).json({ success: false, message: 'No token provided' })
    }

    req.uid = decoded.uid
    const role = decoded.role

    if (!role) {
      return res.status(401).json({ success: false, message: 'No role assigned to this user' })
    }

    // Look up user in the correct model
    const Model = MODEL_BY_ROLE[role]
    if (!Model) {
      return res.status(401).json({ success: false, message: 'Unknown role' })
    }

    const user = await Model.findOne({ firebaseUid: decoded.uid, isActive: true })
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' })
    }

    req.user = user
    req.userRole = role
    next()
  } catch (err) {
    logger.error('Auth middleware error:', err.message)
    return res.status(401).json({ success: false, message: 'Invalid or expired token' })
  }
}

// ── Role Guards ───────────────────────────────────────────
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' })
    }
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' })
    }
    next()
  }
}

const requireSuperAdmin    = requireRole('superadmin')
const requireChainManager  = requireRole('superadmin', 'chain_manager')
const requireBranchManager = requireRole('superadmin', 'chain_manager', 'branch_manager')
const requireStoreManager  = requireRole('superadmin', 'store_manager')
const requireAnyStaff      = requireRole('superadmin', 'chain_manager', 'branch_manager', 'store_manager')
const requireCustomer      = requireRole('customer')

// ── IDOR: store access ────────────────────────────────────
async function canAccessStore(req, res, next) {
  try {
    const storeId = req.params.storeId || req.params.id
    if (!storeId) {
      return next()
    }

    const role = req.userRole

    if (role === 'superadmin') {
      return next()
    }

    const store = await Store.findById(storeId)
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' })
    }

    if (role === 'chain_manager') {
      if (!store.chainId || store.chainId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' })
      }
    } else if (role === 'branch_manager') {
      if (!store.chainId || store.chainId.toString() !== req.user.chainId?.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' })
      }
    } else if (role === 'customer') {
      if (store.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Store is not active' })
      }
    }

    next()
  } catch (err) {
    next(err)
  }
}

// ── IDOR: chain access ────────────────────────────────────
function canAccessChain(req, res, next) {
  const chainId = req.params.chainId
  const role = req.userRole

  if (role === 'superadmin') {
    return next()
  }

  if (role === 'chain_manager' && req.user._id.toString() === chainId) {
    return next()
  }

  if (role === 'branch_manager' && req.user.chainId?.toString() === chainId) {
    return next()
  }

  return res.status(403).json({ success: false, message: 'Access denied' })
}

// ── Rate Limiters ─────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
  message: { success: false, message: 'Too many login attempts, please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
})

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many webhook calls' },
})

// ── Error Handler ─────────────────────────────────────────
function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode || 500

  // MongoDB duplicate key
  if (err.code === 11000 || err.name === 'MongoServerError') {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field'
    return res.status(409).json({
      success: false,
      message: `Duplicate value for ${field}`,
      code: 'DUPLICATE_KEY',
    })
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message)
    return res.status(400).json({ success: false, message: 'Validation failed', errors })
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' })
  }

  if (statusCode >= 500) {
    logger.error(`[${_req.method}] ${_req.path} — ${err.message}`, { stack: err.stack })
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

// ── 404 Handler ───────────────────────────────────────────
function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  })
}

// ── AppError helper ───────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = {
  authenticate,
  requireRole,
  requireSuperAdmin,
  requireChainManager,
  requireBranchManager,
  requireStoreManager,
  requireAnyStaff,
  requireCustomer,
  canAccessStore,
  canAccessChain,
  generalLimiter,
  authLimiter,
  webhookLimiter,
  errorHandler,
  notFound,
  AppError,
}
