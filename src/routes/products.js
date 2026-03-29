// ============================================================
// KOUTIX — Products Routes  (/stores/:storeId/products/*)
// ============================================================
const { Router } = require('express')
const {
  authenticate,
  requireBranchManager,
  canAccessStore,
} = require('../middleware')
const { validate, createProductSchema, adjustStockSchema } = require('../validators')
const productCtrl = require('../controllers/products')

const router = Router({ mergeParams: true })
router.use(authenticate)
router.use(canAccessStore)

router.get('/',                  productCtrl.getProducts)
router.get('/categories',        productCtrl.getCategories)
router.get('/low-stock',         productCtrl.getLowStockProducts)
router.get('/barcode/:barcode',  productCtrl.getProductByBarcode)
router.get('/:id',               productCtrl.getProduct)

router.post('/',
  requireBranchManager,
  validate(createProductSchema),
  productCtrl.createProduct
)
router.patch('/:id',  requireBranchManager, productCtrl.updateProduct)
router.delete('/:id', requireBranchManager, productCtrl.deleteProduct)

router.post('/:id/stock-adjust',
  requireBranchManager,
  validate(adjustStockSchema),
  productCtrl.adjustStock
)
router.post('/bulk-price', requireBranchManager, productCtrl.bulkUpdatePrices)

module.exports = router
