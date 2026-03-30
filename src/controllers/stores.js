// ============================================================
// SelfPay — Stores Controller
// ============================================================
const { Store, Order, User, BranchManager, InviteToken } = require('../models')
const { encrypt } = require('../utils/encryption')
const { success, successList, error, getPaginationParams, getDateRange } = require('../utils')
const { sendPushNotification } = require('../config/firebase')
const { sendInviteEmail } = require('../services/notification/email')
const { cache } = require('../config/redis')
const logger = require('../config/logger')
const crypto = require('crypto')

// ── GET /stores ──────────────────────────────────────────
async function getStores(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, status } = req.query
    const user = req.user

    const filter = {}
    if (user.role === 'chain_manager') {
      filter.chainId = user.chainId
    } else if (user.role === 'branch_manager') {
      filter._id = user.storeId
    }

    if (status) {
      filter.status = status
    }
    if (search) {
      filter.$search = { $search: search }
    }

    const [stores, total] = await Promise.all([
      Store.find(filter).sort(sort).skip(skip).limit(limit).select('-gatewayConfig'),
      Store.countDocuments(filter),
    ])

    return successList(res, stores, { page, limit, total })
  } catch (err) { next(err) }
}

// ── GET /stores/:id ──────────────────────────────────────
async function getStore(req, res, next) {
  try {
    const store = await Store.findById(req.params.id).select('-gatewayConfig')
    if (!store) {
      return error(res, 'Store not found', 404)
    }
    return success(res, store)
  } catch (err) { next(err) }
}

// ── POST /stores ─────────────────────────────────────────
async function createStore(req, res, next) {
  try {
    const user = req.user
    const { name, email, phone, address, city, country, primaryColor, currency, vatRate, posConnector } = req.body

    const store = await Store.create({
      name, email, phone,
      address: { street: address, city, country },
      primaryColor, currency, vatRate, posConnector,
      chainId: user.role === 'chain_manager' ? user.chainId : undefined,
      status:  user.role === 'superadmin' ? 'active' : 'pending_approval',
    })

    logger.info(`Store created: ${name} by ${user.email}`)
    return success(res, store, 201, 'Store created')
  } catch (err) { next(err) }
}

// ── PATCH /stores/:id ────────────────────────────────────
async function updateStore(req, res, next) {
  try {
    const allowed = ['name', 'email', 'phone', 'primaryColor', 'currency', 'vatRate', 'operatingHours', 'posConnector']
    const updates = {}
    allowed.forEach((k) => {
      if (k in req.body) {
        updates[k] = req.body[k]
      }
    })

    const store = await Store.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!store) {
      return error(res, 'Store not found', 404)
    }

    await cache.del(`store:${req.params.id}`)
    return success(res, store)
  } catch (err) { next(err) }
}

// ── PUT /stores/:storeId/payment-gateway ─────────────────
async function updatePaymentGateway(req, res, next) {
  try {
    const { gateway, publicKey, secretKey, webhookSecret } = req.body

    const store = await Store.findByIdAndUpdate(
      req.params.storeId,
      {
        gatewayConfig: {
          provider:               gateway,
          publicKeyEncrypted:     encrypt(publicKey),
          secretKeyEncrypted:     encrypt(secretKey),
          webhookSecretEncrypted: encrypt(webhookSecret),
        },
      },
      { new: true }
    )
    if (!store) {
      return error(res, 'Store not found', 404)
    }

    logger.info(`Payment gateway updated for store ${store._id}: ${gateway}`)
    return success(res, { provider: gateway }, 200, 'Payment gateway configured')
  } catch (err) { next(err) }
}

// ── GET /stores/:storeId/stats ────────────────────────────
async function getStoreStats(req, res, next) {
  try {
    const { storeId } = req.params
    const dateRange = getDateRange(req.query)
    const cacheKey = `store-stats:${storeId}:${JSON.stringify(dateRange)}`

    const cached = await cache.get(cacheKey)
    if (cached) {
      return success(res, cached)
    }

    const filter = { storeId, status: { $in: ['paid', 'completed'] } }
    if (dateRange) {
      filter.createdAt = dateRange
    }

    const [stats] = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRevenue:  { $sum: '$total' },
          totalOrders:   { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
    ])

    const result = {
      revenue:       stats?.totalRevenue   ?? 0,
      orders:        stats?.totalOrders    ?? 0,
      avgOrderValue: stats?.avgOrderValue  ?? 0,
      storeId,
    }

    await cache.set(cacheKey, result, 300)
    return success(res, result)
  } catch (err) { next(err) }
}

// ── POST /stores/:storeId/invite ──────────────────────────
async function inviteManager(req, res, next) {
  try {
    const { storeId } = req.params
    const { email, name, phone, address } = req.body
    const inviter = req.user

    const store = await Store.findById(storeId)
    if (!store) {
      return error(res, 'Store not found', 404)
    }

    // Use current chain manager's chainId
    const chainId = store.chainId || inviter.chainId

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

    // 1. Create/Update InviteToken (SelfPay system)
    await InviteToken.findOneAndUpdate(
      { email, chainId },
      {
        token,
        email,
        chainId,
        branchName: store.name,
        expiresAt,
        used:       false,
      },
      { upsert: true, new: true }
    )

    // 2. Create/Update BranchManager (SelfPay system)
    await BranchManager.findOneAndUpdate(
      { email, chainId },
      {
        email,
        chainId,
        name,
        phone,
        branchName:    store.name,
        branchAddress: address,
        isActive:      false,
      },
      { upsert: true, new: true }
    )

    // 3. Keep User record (migration support)
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
    
    await User.findOneAndUpdate(
      { email },
      {
        email,
        name,
        phone,
        address,
        role:          'branchManager',
        storeId,
        chainId,
        isActive:      false,
        inviteToken:   hashedToken,
        inviteExpires: expiresAt,
      },
      { upsert: true, new: true }
    )

    // 4. Send Invite Email (using the same token for both systems)
    await sendInviteEmail({
      to:          email,
      managerName: name,
      storeName:   store.name,
      role:        'Branch Manager',
      inviteToken: token,
      inviterName: inviter.name,
    })

    logger.info(`Branch Manager invite sent to ${email} for store ${store.name}`)
    return success(res, null, 200, 'Invitation sent successfully with full details')
  } catch (err) { next(err) }
}

// ── GET /stores/:storeId/pos/status ──────────────────────
async function getPosStatus(req, res, next) {
  try {
    const store = await Store.findById(req.params.storeId).select('posConnector lastPosSyncAt posCredentialsEncrypted')
    if (!store) {
      return error(res, 'Store not found', 404)
    }

    return success(res, {
      connected:  store.posConnector !== 'none' && !!store.posCredentialsEncrypted,
      connector:  store.posConnector,
      lastSync:   store.lastPosSyncAt,
    })
  } catch (err) { next(err) }
}

// ── POST /stores/:storeId/pos/sync ────────────────────────
async function triggerPosSync(req, res, next) {
  try {
    const { storeId } = req.params
    const { addPosSyncJob } = require('../jobs/queues')
    const job = await addPosSyncJob(storeId)
    return success(res, { jobId: job.id }, 200, 'Sync job started')
  } catch (err) { next(err) }
}

// ── Approve / Reject / Suspend (superAdmin) ───────────────
async function approveStore(req, res, next) {
  try {
    const store = await Store.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true })
    if (!store) {
      return error(res, 'Store not found', 404)
    }

    if (store.managerId) {
      const manager = await User.findById(store.managerId)
      if (manager?.fcmToken) {
        await sendPushNotification({
          token: manager.fcmToken,
          title: '🎉 Store Approved!',
          body:  `${store.name} is now live on KOUTIX`,
        })
      }
    }

    return success(res, store, 200, 'Store approved')
  } catch (err) { next(err) }
}

async function rejectStore(req, res, next) {
  try {
    const { reason } = req.body
    const store = await Store.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true })
    if (!store) {
      return error(res, 'Store not found', 404)
    }
    return success(res, store, 200, `Store rejected: ${reason}`)
  } catch (err) { next(err) }
}

async function suspendStore(req, res, next) {
  try {
    const store = await Store.findByIdAndUpdate(req.params.id, { status: 'suspended' }, { new: true })
    if (!store) {
      return error(res, 'Store not found', 404)
    }
    return success(res, store, 200, 'Store suspended')
  } catch (err) { next(err) }
}

module.exports = {
  getStores, getStore, createStore, updateStore,
  updatePaymentGateway, getStoreStats, inviteManager,
  getPosStatus, triggerPosSync,
  approveStore, rejectStore, suspendStore,
}
