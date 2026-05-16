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
const paymentRoutes   = require('./routes/payments')
const promotionRoutes = require('./routes/promotions')
const adminRoutes     = require('./routes/admin')
const posRoutes       = require('./routes/pos')
const posConnectionRoutes = require('./routes/posConnection')
const branchesRoutes      = require('./routes/branches')
const userRoutes      = require('./routes/users')
const statsRoutes     = require('./routes/stats')
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

// ── CORS (must run before all route definitions) ──────────
// Explicit allowlist for production; any localhost/127.0.0.1 port allowed in dev
// so Flutter Web (which picks a random port) can connect.
const explicitOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]
if (process.env.WEB_URL) {
  explicitOrigins.push(process.env.WEB_URL)
}

const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const corsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin / non-browser requests (curl, server-to-server)
    if (!origin) {
      return callback(null, true)
    }
    if (explicitOrigins.includes(origin)) {
      return callback(null, true)
    }
    if (localhostRegex.test(origin)) {
      return callback(null, true)
    }
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true)
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`))
  },
  credentials: true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Signature', 'X-Webhook-Secret'],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
// Explicit preflight handler — answers OPTIONS for every route.
app.options('*', cors(corsOptions))

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
app.use(`${API}/payments`,    paymentRoutes)
app.use(`${API}/promotions`,  promotionRoutes)
app.use(`${API}/admin`,       adminRoutes)
app.use(`${API}/pos`,         posRoutes)
app.use(`${API}/stats`,       statsRoutes)
app.use('/api/pos',            posConnectionRoutes)
app.use('/api/branches',       branchesRoutes)
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
