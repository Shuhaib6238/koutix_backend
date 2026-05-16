// ============================================================
// KOUTIX — Payments Routes  (/api/v1/payments/*)
// ============================================================
const { Router } = require('express')
const { authenticate } = require('../middleware')
const paymentCtrl = require('../controllers/payments')

const router = Router()
router.use(authenticate)

router.post('/verify', paymentCtrl.verifyPayment)

module.exports = router
