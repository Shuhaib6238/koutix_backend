// ============================================================
// SelfPay — All Mongoose Models
// ============================================================
const mongoose = require('mongoose')
const { Schema } = mongoose

// ── Role-based Auth Models (separate files) ──────────────
const SuperAdmin   = require('./SuperAdmin')
const ChainManager = require('./ChainManager')
const BranchManager = require('./BranchManager')
const StoreManager = require('./StoreManager')
const Customer     = require('./Customer')
const InviteToken  = require('./InviteToken')
const PosEvent     = require('./PosEvent')
const AuditLog     = require('./AuditLog')

// ── User (legacy — kept for migration) ───────────────────
const UserSchema = new Schema(
  {
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    firebaseUid:  { type: String, unique: true, sparse: true, index: true },
    name:         { type: String, required: true, trim: true },
    phone:        { type: String, trim: true },
    address:      { type: String, trim: true },
    role:         {
      type: String,
      enum: ['superAdmin', 'chainManager', 'branchManager', 'customer'],
      required: true,
    },
    chainId:      { type: Schema.Types.ObjectId, ref: 'Chain', index: true },
    storeId:      { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    avatar:       String,
    fcmToken:     String,
    isActive:     { type: Boolean, default: true },
    inviteToken:  String,
    inviteExpires: Date,
  },
  { timestamps: true }
)

UserSchema.index({ email: 1, role: 1 })

const User = mongoose.model('User', UserSchema)

// ── Chain ─────────────────────────────────────────────────
const ChainSchema = new Schema(
  {
    name:                 { type: String, required: true, trim: true },
    logo:                 String,
    ownerId:              { type: Schema.Types.ObjectId, ref: 'User', required: true },
    subscriptionPlan:     {
      type: String,
      enum: ['starter', 'chain', 'enterprise'],
      default: 'starter',
    },
    subscriptionStatus:   {
      type: String,
      enum: ['trial', 'active', 'past_due', 'cancelled'],
      default: 'trial',
    },
    stripeCustomerId:     String,
    stripeSubscriptionId: String,
    isActive:             { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
)

ChainSchema.virtual('branchCount', {
  ref: 'Store',
  localField: '_id',
  foreignField: 'chainId',
  count: true,
})

const Chain = mongoose.model('Chain', ChainSchema)

// ── Store ─────────────────────────────────────────────────
const StoreSchema = new Schema(
  {
    name:        { type: String, required: true, trim: true },
    chainId:     { type: Schema.Types.ObjectId, ref: 'Chain', index: true },
    address: {
      street:  { type: String, required: true },
      city:    { type: String, required: true },
      country: { type: String, required: true },
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    phone:        { type: String, required: true },
    email:        { type: String, required: true, lowercase: true },
    logo:         String,
    coverImage:   String,
    primaryColor: { type: String, default: '#00E5A0' },
    status: {
      type: String,
      enum: ['pending_approval', 'active', 'suspended', 'inactive'],
      default: 'pending_approval',
    },
    gatewayConfig: {
      provider:               { type: String, enum: ['stripe', 'checkout'] },
      publicKeyEncrypted:     String,
      secretKeyEncrypted:     String,
      webhookSecretEncrypted: String,
    },
    currency:    { type: String, default: 'USD' },
    vatRate:     { type: Number, default: 5 },
    managerId:   { type: Schema.Types.ObjectId, ref: 'User' },
    operatingHours: {
      open:  String,
      close: String,
      days:  [String],
    },
    posConnector: {
      type: String,
      enum: ['odoo', 'lightspeed', 'square', 'none'],
      default: 'none',
    },
    posCredentialsEncrypted: String,
    lastPosSyncAt:           Date,
    posConnection: {
      posType:              { type: String, enum: ['ls_retail', 'sap', 'custom', null], default: null },
      method:               { type: String, enum: ['api_pull', 'webhook', null], default: null },
      status:               { type: String, enum: ['disconnected', 'connected', 'error'], default: 'disconnected' },
      encryptedCredentials: { type: String, default: null },
      webhookSecret:        { type: String, default: null },
      pullIntervalSeconds:  { type: Number, default: 300 },
      lastSyncAt:           { type: Date, default: null },
      lastSyncStatus:       { type: String, enum: ['success', 'fail', null], default: null },
      lastErrorMessage:     { type: String, default: null },
    },
    totalOrders:             { type: Number, default: 0 },
    totalRevenue:            { type: Number, default: 0 },
    isPromoted:              { type: Boolean, default: false },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], index: '2dsphere' }, // [lng, lat]
    },
  },
  { timestamps: true }
)

StoreSchema.pre('save', function(next) {
  if (this.address && this.address.coordinates) {
    this.location = {
      type: 'Point',
      coordinates: [this.address.coordinates.lng, this.address.coordinates.lat]
    }
  }
  next()
})

StoreSchema.index({ chainId: 1, status: 1 })
StoreSchema.index({ 'address.city': 1 })

const Store = mongoose.model('Store', StoreSchema)

// ── Product ───────────────────────────────────────────────
const ProductSchema = new Schema(
  {
    storeId:           { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name:              { type: String, required: true, trim: true },
    description:       String,
    barcode:           { type: String, required: true },
    sku:               { type: String, required: true },
    price:             { type: Number, required: true, min: 0 },
    comparePrice:      { type: Number, min: 0 },
    images:            [String],
    category:          { type: String, required: true, index: true },
    tags:              [String],
    stock:             { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    unit:              { type: String, default: 'piece' },
    isActive:          { type: Boolean, default: true },
    vatIncluded:       { type: Boolean, default: true },
    posProductId:      String,
  },
  { timestamps: true }
)

ProductSchema.index({ storeId: 1, barcode: 1 }, { unique: true })
ProductSchema.index({ storeId: 1, sku: 1 }, { unique: true })
ProductSchema.index({ storeId: 1, category: 1 })
ProductSchema.index({ storeId: 1, stock: 1 })
ProductSchema.index({ name: 'text', barcode: 'text', sku: 'text' })

const Product = mongoose.model('Product', ProductSchema)

// ── Order ─────────────────────────────────────────────────
const OrderItemSchema = new Schema(
  {
    productId:   { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    barcode:     { type: String, required: true },
    price:       { type: Number, required: true },
    quantity:    { type: Number, required: true, min: 1 },
    subtotal:    { type: Number, required: true },
    imageUrl:    String,
  },
  { _id: false }
)

const OrderSchema = new Schema(
  {
    orderNumber:      { type: String, required: true, unique: true },
    storeId:          { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    storeName:        { type: String, required: true },
    customerId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName:     { type: String, required: true },
    customerPhone:    { type: String, required: true },
    items:            [OrderItemSchema],
    subtotal:         { type: Number, required: true },
    vatAmount:        { type: Number, required: true },
    vatRate:          { type: Number, required: true },
    total:            { type: Number, required: true },
    currency:         { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['pending', 'payment_pending', 'paid', 'processing', 'ready', 'completed', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentGateway:   { type: String, enum: ['stripe', 'checkout'] },
    paymentSessionId: String,
    paymentReference: String,
    paidAt:           Date,
    receiptUrl:       String,
    qrCode:           String,
    notes:            String,
    refundReason:     String,
    refundedAt:       Date,
  },
  { timestamps: true }
)

OrderSchema.index({ storeId: 1, createdAt: -1 })
OrderSchema.index({ customerId: 1, createdAt: -1 })
OrderSchema.index({ status: 1, createdAt: -1 })
OrderSchema.index({ paymentSessionId: 1 })

const Order = mongoose.model('Order', OrderSchema)

// ── Promotion ─────────────────────────────────────────────
const PromotionSchema = new Schema(
  {
    title:          { type: String, required: true, trim: true },
    description:    String,
    storeId:        { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    chainId:        { type: Schema.Types.ObjectId, ref: 'Chain', index: true },
    type:           { type: String, enum: ['percentage', 'fixed', 'buy_x_get_y'], required: true },
    value:          { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, min: 0 },
    maxUses:        Number,
    usedCount:      { type: Number, default: 0 },
    productIds:     [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    categoryIds:    [String],
    startsAt:       { type: Date, required: true, index: true },
    endsAt:         { type: Date, required: true, index: true },
    isActive:       { type: Boolean, default: true },
    bannerImage:    String,
  },
  { timestamps: true }
)

PromotionSchema.index({ storeId: 1, isActive: 1 })
PromotionSchema.index({ chainId: 1, isActive: 1 })

const Promotion = mongoose.model('Promotion', PromotionSchema)

module.exports = {
  // New SelfPay auth models
  SuperAdmin, ChainManager, BranchManager, StoreManager, Customer, InviteToken,
  // Legacy + shared models
  User, Chain, Store, Product, Order, Promotion,
  // POS
  PosEvent,
  AuditLog,
}
