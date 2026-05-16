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

// ── GET /stores/my-branches ──────────────────────────────
async function getChainBranches(req, res, next) {
  try {
    const chainId = req.user._id

    // 1. Get invited managers
    const invited = await BranchManager.find({ chainId }).sort({ isActive: -1, createdAt: -1 }).lean()

    // 2. Get actual store records (no POS or payment config for chain manager)
    const stores = await Store.find({ chainId }).select('-gatewayConfig -posConnector -posCredentialsEncrypted -lastPosSyncAt -posConnection').lean()

    // 3. Merge or return combined list
    // We'll return everything the chain manager needs
    return success(res, { invited, stores })
  } catch (err) { next(err) }
}

// ── GET /stores/branch-sales ─────────────────────────────
async function getBranchSales(req, res, next) {
  try {
    const chainId = req.user._id

    // 1. Get all stores for this chain
    const stores = await Store.find({ chainId }).select('name address totalRevenue totalOrders status managerId').lean()

    // 2. Get all invited managers for this chain to show gaps
    const invited = await BranchManager.find({ chainId }).lean()

    // Today's starts for aggregation
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const branchStats = await Promise.all(stores.map(async (s) => {
      const todayStats = await Order.aggregate([
        { $match: { storeId: s._id, status: { $in: ['paid', 'completed'] }, createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ])

      const lastOrder = await Order.findOne({ storeId: s._id }).sort({ createdAt: -1 })

      // Find the manager details from BranchManager if active
      const mgr = invited.find(i => i.email === s.email) || {}

      return {
        _id: s._id,
        name: s.name,
        address: s.address,
        status: s.status,
        totalRevenue: s.totalRevenue || 0,
        totalOrders: s.totalOrders || 0,
        todayRevenue: todayStats[0]?.total || 0,
        todayOrders: todayStats[0]?.count || 0,
        lastOrderAt: lastOrder?.createdAt || null,
        managerName: mgr.name || 'Branch Manager',
        managerEmail: s.email
      }
    }))

    // 3. Add invited-only branches that don't have stores yet
    invited.forEach(i => {
      const hasStore = stores.some(s => s.email === i.email)
      if (!hasStore) {
        branchStats.push({
          name: i.branchName,
          address: i.branchAddress,
          status: i.isActive ? 'active' : 'invited',
          totalRevenue: 0,
          totalOrders: 0,
          todayRevenue: 0,
          todayOrders: 0,
          managerName: i.name,
          managerEmail: i.email,
          isPending: true
        })
      }
    })

    return success(res, branchStats)
  } catch (err) { next(err) }
}

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

// ── GET /stores/customer ─────────────────────────────────
// Returns every currently active store, sorted alphabetically. No radius
// filter — the customer app shows them all and computes distances client-side.
async function getCustomerStores(req, res, next) {
  try {
    const stores = await Store.find({ status: 'active' })
      .sort({ name: 1 })
      .lean()

    const formattedStores = stores.map(s => ({
      id: s._id.toString(),
      name: s.name,
      logoUrl: s.logo || '',
      coverUrl: s.coverImage || '',
      address: s.address
        ? [s.address.street, s.address.city].filter(Boolean).join(', ')
        : '',
      hours: s.operatingHours ? `${s.operatingHours.open} - ${s.operatingHours.close}` : 'Closed',
      lat: s.address?.coordinates?.lat || 0,
      lng: s.address?.coordinates?.lng || 0,
      isOpen: true,
      isPromoted: s.isPromoted || false,
      primaryColor: s.primaryColor || '#00E5A0',
      publicPaymentKey: s.gatewayConfig?.publicKeyEncrypted || '',
    }))

    return success(res, formattedStores)
  } catch (err) { next(err) }
}

// ── GET /stores/nearby ───────────────────────────────────
// Returns active stores filtered by radius and distance, with distance calculated
async function getNearbyStores(req, res, next) {
  try {
    const { lat, lng, radius = 20 } = req.query
    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)

    // Base query for active stores
    const baseFilter = { status: 'active' }

    let nearbyDocs = []
    if (!isNaN(latitude) && !isNaN(longitude)) {
      // Using MongoDB $nearSphere if geospatial index is present, or just finding all and calculating
      // Assuming store schema has 'location' for 2dsphere index:
      nearbyDocs = await Store.find({
        ...baseFilter,
        location: {
          $nearSphere: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radius * 1000 // Convert km to meters
          }
        }
      }).lean()
    } else {
      nearbyDocs = await Store.find(baseFilter).lean()
    }

    // Helper to calculate distance in JS if needed, but we'll approximate or leave to client if 0.0
    // Actually, $nearSphere doesn't return distance in the document unless we use aggregate $geoNear.
    // For simplicity, we calculate straight-line distance here for response formatting.
    const deg2rad = deg => deg * (Math.PI / 180)
    const getDist = (lat1, lon1, lat2, lon2) => {
      const R = 6371 // Radius of the earth in km
      const dLat = deg2rad(lat2 - lat1)
      const dLon = deg2rad(lon2 - lon1)
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      return R * c // Distance in km
    }

    const formattedStores = nearbyDocs.map(s => {
      const sLat = s.address?.coordinates?.lat || 0
      const sLng = s.address?.coordinates?.lng || 0
      const distance = (!isNaN(latitude) && !isNaN(longitude)) ? getDist(latitude, longitude, sLat, sLng) : 0

      return {
        id: s._id.toString(),
        name: s.name,
        logoUrl: s.logo || '',
        coverUrl: s.coverImage || '',
        address: s.address ? [s.address.street, s.address.city].filter(Boolean).join(', ') : '',
        hours: s.operatingHours ? `${s.operatingHours.open} - ${s.operatingHours.close}` : 'Closed',
        lat: sLat,
        lng: sLng,
        distanceKm: distance,
        isOpen: true,
        isPromoted: s.isPromoted || false,
        primaryColor: s.primaryColor || '#00E5A0',
        publicPaymentKey: s.gatewayConfig?.publicKeyEncrypted || '',
      }
    })

    return success(res, formattedStores)
  } catch (err) { next(err) }
}

// ── GET /stores/:id ──────────────────────────────────────
async function getStore(req, res, next) {
  try {
    const store = await Store.findById(req.params.id)
    if (!store) {
      return error(res, 'Store not found', 404)
    }

    // Strip secrets but expose provider name + whether gateway is configured
    const storeObj = store.toObject()
    storeObj.paymentProvider = store.gatewayConfig?.provider || null
    storeObj.paymentConfigured = !!(
      store.gatewayConfig?.provider &&
      store.gatewayConfig?.secretKeyEncrypted
    )
    delete storeObj.gatewayConfig

    return success(res, storeObj)
  } catch (err) { next(err) }
}

// ── POST /stores ─────────────────────────────────────────
async function createStore(req, res, next) {
  try {
    const user = req.user
    const { name, email, phone, address, city, country, primaryColor, currency, vatRate, posConnector } = req.body

    const store = await Store.create({
      name, email, phone,
      address: { street: address, city: city || 'City', country: country || 'Country' },
      primaryColor, currency, vatRate, posConnector,
      chainId: req.userRole === 'chain_manager' ? req.user._id : undefined,
      status:  req.userRole === 'superadmin' ? 'active' : 'pending_approval',
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
        storeId,
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
  getChainBranches, getBranchSales, getCustomerStores, getNearbyStores
}
