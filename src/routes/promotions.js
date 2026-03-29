// ============================================================
// KOUTIX — Promotions Routes
// ============================================================
const { Router } = require('express')
const { authenticate, requireChainManager, requireAnyStaff } = require('../middleware')
const { validate, createPromotionSchema } = require('../validators')
const promoCtrl = require('../controllers/promotions')

const router = Router()
router.use(authenticate)

router.get('/',    requireAnyStaff,                                    promoCtrl.getPromotions)
router.get('/:id', requireAnyStaff,                                    promoCtrl.getPromotion)
router.post('/',   requireChainManager, validate(createPromotionSchema), promoCtrl.createPromotion)
router.patch('/:id',         requireChainManager, promoCtrl.updatePromotion)
router.delete('/:id',        requireChainManager, promoCtrl.deletePromotion)
router.patch('/:id/toggle',  requireChainManager, promoCtrl.togglePromotion)

module.exports = router
