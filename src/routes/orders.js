// ============================================================
// KOUTIX — Orders Routes
// ============================================================
const { Router } = require('express')
const { authenticate, requireAnyStaff } = require('../middleware')
const { validate, createOrderSchema, updateOrderStatusSchema } = require('../validators')
const orderCtrl = require('../controllers/orders')

const router = Router()
router.use(authenticate)

router.post('/',   validate(createOrderSchema), orderCtrl.createOrder)
router.get('/',    orderCtrl.getOrders)
router.get('/:id', orderCtrl.getOrder)

router.patch('/:id/status',
  requireAnyStaff,
  validate(updateOrderStatusSchema),
  orderCtrl.updateOrderStatus
)
router.post('/:id/refund',  requireAnyStaff, orderCtrl.refundOrder)
router.get('/:id/receipt',  orderCtrl.getOrderReceipt)

module.exports = router
