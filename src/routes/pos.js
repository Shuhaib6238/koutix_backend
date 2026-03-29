// ============================================================
// KOUTIX — POS Routes
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireBranchManager,
  canAccessStore,
} = require('../middleware')
const { validate, connectPosSchema } = require('../validators')
const posCtrl = require('../controllers/pos')

const router = Router()
router.use(authenticate)

router.get('/connectors', posCtrl.getConnectors)

router.post('/stores/:storeId/connect',
  canAccessStore, requireBranchManager,
  validate(connectPosSchema),
  posCtrl.connectPos
)
router.delete('/stores/:storeId/disconnect',
  canAccessStore, requireBranchManager,
  posCtrl.disconnectPos
)
router.get('/stores/:storeId/sync-history', canAccessStore, posCtrl.getSyncHistory)
router.get('/stores/:storeId/jobs/:jobId',  canAccessStore, posCtrl.getJobStatus)

module.exports = router
