// ============================================================
// KOUTIX — Admin Routes
// ============================================================
const { Router } = require('express')
const { authenticate, requireSuperAdmin, requireChainManager } = require('../middleware')
const { validate } = require('../validators')
const { updateUserRoleSchema, rejectStoreSchema } = require('../validators/admin.validators')
const adminCtrl = require('../controllers/admin')

const router = Router()

router.use(authenticate)

// ── Stats & Analytics ──────────────────────────────────────
router.get('/stats', requireSuperAdmin, adminCtrl.getPlatformStats)
router.get('/analytics/revenue', requireChainManager, adminCtrl.getRevenueSeries)
router.get('/analytics/top-stores', requireChainManager, adminCtrl.getTopStores)

// ── Users ──────────────────────────────────────────────────
router.get('/users', requireSuperAdmin, adminCtrl.getAllUsers)
router.patch(
  '/users/:id/role',
  requireSuperAdmin,
  validate(updateUserRoleSchema),
  adminCtrl.updateUserRole
)
router.patch('/users/:id/deactivate', requireSuperAdmin, adminCtrl.deactivateUser)

// ── Stores ─────────────────────────────────────────────────
router.get('/stores', requireSuperAdmin, adminCtrl.getAllStores)
router.get('/stores/pending', requireSuperAdmin, adminCtrl.getPendingStores)
router.patch('/stores/:id/approve', requireSuperAdmin, adminCtrl.approveStore)
router.patch(
  '/stores/:id/reject',
  requireSuperAdmin,
  validate(rejectStoreSchema),
  adminCtrl.rejectStore
)
router.patch('/stores/:id/suspend', requireSuperAdmin, adminCtrl.suspendStore)

// ── Orders ─────────────────────────────────────────────────
router.get('/orders', requireSuperAdmin, adminCtrl.getAllOrders)

// ── Chains & Entities ──────────────────────────────────────
router.get('/chains', requireSuperAdmin, adminCtrl.getAllChains)
router.get('/entities', requireSuperAdmin, adminCtrl.getAdminEntities)

// ── Audit & Health ──────────────────────────────────────────
router.get('/logs', requireSuperAdmin, adminCtrl.getAuditLogs)
router.get('/health', requireSuperAdmin, adminCtrl.getSystemHealth)

// ── Chain Managers with Branches & Store Managers ─────────
router.get('/chain-managers', requireSuperAdmin, adminCtrl.getChainManagersWithBranches)
router.get('/chain-managers/:id', requireSuperAdmin, adminCtrl.getChainManagerDetail)

module.exports = router
