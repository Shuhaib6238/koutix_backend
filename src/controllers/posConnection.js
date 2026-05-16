// ============================================================
// KOUTIX — POS Connection Controller
// ============================================================
const crypto = require('crypto')
const { Store, Product } = require('../models')
const PosEvent = require('../models/PosEvent')
const { encryptObject } = require('../utils/encryption')
const { success, error } = require('../utils')
const { testConnection } = require('../services/pos/posSync.service')
const { receiveWebhook } = require('../services/pos/posSync.service')
const { schedulePosPullJob, removePosPullJob } = require('../jobs/posPull.job')
const logger = require('../config/logger')

// ── POST /api/pos/connect ────────────────────────────────
async function posConnect(req, res, next) {
  try {
    // Body is already validated by Zod middleware (posConnectSchema)
    const { posType, method, credentials, pullIntervalSeconds } = req.body

    // Get the branch/store for this branch manager
    const store = await getManagerStore(req)
    if (!store) {
      return error(res, 'No store found for this branch manager', 404)
    }

    // Test connection first
    const testResult = await testConnection({ posType, method, credentials })
    if (!testResult.success) {
      return error(res, `Connection test failed: ${testResult.message}`, 400)
    }

    // Encrypt credentials
    const encryptedCredentials = encryptObject(credentials)

    // Generate webhook secret if method is webhook
    const webhookSecret = method === 'webhook'
      ? crypto.randomBytes(32).toString('hex')
      : undefined

    // Build the posConnection object
    const posConnection = {
      posType,
      method,
      status:               'connected',
      encryptedCredentials,
      webhookSecret:        webhookSecret || store.posConnection?.webhookSecret,
      pullIntervalSeconds:  method === 'api_pull' ? (pullIntervalSeconds || 300) : undefined,
      lastSyncAt:           null,
      lastSyncStatus:       null,
      lastErrorMessage:     null,
    }

    await Store.findByIdAndUpdate(store._id, { posConnection })

    // If api_pull, schedule the BullMQ repeating job
    if (method === 'api_pull') {
      await schedulePosPullJob(store._id.toString(), pullIntervalSeconds || 300)
      const { getPosPullQueue } = require('../jobs/posPull.job')
      await getPosPullQueue().add('pull', { storeId: store._id.toString() })
    }

    // Build response
    const responseData = { success: true, posType, method, status: 'connected' }

    if (method === 'webhook') {
      responseData.webhookUrl = `${process.env.API_URL || 'http://localhost:5000'}/api/pos/webhook/${store._id}/${posType}`
      responseData.webhookSecret = webhookSecret
    }

    logger.info(`[POS Connect] Store ${store._id}: connected via ${method} (${posType})`)
    return success(res, responseData, 200, 'POS connected successfully')
  } catch (err) {
    next(err)
  }
}

// ── GET /api/pos/status ──────────────────────────────────
async function posStatus(req, res, next) {
  try {
    const store = await getManagerStore(req)
    if (!store) {
      return error(res, 'No store found for this branch manager', 404)
    }

    const pc = store.posConnection || {}

    // Return status without credentials
    return success(res, {
      posType:          pc.posType || null,
      method:           pc.method || null,
      status:           pc.status || 'disconnected',
      lastSyncAt:       pc.lastSyncAt || null,
      lastSyncStatus:   pc.lastSyncStatus || null,
      lastErrorMessage: pc.lastErrorMessage || null,
    })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/pos/test ───────────────────────────────────
// Tests the connection AND persists it on success (so the front-end
// "Connect POS" button — which posts here — flips status to 'connected').
async function posTest(req, res, next) {
  try {
    // Body is already validated by Zod middleware (posTestSchema)
    const { posType, method, credentials, pullIntervalSeconds } = req.body
    const result = await testConnection({ posType, method, credentials: credentials || {} })

    // If the test failed, return the result without persisting.
    if (!result.success) {
      return success(res, result, 200)
    }

    // Resolve the manager's store (skip persistence if we cannot — keep test-only behaviour).
    const store = await getManagerStore(req)
    if (!store) {
      return success(res, result, 200)
    }

    // Encrypt credentials and build the full posConnection sub-doc.
    const encryptedCredentials = encryptObject(credentials || {})
    const webhookSecret = method === 'webhook'
      ? crypto.randomBytes(32).toString('hex')
      : (store.posConnection?.webhookSecret || null)

    const posConnection = {
      posType,
      method,
      status:               'connected',
      encryptedCredentials,
      webhookSecret,
      pullIntervalSeconds:  method === 'api_pull' ? (pullIntervalSeconds || 300) : undefined,
      lastSyncAt:           null,
      lastSyncStatus:       null,
      lastErrorMessage:     null,
    }

    await Store.findByIdAndUpdate(store._id, { posConnection })

    if (method === 'api_pull') {
      await schedulePosPullJob(store._id.toString(), pullIntervalSeconds || 300)
      const { getPosPullQueue } = require('../jobs/posPull.job')
      await getPosPullQueue().add('pull', { storeId: store._id.toString() })
    }

    // Enrich response with webhook details when applicable, mirroring posConnect.
    const responseData = { ...result, status: 'connected', posType, method }
    if (method === 'webhook') {
      responseData.webhookUrl    = `${process.env.API_URL || 'http://localhost:5000'}/api/pos/webhook/${store._id}/${posType}`
      responseData.webhookSecret = webhookSecret
    }

    logger.info(`[POS Test→Connect] Store ${store._id}: connected via ${method} (${posType})`)
    return success(res, responseData, 200)
  } catch (err) {
    next(err)
  }
}

// ── DELETE /api/pos/disconnect ───────────────────────────
async function posDisconnect(req, res, next) {
  try {
    const store = await getManagerStore(req)
    if (!store) {
      return error(res, 'No store found for this branch manager', 404)
    }

    const wasApiPull = store.posConnection?.method === 'api_pull'

    await Store.findByIdAndUpdate(store._id, {
      'posConnection.status':               'disconnected',
      'posConnection.encryptedCredentials':  null,
      'posConnection.webhookSecret':         null,
      'posConnection.lastErrorMessage':      null,
    })

    // Remove BullMQ job if it was api_pull
    if (wasApiPull) {
      await removePosPullJob(store._id.toString())
    }

    logger.info(`[POS Disconnect] Store ${store._id}: disconnected`)
    return success(res, null, 200, 'POS disconnected successfully')
  } catch (err) {
    next(err)
  }
}

// ── POST /api/pos/webhook/:branchId/:posType (NO AUTH) ───
async function posWebhookReceiver(req, res, next) {
  try {
    const { branchId, posType } = req.params

    // Load branch
    const store = await Store.findById(branchId)
    if (!store) {
      return error(res, 'Branch not found', 404)
    }

    // Validate webhook secret
    const expectedSecret = store.posConnection?.webhookSecret
    const receivedSecret = req.headers['x-webhook-secret']

    if (!expectedSecret || !receivedSecret || receivedSecret !== expectedSecret) {
      logger.warn(`[POS Webhook] Invalid secret for store ${branchId}`)
      return res.status(401).json({ success: false, message: 'Invalid webhook secret' })
    }

    // Validate POS type matches
    if (store.posConnection?.posType !== posType) {
      return error(res, 'POS type mismatch', 400)
    }

    if (store.posConnection?.status !== 'connected') {
      return error(res, 'POS connection is not active', 400)
    }

    // Return 200 immediately — process async
    res.status(200).json({ success: true, message: 'Webhook received' })

    // Process asynchronously
    setImmediate(async () => {
      try {
        await receiveWebhook(branchId, req.body, posType)
      } catch (err) {
        logger.error(`[POS Webhook] Async processing failed for store ${branchId}:`, err.message)
      }
    })
  } catch (err) {
    // Always return 200 to SAP to prevent retry flooding
    logger.error('[POS Webhook] Error:', err.message)
    return res.status(200).json({ success: true, message: 'Webhook received' })
  }
}

// ── GET /api/pos/events ──────────────────────────────────
async function posEvents(req, res, next) {
  try {
    const store = await getManagerStore(req)
    if (!store) {
      return error(res, 'No store found for this branch manager', 404)
    }

    const events = await PosEvent.find({ branchId: store._id })
      .sort({ receivedAt: -1 })
      .limit(50)
      .lean()

    return success(res, events)
  } catch (err) {
    next(err)
  }
}

// ── POST /api/pos/sync-now ───────────────────────────────
// Enqueues an immediate one-shot pull job for the manager's store.
// Only meaningful for api_pull connections; webhook connections receive
// data via push so a manual trigger doesn't apply.
async function posSyncNow(req, res, next) {
  try {
    const store = await getManagerStore(req)
    if (!store) {
      return error(res, 'No store found for this branch manager', 404)
    }

    const pc = store.posConnection || {}
    if (pc.status !== 'connected') {
      return error(res, 'POS is not connected', 400)
    }
    if (pc.method !== 'api_pull') {
      return error(res, 'Manual sync only applies to API-pull connections', 400)
    }

    const { getPosPullQueue } = require('../jobs/posPull.job')
    await getPosPullQueue().add('pull', { storeId: store._id.toString() })

    logger.info(`[POS Sync-Now] Store ${store._id}: manual pull queued`)
    return success(res, { queued: true }, 200, 'Sync queued')
  } catch (err) {
    next(err)
  }
}

// ── GET /api/pos/dashboard ───────────────────────────────
// Sales + product summary for the branch manager dashboard.
// Sales aggregates come from PosEvent (synced from POS); product
// counts/low-stock come from the Product collection.
async function posDashboard(req, res, next) {
  try {
    const store = await getManagerStore(req)
    if (!store) {
      return error(res, 'No store found for this branch manager', 404)
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart  = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)

    const baseMatch = { branchId: store._id, status: 'success' }

    // Pipeline: { revenue, transactions, currency } over a date range.
    // Each PosEvent.convertedPayload represents one product line on a sale,
    // so revenue = Σ (quantitySold × unitPrice) and transactions = unique transactionIds.
    const totalsPipeline = (sinceField, since) => ([
      { $match: { ...baseMatch, [sinceField]: { $gte: since } } },
      { $group: {
          _id: null,
          revenue:    { $sum: { $multiply: [
            { $ifNull: ['$convertedPayload.quantitySold', 0] },
            { $ifNull: ['$convertedPayload.unitPrice',    0] },
          ] } },
          txnIds:     { $addToSet: '$convertedPayload.transactionId' },
          currencies: { $addToSet: '$convertedPayload.currency' },
      } },
      { $project: {
          _id: 0,
          revenue:      { $round: ['$revenue', 2] },
          transactions: { $size: '$txnIds' },
          currency:     { $arrayElemAt: ['$currencies', 0] },
      } },
    ])

    const [
      todayAgg,
      weekAgg,
      topProductsAgg,
      productCount,
      lowStockProducts,
      recentEvents,
    ] = await Promise.all([
      PosEvent.aggregate(totalsPipeline('convertedPayload.soldAt', todayStart)),
      PosEvent.aggregate(totalsPipeline('convertedPayload.soldAt', weekStart)),
      PosEvent.aggregate([
        { $match: { ...baseMatch, 'convertedPayload.soldAt': { $gte: monthStart } } },
        { $group: {
            _id:       '$convertedPayload.productId',
            name:      { $first: '$convertedPayload.productName' },
            unitsSold: { $sum: { $ifNull: ['$convertedPayload.quantitySold', 0] } },
            revenue:   { $sum: { $multiply: [
              { $ifNull: ['$convertedPayload.quantitySold', 0] },
              { $ifNull: ['$convertedPayload.unitPrice',    0] },
            ] } },
        } },
        { $match: { _id: { $nin: [null, ''] } } },
        { $sort: { unitsSold: -1 } },
        { $limit: 5 },
        { $project: {
            _id: 0,
            productId: '$_id',
            name: 1,
            unitsSold: 1,
            revenue: { $round: ['$revenue', 2] },
        } },
      ]),
      Product.countDocuments({ storeId: store._id, isActive: true }),
      Product.find({
        storeId: store._id,
        isActive: true,
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      })
        .select('name sku stock lowStockThreshold')
        .sort({ stock: 1 })
        .limit(5)
        .lean(),
      PosEvent.find({ branchId: store._id })
        .sort({ receivedAt: -1 })
        .limit(10)
        .lean(),
    ])

    const fallbackCurrency = store.currency || 'USD'
    const todayTotals = todayAgg[0] || { revenue: 0, transactions: 0, currency: fallbackCurrency }
    const weekTotals  = weekAgg[0]  || { revenue: 0, transactions: 0, currency: fallbackCurrency }
    todayTotals.currency = todayTotals.currency || fallbackCurrency
    weekTotals.currency  = weekTotals.currency  || fallbackCurrency

    return success(res, {
      storeId:   store._id,
      storeName: store.name,
      sales: {
        today: todayTotals,
        week:  weekTotals,
      },
      products: {
        total:    productCount,
        lowStock: lowStockProducts,
      },
      topProducts: topProductsAgg,
      recentEvents,
    })
  } catch (err) {
    next(err)
  }
}

// ── Helper: get the store for the authenticated branch manager ──
async function getManagerStore(req) {
  const user = req.user
  const role = req.userRole

  // If superadmin or chain_manager — they might pass storeId in query
  if (role === 'superadmin' || role === 'chain_manager') {
    const storeId = req.query.storeId || req.body?.storeId
    if (storeId) {
      return await Store.findById(storeId)
    }
    // For chain managers, find the first store in their chain
    if (role === 'chain_manager') {
      return await Store.findOne({ chainId: user._id })
    }
    return null
  }

  // Branch manager — find their store
  if (role === 'branch_manager') {
    // Try to find by managerId
    let store = await Store.findOne({ managerId: user._id })
    if (store) {
      return store
    }

    // Fallback: find by chainId
    store = await Store.findOne({ chainId: user.chainId })
    return store
  }

  return null
}

module.exports = {
  posConnect,
  posStatus,
  posTest,
  posDisconnect,
  posWebhookReceiver,
  posEvents,
  posDashboard,
  posSyncNow,
}
