// ============================================================
// SelfPay — Zod Request Validators
// ============================================================
const { z } = require('zod')

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a number')

// ── Auth: Chain Manager Register ─────────────────────────
const chainRegisterSchema = z.object({
  email:        z.string().email(),
  password:     passwordSchema,
  businessName: z.string().min(2).max(100),
  phone:        z.string().min(7).max(20),
  plan:         z.enum(['basic', 'standard', 'pro']).default('basic'),
})

// ── Auth: Store Manager Register ─────────────────────────
const storeRegisterSchema = z.object({
  email:        z.string().email(),
  password:     passwordSchema,
  storeName:    z.string().min(2).max(100),
  name:         z.string().min(2).max(80),
  phone:        z.string().min(7).max(20),
  storeAddress: z.string().min(5).optional(),
  plan:         z.enum(['basic', 'standard', 'pro']).default('basic'),
})

// ── Auth: Branch Invite ──────────────────────────────────
const branchInviteSchema = z.object({
  branchEmail:   z.string().email(),
  branchName:    z.string().min(2).max(100),
  branchAddress: z.string().min(5).optional(),
})

// ── Auth: Branch Activate ────────────────────────────────
const branchActivateSchema = z.object({
  token:    z.string().uuid(),
  password: passwordSchema,
  name:     z.string().min(2).max(80),
  phone:    z.string().min(7).max(20),
})

// ── Auth: Web Login ──────────────────────────────────────
const webLoginSchema = z.object({
  idToken: z.string().min(1),
})

// ── Auth: Change Plan ───────────────────────────────
const changePlanSchema = z.object({
  plan: z.enum(['basic', 'standard', 'pro']),
})

// ── Store ─────────────────────────────────────────────────
const createStoreSchema = z.object({
  name:         z.string().min(2).max(100),
  email:        z.string().email(),
  phone:        z.string().min(7).max(20),
  address:      z.string().min(5),
  city:         z.string().min(2),
  country:      z.string().min(2),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#00E5A0'),
  currency:     z.string().length(3).default('USD'),
  vatRate:      z.number().min(0).max(100).default(5),
  posConnector: z.enum(['odoo', 'lightspeed', 'square', 'none']).default('none'),
})

const paymentGatewaySchema = z.object({
  gateway:       z.enum(['stripe', 'checkout']),
  publicKey:     z.string().min(1),
  secretKey:     z.string().min(1),
  webhookSecret: z.string().min(1),
})

// ── Product ───────────────────────────────────────────────
const createProductSchema = z.object({
  name:              z.string().min(1).max(200),
  description:       z.string().max(1000).optional(),
  barcode:           z.string().min(1),
  sku:               z.string().min(1),
  price:             z.number().positive(),
  comparePrice:      z.number().positive().optional(),
  category:          z.string().min(1),
  tags:              z.array(z.string()).default([]),
  stock:             z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  unit:              z.string().default('piece'),
  vatIncluded:       z.boolean().default(true),
})

const adjustStockSchema = z.object({
  delta:  z.number().int().refine((n) => n !== 0, 'Delta cannot be zero'),
  reason: z.string().min(1),
})

// ── Order ─────────────────────────────────────────────────
const createOrderSchema = z.object({
  storeId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity:  z.number().int().positive(),
      })
    )
    .min(1, 'Order must have at least one item'),
  notes: z.string().max(500).optional(),
})

const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'payment_pending', 'paid', 'processing', 'ready', 'completed', 'cancelled', 'refunded']),
})

// ── Promotion ─────────────────────────────────────────────
const createPromotionSchema = z
  .object({
    title:          z.string().min(2).max(100),
    description:    z.string().max(500).optional(),
    type:           z.enum(['percentage', 'fixed', 'buy_x_get_y']),
    value:          z.number().positive(),
    minOrderAmount: z.number().min(0).optional(),
    maxUses:        z.number().int().positive().optional(),
    storeId:        z.string().optional(),
    productIds:     z.array(z.string()).optional(),
    categoryIds:    z.array(z.string()).optional(),
    startsAt:       z.string().datetime(),
    endsAt:         z.string().datetime(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  })

// ── POS ───────────────────────────────────────────────────
const connectPosSchema = z.object({
  connector:   z.enum(['odoo', 'lightspeed', 'square']),
  credentials: z.record(z.string()),
})

// ── Validate middleware factory ───────────────────────────
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field:   e.path.join('.'),
        message: e.message,
      }))
      return res.status(400).json({ success: false, message: 'Validation failed', errors })
    }
    req.body = result.data
    next()
  }
}

module.exports = {
  validate,
  // Auth schemas
  chainRegisterSchema,
  storeRegisterSchema,
  branchInviteSchema,
  branchActivateSchema,
  webLoginSchema,
  changePlanSchema,
  // Store schemas
  createStoreSchema,
  paymentGatewaySchema,
  // Product schemas
  createProductSchema,
  adjustStockSchema,
  // Order schemas
  createOrderSchema,
  updateOrderStatusSchema,
  // Promotion schemas
  createPromotionSchema,
  // POS schemas
  connectPosSchema,
}
