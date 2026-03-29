// ============================================================
// KOUTIX — Users Routes
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireAnyStaff,
  requireSuperAdmin,
  canAccessChain,
  canAccessStore,
} = require('../middleware')
const { validate, inviteUserSchema } = require('../validators')
const userCtrl = require('../controllers/users')

const router = Router()
router.use(authenticate)

router.post('/invite',             requireAnyStaff, validate(inviteUserSchema), userCtrl.inviteUser)
router.post('/:id/resend-invite',  requireAnyStaff, userCtrl.resendInvite)
router.patch('/:id/deactivate',    requireSuperAdmin, userCtrl.deactivateUser)
router.patch('/:id/activate',      requireSuperAdmin, userCtrl.activateUser)
router.patch('/fcm-token',         userCtrl.updateFcmToken)

module.exports = router
