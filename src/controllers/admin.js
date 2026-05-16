// ============================================================
// KOUTIX — Admin Controller (HTTP Adapter)
// ============================================================
const { Chain, Store, User, Order } = require('../models')
const { success, successList, error, getPaginationParams } = require('../utils')
const adminService = require('../services/admin.service')

// ── Stats & Analytics ──────────────────────────────────────
async function getPlatformStats(req, res, next) {
  try {
    const stats = await adminService.getPlatformStats()
    return success(res, stats)
  } catch (err) {
    next(err)
  }
}

async function getRevenueSeries(req, res, next) {
  try {
    const series = await adminService.getRevenueSeries(req.query)
    return success(res, series)
  } catch (err) {
    next(err)
  }
}

async function getTopStores(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '10')
    const stores = await adminService.getTopStores({ limit })
    return success(res, stores)
  } catch (err) {
    next(err)
  }
}

// ── Users ───────────────────────────────────────────────────
async function getAllUsers(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, status, role } = req.query
    const result = await adminService.listUsers({
      page,
      limit,
      skip,
      sort,
      search,
      status,
      role,
    })
    return successList(res, result.users, { page, limit, total: result.total })
  } catch (err) {
    next(err)
  }
}

async function updateUserRole(req, res, next) {
  try {
    const user = await adminService.updateUserRole(req.params.id, req.body.role)
    return success(res, user)
  } catch (err) {
    if (err.message === 'User not found') {
      return error(res, 'User not found', 404)
    }
    next(err)
  }
}

async function deactivateUser(req, res, next) {
  try {
    const user = await adminService.deactivateUser(req.params.id)
    return success(res, user)
  } catch (err) {
    if (err.message === 'User not found') {
      return error(res, 'User not found', 404)
    }
    next(err)
  }
}

// ── Stores ───────────────────────────────────────────────────
async function getAllStores(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, status, chainId } = req.query
    const result = await adminService.listStores({
      page,
      limit,
      skip,
      sort,
      search,
      status,
      chainId,
    })
    return successList(res, result.stores, { page, limit, total: result.total })
  } catch (err) {
    next(err)
  }
}

async function getPendingStores(req, res, next) {
  try {
    const stores = await Store.find({ status: 'pending_approval' }).sort({ createdAt: 1 })
    return success(res, stores)
  } catch (err) {
    next(err)
  }
}

async function approveStore(req, res, next) {
  try {
    const store = await adminService.approveStore(req.params.id)

    adminService.recordActivity({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'STORE_APPROVED',
      entityType: 'Store',
      entityId: store._id,
      details: { storeName: store.name }
    })

    return success(res, store)
  } catch (err) {
    if (err.message === 'Store not found') {
      return error(res, 'Store not found', 404)
    }
    next(err)
  }
}

async function rejectStore(req, res, next) {
  try {
    const store = await adminService.rejectStore(req.params.id, req.body.reason)

    adminService.recordActivity({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'STORE_REJECTED',
      entityType: 'Store',
      entityId: store._id,
      details: { storeName: store.name, reason: req.body.reason }
    })

    return success(res, store)
  } catch (err) {
    if (err.message === 'Store not found') {
      return error(res, 'Store not found', 404)
    }
    next(err)
  }
}

async function suspendStore(req, res, next) {
  try {
    const store = await adminService.suspendStore(req.params.id)
    return success(res, store)
  } catch (err) {
    if (err.message === 'Store not found') {
      return error(res, 'Store not found', 404)
    }
    next(err)
  }
}

// ── Orders ───────────────────────────────────────────────────
async function getAllOrders(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, status, storeId, from, to } = req.query
    const result = await adminService.listOrders({
      page,
      limit,
      skip,
      sort,
      search,
      status,
      storeId,
      from,
      to,
    })
    return successList(res, result.orders, { page, limit, total: result.total })
  } catch (err) {
    next(err)
  }
}

// ── Chains & Entities ──────────────────────────────────────
async function getAllChains(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const chains = await Chain.find()
      .sort(sort)
      .skip(skip)
      .limit(limit)
    const total = await Chain.countDocuments()

    // Enhance chains with totalRevenue from orders
    const chainIds = chains.map(c => c._id)
    const revenues = await Order.aggregate([
      { $match: { status: { $in: ['paid', 'completed'] }, chainId: { $in: chainIds } } },
      { $group: { _id: '$chainId', totalRevenue: { $sum: '$total' } } },
    ])

    const revenueMap = revenues.reduce((acc, r) => {
      acc[r._id] = r.totalRevenue
      return acc
    }, {})

    const enrichedChains = chains.map(c => ({
      ...c.toObject(),
      totalRevenue: revenueMap[c._id] || 0,
    }))

    return successList(res, enrichedChains, { page, limit, total })
  } catch (err) {
    next(err)
  }
}

async function getAdminEntities(req, res, next) {
  try {
    const [chains, stores, users] = await Promise.all([
      Chain.countDocuments(),
      Store.countDocuments(),
      User.countDocuments(),
    ])
    return success(res, { chains, stores, users })
  } catch (err) {
    next(err)
  }
}


// ── Audit & Health ──────────────────────────────────────────
async function getAuditLogs(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, action } = req.query
    const result = await adminService.listAuditLogs({
      page,
      limit,
      skip,
      sort,
      search,
      action,
    })
    return successList(res, result.logs, { page, limit, total: result.total })
  } catch (err) {
    next(err)
  }
}

async function getSystemHealth(req, res, next) {
  try {
    const health = {
      api: { status: 'online', timestamp: new Date().toISOString() },
      database: { status: 'online' },
      timestamp: new Date().toISOString(),
    }
    return success(res, health)
  } catch (err) {
    next(err)
  }
}

// ── Chain Managers with Details ────────────────────────────
async function getChainManagersWithBranches(req, res, next) {
  try {
    const { page, limit, skip } = getPaginationParams(req.query)
    const { search } = req.query
    const result = await adminService.getChainManagersWithBranches({
      limit,
      skip,
      search,
    })
    return successList(res, result.managers, { page, limit, total: result.total })
  } catch (err) {
    next(err)
  }
}

async function getChainManagerDetail(req, res, next) {
  try {
    const manager = await adminService.getChainManagerDetail(req.params.id)
    return success(res, manager)
  } catch (err) {
    if (err.message === 'Chain manager not found') {
      return error(res, 'Chain manager not found', 404)
    }
    next(err)
  }
}

module.exports = {
  getPlatformStats,
  getRevenueSeries,
  getTopStores,
  getAllUsers,
  updateUserRole,
  deactivateUser,
  getAllStores,
  getPendingStores,
  approveStore,
  rejectStore,
  suspendStore,
  getAllOrders,
  getAllChains,
  getAdminEntities,
  getAuditLogs,
  getSystemHealth,
  getChainManagersWithBranches,
  getChainManagerDetail,
}
