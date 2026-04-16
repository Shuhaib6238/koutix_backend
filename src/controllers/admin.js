// ============================================================
// KOUTIX — Admin Controller (HTTP Adapter)
// ============================================================
const { Chain, Store } = require('../models')
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
    const [chains, total] = await Promise.all([
      Chain.find().sort(sort).skip(skip).limit(limit).populate('branchCount'),
      Chain.countDocuments(),
    ])
    return successList(res, chains, { page, limit, total })
  } catch (err) {
    next(err)
  }
}

async function getAdminEntities(req, res, next) {
  try {
    const [chains, stores, users] = await Promise.all([
      Chain.countDocuments(),
      Store.countDocuments(),
      require('../models').User.countDocuments(),
    ])
    return success(res, { chains, stores, users })
  } catch (err) {
    next(err)
  }
}

// ── DEVELOPMENT: Seed Test Data ──────────────────────────
async function seedTestData(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return error(res, 'Seeding not allowed in production', 403)
  }

  try {
    const testStores = [
      {
        name: 'Lumina Lifestyle — SoHo',
        email: 'store1@lumina.local',
        status: 'active',
        address: { street: '451 Spring St', city: 'New York', country: 'USA', postalCode: '10013' },
        phone: '+1-212-555-0123',
        currency: 'USD',
        vatRate: 8.875,
        totalOrders: 342,
        totalRevenue: 125400,
      },
      {
        name: 'Urban Market — Brooklyn',
        email: 'store2@urbanmarket.local',
        status: 'pending_approval',
        address: { street: '200 Atlantic Ave', city: 'Brooklyn', country: 'USA', postalCode: '11201' },
        phone: '+1-718-555-0456',
        currency: 'USD',
        vatRate: 8.875,
        totalOrders: 0,
        totalRevenue: 0,
      },
      {
        name: 'Premium Goods — Miami',
        email: 'store3@premium.local',
        status: 'active',
        address: { street: '123 Biscayne Blvd', city: 'Miami', country: 'USA', postalCode: '33132' },
        phone: '+1-305-555-0789',
        currency: 'USD',
        vatRate: 7.0,
        totalOrders: 156,
        totalRevenue: 87650,
      },
    ]

    // Remove existing test stores
    await Store.deleteMany({ email: { $in: testStores.map(s => s.email) } })

    // Create new test stores
    const created = await Store.insertMany(testStores)

    return success(res, {
      message: `✅ Seeded ${created.length} test stores`,
      stores: created,
    })
  } catch (err) {
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
  seedTestData,
}
