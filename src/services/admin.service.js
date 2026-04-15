// ============================================================
// KOUTIX — Admin Service Layer
// ============================================================
const { User, Chain, Store, Order, Customer } = require('../models')
const { getPaginationParams, getDateRange } = require('../utils')
const { cache } = require('../config/redis')
const { setUserClaims, revokeUserTokens } = require('../config/firebase')
const logger = require('../config/logger')

/**
 * Get platform-wide statistics with caching
 * Returns fields matched to what frontend expects
 */
async function getPlatformStats() {
  try {
    const cacheKey = 'platform:stats'
    const cached = await cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
      revenueData,
      prevRevenueData,
      totalOrders,
      prevOrders,
      activeStores,
      newStores,
      totalUsers,
      todayRevenue,
      totalChains,
    ] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            status: { $in: ['paid', 'completed'] },
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        {
          $match: {
            status: { $in: ['paid', 'completed'] },
            createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
      Store.countDocuments({ status: 'active' }),
      Store.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Customer.countDocuments(),
      Order.aggregate([
        {
          $match: {
            status: { $in: ['paid', 'completed'] },
            createdAt: { $gte: todayStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Chain.countDocuments(),
    ])

    const currRevenue = revenueData[0]?.total ?? 0
    const prevRevenue = prevRevenueData[0]?.total ?? 0
    const today24hVolume = todayRevenue[0]?.total ?? 0

    const pct = (curr, prev) =>
      prev === 0 ? 100 : parseFloat(((curr - prev) / prev * 100).toFixed(1))

    const stats = {
      // ── Frontend-expected fields (MUST match exactly) ──────
      activeStores,
      users: totalUsers,
      apiHealth: 99.9, // Static placeholder (no real monitoring yet)
      volume: parseFloat(today24hVolume.toFixed(2)),

      // ── Extended growth metrics ────────────────────────────
      totalRevenue: parseFloat(currRevenue.toFixed(2)),
      revenueGrowth: pct(currRevenue, prevRevenue),
      totalOrders,
      ordersGrowth: pct(totalOrders, prevOrders),
      newStores,
      totalChains,
      avgOrderValue: totalOrders > 0 ? parseFloat((currRevenue / totalOrders).toFixed(2)) : 0,
    }

    await cache.set(cacheKey, stats, 120)
    return stats
  } catch (err) {
    logger.error('getPlatformStats error:', err)
    throw err
  }
}

/**
 * Get revenue trend data (day/week/month aggregation)
 */
async function getRevenueSeries({ from, to, interval = 'day' }) {
  try {
    const groupBy = {
      day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      week: { $dateToString: { format: '%Y-W%U', date: '$createdAt' } },
      month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
    }

    const series = await Order.aggregate([
      {
        $match: {
          status: { $in: ['paid', 'completed'] },
          createdAt: {
            $gte: from ? new Date(from) : new Date(Date.now() - 30 * 86400000),
            $lte: to ? new Date(to) : new Date(),
          },
        },
      },
      {
        $group: {
          _id: groupBy[interval] ?? groupBy.day,
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', revenue: 1, orders: 1, _id: 0 } },
    ])

    return series
  } catch (err) {
    logger.error('getRevenueSeries error:', err)
    throw err
  }
}

/**
 * Get top performing stores by revenue
 */
async function getTopStores({ limit = 10 }) {
  try {
    const cacheKey = `top-stores:${limit}`
    const cached = await cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const topStores = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'completed'] } } },
      {
        $group: {
          _id: '$storeId',
          storeName: { $first: '$storeName' },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      {
        $project: {
          storeId: '$_id',
          storeName: 1,
          revenue: 1,
          orders: 1,
          avgOrderValue: 1,
          _id: 0,
        },
      },
    ])

    await cache.set(cacheKey, topStores, 300)
    return topStores
  } catch (err) {
    logger.error('getTopStores error:', err)
    throw err
  }
}

/**
 * List all users with pagination, search, and filtering
 */
async function listUsers({ page, limit, skip, sort, search, status, role }) {
  try {
    const filter = {}

    if (role) {
      filter.role = role
    }
    if (status === 'active') {
      filter.isActive = true
    }
    if (status === 'inactive') {
      filter.isActive = false
    }
    if (search) {
      filter.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }]
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).select('-inviteToken'),
      User.countDocuments(filter),
    ])

    return { users, total, page, limit }
  } catch (err) {
    logger.error('listUsers error:', err)
    throw err
  }
}

/**
 * List all stores with pagination, filtering, and search
 * Strips sensitive fields (gatewayConfig, credentials)
 */
async function listStores({ page, limit, skip, sort, search, status, chainId }) {
  try {
    const filter = {}

    if (chainId) {
      filter.chainId = chainId
    }
    if (status) {
      filter.status = status
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }

    const [stores, total] = await Promise.all([
      Store.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('-gatewayConfig -posCredentialsEncrypted'),
      Store.countDocuments(filter),
    ])

    return { stores, total, page, limit }
  } catch (err) {
    logger.error('listStores error:', err)
    throw err
  }
}

/**
 * List all orders with pagination, filtering, and date range
 */
async function listOrders({ page, limit, skip, sort, search, status, storeId, from, to }) {
  try {
    const filter = {}

    if (storeId) {
      filter.storeId = storeId
    }
    if (status) {
      filter.status = status
    }
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { customerPhone: { $regex: search, $options: 'i' } },
        { orderNumber: { $regex: search, $options: 'i' } },
      ]
    }

    // Handle date range
    if (from || to) {
      filter.createdAt = {}
      if (from) {
        filter.createdAt.$gte = new Date(from)
      }
      if (to) {
        // Include entire end date
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        filter.createdAt.$lte = endDate
      }
    }

    const [orders, total] = await Promise.all([
      Order.find(filter).sort(sort).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ])

    return { orders, total, page, limit }
  } catch (err) {
    logger.error('listOrders error:', err)
    throw err
  }
}

/**
 * Update user role and sync with Firebase
 */
async function updateUserRole(userId, role) {
  try {
    const user = await User.findByIdAndUpdate(userId, { role }, { new: true })
    if (!user) {
      throw new Error('User not found')
    }

    // Sync role to Firebase custom claims
    if (user.firebaseUid) {
      await setUserClaims(user.firebaseUid, { role })
    }

    logger.info(`Role updated: ${user.email} → ${role}`)
    return user
  } catch (err) {
    logger.error('updateUserRole error:', err)
    throw err
  }
}

/**
 * Deactivate a user and revoke their tokens
 */
async function deactivateUser(userId) {
  try {
    const user = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true })
    if (!user) {
      throw new Error('User not found')
    }

    // Revoke Firebase tokens if available
    if (user.firebaseUid) {
      await revokeUserTokens(user.firebaseUid)
    }

    logger.info(`User deactivated: ${user.email}`)
    return user
  } catch (err) {
    logger.error('deactivateUser error:', err)
    throw err
  }
}

/**
 * Approve a store and invalidate cache
 */
async function approveStore(storeId) {
  try {
    const store = await Store.findByIdAndUpdate(storeId, { status: 'active' }, { new: true })
    if (!store) {
      throw new Error('Store not found')
    }

    // Invalidate stats cache
    await cache.del('platform:stats')

    logger.info(`Store approved: ${store.name}`)
    return store
  } catch (err) {
    logger.error('approveStore error:', err)
    throw err
  }
}

/**
 * Reject a store and invalidate cache
 */
async function rejectStore(storeId, reason) {
  try {
    const store = await Store.findByIdAndUpdate(
      storeId,
      { status: 'inactive' },
      { new: true }
    )
    if (!store) {
      throw new Error('Store not found')
    }

    // Invalidate stats cache
    await cache.del('platform:stats')

    logger.info(`Store rejected: ${store.name} — Reason: ${reason}`)
    return store
  } catch (err) {
    logger.error('rejectStore error:', err)
    throw err
  }
}

/**
 * Suspend a store and invalidate cache
 */
async function suspendStore(storeId) {
  try {
    const store = await Store.findByIdAndUpdate(storeId, { status: 'suspended' }, { new: true })
    if (!store) {
      throw new Error('Store not found')
    }

    // Invalidate stats cache
    await cache.del('platform:stats')

    logger.info(`Store suspended: ${store.name}`)
    return store
  } catch (err) {
    logger.error('suspendStore error:', err)
    throw err
  }
}

module.exports = {
  getPlatformStats,
  getRevenueSeries,
  getTopStores,
  listUsers,
  listStores,
  listOrders,
  updateUserRole,
  deactivateUser,
  approveStore,
  rejectStore,
  suspendStore,
}
