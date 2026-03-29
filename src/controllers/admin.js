// ============================================================
// KOUTIX — Admin Controller
// ============================================================
const { User, Chain, Store, Order } = require('../models')
const { success, successList, error, getPaginationParams } = require('../utils')
const { setUserClaims, revokeUserTokens } = require('../config/firebase')
const { cache } = require('../config/redis')
const logger = require('../config/logger')

async function getPlatformStats(req, res, next) {
  try {
    const cacheKey = 'platform:stats'
    const cached = await cache.get(cacheKey)
    if (cached) return success(res, cached)

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

    const [
      revenueData, prevRevenueData,
      totalOrders, prevOrders,
      activeStores, newStores,
      totalUsers,
    ] = await Promise.all([
      Order.aggregate([
        { $match: { status: { $in: ['paid','completed'] }, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { status: { $in: ['paid','completed'] }, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.countDocuments({ createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
      Store.countDocuments({ status: 'active' }),
      Store.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      User.countDocuments({ role: 'customer' }),
    ])

    const currRevenue = revenueData[0]?.total ?? 0
    const prevRevenue = prevRevenueData[0]?.total ?? 0

    const pct = (curr, prev) => prev === 0 ? 100 : parseFloat(((curr - prev) / prev * 100).toFixed(1))

    const stats = {
      totalRevenue:  parseFloat(currRevenue.toFixed(2)),
      revenueGrowth: pct(currRevenue, prevRevenue),
      totalOrders,
      ordersGrowth:  pct(totalOrders, prevOrders),
      activeStores,
      newStores,
      totalUsers,
      usersGrowth:   0,
      avgOrderValue: totalOrders > 0 ? parseFloat((currRevenue / totalOrders).toFixed(2)) : 0,
      avgOrderGrowth: 0,
    }

    await cache.set(cacheKey, stats, 120)
    return success(res, stats)
  } catch (err) { next(err) }
}

async function getRevenueSeries(req, res, next) {
  try {
    const { from, to, interval = 'day' } = req.query

    const groupBy = {
      day:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      week:  { $dateToString: { format: '%Y-W%U', date: '$createdAt' } },
      month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
    }

    const series = await Order.aggregate([
      {
        $match: {
          status: { $in: ['paid', 'completed'] },
          createdAt: {
            $gte: from ? new Date(from) : new Date(Date.now() - 30 * 86400000),
            $lte: to   ? new Date(to)   : new Date(),
          },
        },
      },
      {
        $group: {
          _id:     groupBy[interval] ?? groupBy.day,
          revenue: { $sum: '$total' },
          orders:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', revenue: 1, orders: 1, _id: 0 } },
    ])

    return success(res, series)
  } catch (err) { next(err) }
}

async function getTopStores(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '10')
    const cacheKey = `top-stores:${limit}`
    const cached = await cache.get(cacheKey)
    if (cached) return success(res, cached)

    const topStores = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'completed'] } } },
      {
        $group: {
          _id:      '$storeId',
          storeName: { $first: '$storeName' },
          revenue:   { $sum: '$total' },
          orders:    { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      { $project: { storeId: '$_id', storeName: 1, revenue: 1, orders: 1, avgOrderValue: 1, _id: 0 } },
    ])

    await cache.set(cacheKey, topStores, 300)
    return success(res, topStores)
  } catch (err) { next(err) }
}

async function getAllUsers(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, status, role } = req.query
    const filter = {}

    if (role)   filter.role = role
    if (status === 'active')   filter.isActive = true
    if (status === 'inactive') filter.isActive = false
    if (search) filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ]

    const [users, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit).select('-inviteToken'),
      User.countDocuments(filter),
    ])
    return successList(res, users, { page, limit, total })
  } catch (err) { next(err) }
}

async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true })
    if (!user) return error(res, 'User not found', 404)
    await setUserClaims(user.uid, { role })
    logger.info(`Role updated: ${user.email} → ${role}`)
    return success(res, user)
  } catch (err) { next(err) }
}

async function deactivateUser(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!user) return error(res, 'User not found', 404)
    await revokeUserTokens(user.uid)
    logger.info(`User deactivated: ${user.email}`)
    return success(res, user)
  } catch (err) { next(err) }
}

async function getAllChains(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const [chains, total] = await Promise.all([
      Chain.find().sort(sort).skip(skip).limit(limit).populate('branchCount'),
      Chain.countDocuments(),
    ])
    return successList(res, chains, { page, limit, total })
  } catch (err) { next(err) }
}

async function getPendingStores(req, res, next) {
  try {
    const stores = await Store.find({ status: 'pending_approval' }).sort({ createdAt: 1 })
    return success(res, stores)
  } catch (err) { next(err) }
}

module.exports = {
  getPlatformStats, getRevenueSeries, getTopStores,
  getAllUsers, updateUserRole, deactivateUser,
  getAllChains, getPendingStores,
}
