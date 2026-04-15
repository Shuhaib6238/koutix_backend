// ============================================================
// KOUTIX — Admin-specific Validators
// ============================================================
const { z } = require('zod')

// ── Admin Role Update ──────────────────────────────────────
const updateUserRoleSchema = z.object({
  role: z.enum(['superadmin', 'chain_manager', 'branch_manager', 'store_manager', 'customer']),
})

// ── Admin List Query Parameters ───────────────────────────
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  status: z.string().trim().optional(),
  role: z.string().trim().optional(),
})

// ── Admin Orders List Query ────────────────────────────────
const listOrdersSchema = listQuerySchema.extend({
  storeId: z.string().trim().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

// ── Reject Store ───────────────────────────────────────────
const rejectStoreSchema = z.object({
  reason: z.string().trim().min(1, 'Reason required').max(500),
})

module.exports = {
  updateUserRoleSchema,
  listQuerySchema,
  listOrdersSchema,
  rejectStoreSchema,
}
