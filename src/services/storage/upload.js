// ============================================================
// KOUTIX — S3 Upload Middleware (multer + S3)
// ============================================================
const multer = require('multer')
const path   = require('path')
const { v4: uuidv4 } = require('uuid')
const { uploadToS3 } = require('./receipt')
const { success, error } = require('../../utils')

// Memory storage — pipe directly to S3
const storage = multer.memoryStorage()

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'))
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
})

// ── Upload product image ──────────────────────────────────
async function uploadProductImage(req, res, next) {
  try {
    if (!req.file) return error(res, 'No image file provided', 400)

    const ext = path.extname(req.file.originalname).toLowerCase()
    const key = `products/${req.params.storeId}/${req.params.id}/${uuidv4()}${ext}`
    const url = await uploadToS3(req.file.buffer, key, req.file.mimetype)

    const { Product } = require('../../models')
    await Product.findByIdAndUpdate(req.params.id, { $addToSet: { images: url } })

    return success(res, { url })
  } catch (err) { next(err) }
}

// ── Upload store logo ─────────────────────────────────────
async function uploadStoreLogo(req, res, next) {
  try {
    if (!req.file) return error(res, 'No image file provided', 400)

    const ext = path.extname(req.file.originalname).toLowerCase()
    const key = `stores/${req.params.storeId}/logo${ext}`
    const url = await uploadToS3(req.file.buffer, key, req.file.mimetype)

    const { Store } = require('../../models')
    await Store.findByIdAndUpdate(req.params.storeId, { logo: url })

    return success(res, { url })
  } catch (err) { next(err) }
}

// ── Upload promotion banner ───────────────────────────────
async function uploadPromotionBanner(req, res, next) {
  try {
    if (!req.file) return error(res, 'No image file provided', 400)

    const ext = path.extname(req.file.originalname).toLowerCase()
    const key = `promotions/${req.params.promoId}/banner${ext}`
    const url = await uploadToS3(req.file.buffer, key, req.file.mimetype)

    const { Promotion } = require('../../models')
    await Promotion.findByIdAndUpdate(req.params.promoId, { bannerImage: url })

    return success(res, { url })
  } catch (err) { next(err) }
}

module.exports = { upload, uploadProductImage, uploadStoreLogo, uploadPromotionBanner }
