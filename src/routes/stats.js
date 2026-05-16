// ============================================================
// KOUTIX — Stats Routes (Store Manager Dashboard)
// ============================================================
const { Router } = require('express')
const { authenticate, requireAnyStaff } = require('../middleware')
const { Order, Store } = require('../models')
const { success } = require('../utils')

const router = Router()
router.use(authenticate)

// GET /stats/branch — dashboard stats for the current user's store
router.get('/branch', requireAnyStaff, async (req, res, next) => {
  try {
    const user = req.user
    const role = req.userRole

    // Determine which store(s) to query
    let storeFilter = {}
    if (role === 'store_manager') {
      const store = await Store.findOne({
        $or: [
          { managerId: user._id },
          { chainId: user._id },
        ],
      })
      if (store) {
        storeFilter = { storeId: store._id }
      }
    } else if (role === 'branch_manager') {
      if (user.storeId) {
        storeFilter = { storeId: user.storeId }
      }
    } else if (role === 'chain_manager') {
      const stores = await Store.find({ chainId: user._id }).select('_id')
      const ids = stores.map((s) => s._id)
      if (ids.length) {
        storeFilter = { storeId: { $in: ids } }
      }
    }

    // Today's date range
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const filter = {
      ...storeFilter,
      status: { $in: ['paid', 'completed', 'preparing', 'ready'] },
      createdAt: { $gte: todayStart },
    }

    const [stats] = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
    ])

    const activeOrders = await Order.countDocuments({
      ...storeFilter,
      status: { $in: ['pending', 'preparing', 'ready'] },
    })

    const outForDelivery = await Order.countDocuments({
      ...storeFilter,
      status: 'out_for_delivery',
    })

    return success(res, {
      totalSales: stats?.totalSales ?? 0,
      totalOrders: stats?.totalOrders ?? 0,
      avgOrderValue: stats?.avgOrderValue ?? 0,
      activeOrders,
      outForDelivery,
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
