// ============================================================
// KOUTIX — POS Connection Controller
// ============================================================
const crypto = require('crypto')
const { Store } = require('../models')
const PosEvent = require('../models/PosEvent')
const { encryptObject } = require('../utils/encryption')
const { success, error } = require('../utils')
const { testConnection } = require('../services/pos/posSync.service')
const { receiveWebhook } = require('../services/pos/posSync.service')
const { schedulePosPullJob, removePosPullJob } = require('../jobs/posPull.job')
const logger = require('../config/logger')

const VALID_POS_TYPES = ['ls_retail', 'sap', 'custom']

// ── POST /api/pos/connect ────────────────────────────────
async function posConnect(req, res, next) {
  try {
    const { posType, method, credentials, pullIntervalSeconds } = req.body

    // Validate posType
    if (!posType || !VALID_POS_TYPES.includes(posType)) {
      return error(res, `Invalid posType. Must be one of: ${VALID_POS_TYPES.join(', ')}`, 400)
    }

    // Validate method
    if (!method || !['api_pull', 'webhook'].includes(method)) {
      return error(res, 'Invalid method. Must be "api_pull" or "webhook"', 400)
    }

    if (!credentials || typeof credentials !== 'object') {
      return error(res, 'Credentials are required', 400)
    }

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
async function posTest(req, res, next) {
  try {
    const { posType, method, credentials } = req.body

    if (!posType || !VALID_POS_TYPES.includes(posType)) {
      return error(res, `Invalid posType. Must be one of: ${VALID_POS_TYPES.join(', ')}`, 400)
    }

    if (!method || !['api_pull', 'webhook'].includes(method)) {
      return error(res, 'Invalid method. Must be "api_pull" or "webhook"', 400)
    }

    const result = await testConnection({ posType, method, credentials: credentials || {} })
    return success(res, result, result.success ? 200 : 400)
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
}
