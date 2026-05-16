// ============================================================
// KOUTIX — Branches Routes (/api/branches/*)
// ============================================================
const { Router } = require('express')
const { authenticate, requireBranchManager } = require('../middleware')
const { getBranchInventory } = require('../controllers/inventory')

const router = Router()

router.get('/:branchId/inventory', authenticate, requireBranchManager, getBranchInventory)

module.exports = router
