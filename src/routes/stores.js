// ============================================================
// KOUTIX — Stores Routes
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireSuperAdmin,
  requireChainManager,
  requireBranchManager,
  requireBranchManagerOnly,
  requireAnyStaff,
  canAccessStore,
} = require('../middleware')
const { validate, createStoreSchema, paymentGatewaySchema, inviteUserSchema } = require('../validators')
const storeCtrl = require('../controllers/stores')

const router = Router()
router.use(authenticate)

// GET /stores/my-branches — chain manager's activated & invited branches
router.get('/my-branches', requireChainManager, storeCtrl.getChainBranches)

// GET /stores/branch-sales — detailed sales Breakdown for chain managers
router.get('/branch-sales', requireChainManager, storeCtrl.getBranchSales)

router.get('/',     storeCtrl.getStores)
router.post('/',    requireChainManager, validate(createStoreSchema), storeCtrl.createStore)
router.get('/:id',  canAccessStore, storeCtrl.getStore)
router.patch('/:id', canAccessStore, requireAnyStaff, storeCtrl.updateStore)

router.put('/:storeId/payment-gateway',
  canAccessStore, requireBranchManager,
  validate(paymentGatewaySchema),
  storeCtrl.updatePaymentGateway
)
router.get('/:storeId/stats',       canAccessStore, storeCtrl.getStoreStats)
router.post('/:storeId/invite',     canAccessStore, requireChainManager, validate(inviteUserSchema), storeCtrl.inviteManager)
router.get('/:storeId/pos/status',  canAccessStore, requireBranchManagerOnly, storeCtrl.getPosStatus)
router.post('/:storeId/pos/sync',   canAccessStore, requireBranchManagerOnly, storeCtrl.triggerPosSync)

// superAdmin only
router.patch('/:id/approve',  requireSuperAdmin, storeCtrl.approveStore)
router.patch('/:id/reject',   requireSuperAdmin, storeCtrl.rejectStore)
router.patch('/:id/suspend',  requireSuperAdmin, storeCtrl.suspendStore)

module.exports = router
