// ============================================================
// KOUTIX — Products Controller
// ============================================================
const { Product } = require('../models')
const { success, successList, error, getPaginationParams } = require('../utils')
const { cache } = require('../config/redis')
const logger = require('../config/logger')

async function getProducts(req, res, next) {
  try {
    const { storeId } = req.params
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { search, category, lowStock } = req.query

    const filter = { storeId, isActive: true }
    if (category)       filter.category = category
    if (search)         filter.$text = { $search: search }
    if (lowStock === 'true') filter.$expr = { $lte: ['$stock', '$lowStockThreshold'] }

    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ])

    return successList(res, products, { page, limit, total })
  } catch (err) { next(err) }
}

async function getProduct(req, res, next) {
  try {
    const product = await Product.findOne({ _id: req.params.id, storeId: req.params.storeId })
    if (!product) return error(res, 'Product not found', 404)
    return success(res, product)
  } catch (err) { next(err) }
}

async function getProductByBarcode(req, res, next) {
  try {
    const code = String(req.params.barcode || '').trim()
    if (!code) return error(res, 'Barcode required', 400)

    const cacheKey = `product:${req.params.storeId}:${code}`
    const cached = await cache.get(cacheKey)
    if (cached) return success(res, cached)

    // POS-synced items may carry the printed code in barcode, sku, or
    // posProductId, so match any of them.
    const product = await Product.findOne({
      storeId: req.params.storeId,
      isActive: true,
      $or: [
        { barcode: code },
        { sku: code },
        { posProductId: code },
      ],
    })
    if (!product) {
      logger.warn(`[barcode-lookup] miss store=${req.params.storeId} code=${code}`)
      return error(res, 'Product not found', 404)
    }

    await cache.set(cacheKey, product.toJSON(), 300)
    return success(res, product)
  } catch (err) { next(err) }
}

async function createProduct(req, res, next) {
  try {
    const product = await Product.create({ ...req.body, storeId: req.params.storeId })
    await cache.invalidatePattern(`products:${req.params.storeId}:*`)
    return success(res, product, 201, 'Product created')
  } catch (err) { next(err) }
}

async function updateProduct(req, res, next) {
  try {
    const allowed = ['name','description','price','comparePrice','category','tags','unit','vatIncluded','isActive','lowStockThreshold','images']
    const updates = {}
    allowed.forEach((k) => { if (k in req.body) updates[k] = req.body[k] })

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, storeId: req.params.storeId },
      updates,
      { new: true, runValidators: true }
    )
    if (!product) return error(res, 'Product not found', 404)

    await cache.del(`product:${req.params.storeId}:${product.barcode}`)
    await cache.invalidatePattern(`products:${req.params.storeId}:*`)
    return success(res, product)
  } catch (err) { next(err) }
}

async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, storeId: req.params.storeId },
      { isActive: false },
      { new: true }
    )
    if (!product) return error(res, 'Product not found', 404)
    await cache.del(`product:${req.params.storeId}:${product.barcode}`)
    return success(res, null, 200, 'Product deleted')
  } catch (err) { next(err) }
}

async function adjustStock(req, res, next) {
  try {
    const { delta, reason } = req.body
    const product = await Product.findOneAndUpdate(
      {
        _id:     req.params.id,
        storeId: req.params.storeId,
        stock:   { $gte: delta < 0 ? Math.abs(delta) : 0 },
      },
      { $inc: { stock: delta } },
      { new: true, runValidators: true }
    )

    if (!product) return error(res, 'Product not found or insufficient stock', 400)

    logger.info(`Stock adjusted: product=${req.params.id} delta=${delta} reason="${reason}" by ${req.user.email}`)

    if (product.stock <= product.lowStockThreshold) {
      const { addLowStockAlertJob } = require('../jobs/queues')
      await addLowStockAlertJob(product._id.toString(), req.params.storeId)
    }

    await cache.del(`product:${req.params.storeId}:${product.barcode}`)
    return success(res, product)
  } catch (err) { next(err) }
}

async function getCategories(req, res, next) {
  try {
    const cacheKey = `categories:${req.params.storeId}`
    const cached = await cache.get(cacheKey)
    if (cached) return success(res, cached)

    const categories = await Product.distinct('category', { storeId: req.params.storeId, isActive: true })
    await cache.set(cacheKey, categories, 600)
    return success(res, categories)
  } catch (err) { next(err) }
}

async function getLowStockProducts(req, res, next) {
  try {
    const products = await Product.find({
      storeId:  req.params.storeId,
      isActive: true,
      $expr:    { $lte: ['$stock', '$lowStockThreshold'] },
    }).sort({ stock: 1 })
    return success(res, products)
  } catch (err) { next(err) }
}

async function bulkUpdatePrices(req, res, next) {
  try {
    const { updates } = req.body
    const ops = updates.map((u) => ({
      updateOne: {
        filter: { _id: u.productId, storeId: req.params.storeId },
        update: { $set: { price: u.price } },
      },
    }))
    const result = await Product.bulkWrite(ops)
    return success(res, { updated: result.modifiedCount })
  } catch (err) { next(err) }
}

module.exports = {
  getProducts, getProduct, getProductByBarcode,
  createProduct, updateProduct, deleteProduct,
  adjustStock, getCategories, getLowStockProducts, bulkUpdatePrices,
}
