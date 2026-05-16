// ============================================================
// KOUTIX — Inventory Controller
// ============================================================
const { Product, Store } = require('../models')
const { success, error } = require('../utils')

async function getBranchInventory(req, res, next) {
  try {
    const { branchId } = req.params
    const store = await Store.findById(branchId)
    if (!store) return error(res, 'Branch not found', 404)
    const products = await Product.find({
      storeId: branchId,
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean()
    return success(res, products)
  } catch (err) {
    next(err)
  }
}

module.exports = { getBranchInventory }
