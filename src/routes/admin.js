// ============================================================
// KOUTIX — Admin Routes
// ============================================================
const { Router } = require('express')
const { authenticate, requireSuperAdmin, requireChainManager } = require('../middleware')
const adminCtrl = require('../controllers/admin')

const router = Router()
router.use(authenticate)

router.get('/stats',                  requireSuperAdmin,   adminCtrl.getPlatformStats)
router.get('/analytics/revenue',      requireChainManager, adminCtrl.getRevenueSeries)
router.get('/analytics/top-stores',   requireChainManager, adminCtrl.getTopStores)

router.get('/users',                  requireSuperAdmin,   adminCtrl.getAllUsers)
router.patch('/users/:id/role',       requireSuperAdmin,   adminCtrl.updateUserRole)
router.patch('/users/:id/deactivate', requireSuperAdmin,   adminCtrl.deactivateUser)

router.get('/chains',                 requireSuperAdmin,   adminCtrl.getAllChains)
router.get('/stores/pending',         requireSuperAdmin,   adminCtrl.getPendingStores)

module.exports = router
