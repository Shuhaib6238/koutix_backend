// ============================================================
// SelfPay — Express App
// ============================================================
require('dotenv').config()

const express      = require('express')
const helmet       = require('helmet')
const cors         = require('cors')
const compression  = require('compression')
const morgan       = require('morgan')
const mongoSanitize = require('express-mongo-sanitize')
const cookieParser = require('cookie-parser')

const { generalLimiter, authLimiter, errorHandler, notFound } = require('./middleware')
const logger = require('./config/logger')

// Routes
const authRoutes      = require('./routes/auth')
const storeRoutes     = require('./routes/stores')
const productRoutes   = require('./routes/products')
const orderRoutes     = require('./routes/orders')
const promotionRoutes = require('./routes/promotions')
const adminRoutes     = require('./routes/admin')
const posRoutes       = require('./routes/pos')
const userRoutes      = require('./routes/users')
const webhookRoutes   = require('./routes/webhooks')

const app = express()

// ── Security ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', '*.cloudfront.net'],
    },
  },
}))

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.WEB_URL, process.env.APP_URL, 'https://selfpay.com']
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Signature'],
}))

// ── Webhooks MUST use raw body (before express.json) ──────
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }))

// ── Body parsing & cookies ────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ── Sanitization ──────────────────────────────────────────
app.use(mongoSanitize())

// ── Compression ───────────────────────────────────────────
app.use(compression())

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }))
}

// ── Rate limiting ─────────────────────────────────────────
app.use('/api/auth', authLimiter)
app.use('/api',      generalLimiter)

// ── Health check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV,
  })
})

// ── API Routes ────────────────────────────────────────────
// Auth routes (new SelfPay structure — no /v1 prefix)
app.use('/api/auth', authRoutes)

// Legacy v1 routes
const API = '/api/v1'
app.use(`${API}/webhooks`,    webhookRoutes)
app.use(`${API}/stores`,      storeRoutes)
app.use(`${API}/stores/:storeId/products`, productRoutes)
app.use(`${API}/orders`,      orderRoutes)
app.use(`${API}/promotions`,  promotionRoutes)
app.use(`${API}/admin`,       adminRoutes)
app.use(`${API}/pos`,         posRoutes)
app.use(`${API}/users`,       userRoutes)

// Chain-scoped user routes
const chainUserRouter = require('express').Router()
const userCtrl = require('./controllers/users')
const { authenticate, canAccessChain, canAccessStore } = require('./middleware')

chainUserRouter.use(authenticate)
chainUserRouter.get('/:chainId/users',  canAccessChain,  userCtrl.getChainUsers)
chainUserRouter.get('/:storeId/users',  canAccessStore,  userCtrl.getStoreUsers)

app.use(`${API}/chains`, chainUserRouter)

// ── 404 + Error handlers ──────────────────────────────────
app.use(notFound)
app.use(errorHandler)

module.exports = app
