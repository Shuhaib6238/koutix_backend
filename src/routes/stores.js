// ============================================================
// KOUTIX — Stores Routes
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireSuperAdmin,
  requireChainManager,
  requireBranchManager,
  requireAnyStaff,
  canAccessStore,
} = require('../middleware')
const { validate, createStoreSchema, paymentGatewaySchema, inviteUserSchema } = require('../validators')
const storeCtrl = require('../controllers/stores')
const { BranchManager } = require('../models')
const { success } = require('../utils')

const router = Router()
router.use(authenticate)

// GET /stores/my-branches — chain manager's activated & invited branches
router.get('/my-branches', requireChainManager, async (req, res, next) => {
  try {
    const branches = await BranchManager.find({ chainId: req.user._id })
      .sort({ isActive: -1, createdAt: -1 })
      .lean()

    return success(res, branches)
  } catch (err) { next(err) }
})

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
router.get('/:storeId/pos/status',  canAccessStore, storeCtrl.getPosStatus)
router.post('/:storeId/pos/sync',   canAccessStore, requireBranchManager, storeCtrl.triggerPosSync)

// superAdmin only
router.patch('/:id/approve',  requireSuperAdmin, storeCtrl.approveStore)
router.patch('/:id/reject',   requireSuperAdmin, storeCtrl.rejectStore)
router.patch('/:id/suspend',  requireSuperAdmin, storeCtrl.suspendStore)

module.exports = router
