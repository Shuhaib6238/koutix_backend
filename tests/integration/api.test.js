// ============================================================
// KOUTIX — Integration Tests (API endpoints with supertest)
// ============================================================
const request  = require('supertest')
const mongoose = require('mongoose')
const app      = require('../../src/app')
const { User, Store, Product, Order } = require('../../src/models')

// ── Mock Firebase Admin ───────────────────────────────────
jest.mock('../../src/config/firebase', () => ({
  initFirebaseAdmin:      jest.fn(),
  verifyIdToken:          jest.fn().mockResolvedValue({ uid: 'test-uid-admin' }),
  setUserClaims:          jest.fn(),
  revokeUserTokens:       jest.fn(),
  sendPushNotification:   jest.fn(),
  sendMulticastNotification: jest.fn(),
  admin: {
    auth: () => ({
      createUser:          jest.fn().mockResolvedValue({ uid: 'mock-firebase-uid' }),
      updateUser:          jest.fn(),
      setCustomUserClaims: jest.fn(),
      getUser:             jest.fn().mockResolvedValue({ customClaims: {} }),
    }),
  },
}))

// ── Mock Redis ────────────────────────────────────────────
jest.mock('../../src/config/redis', () => ({
  connectRedis:    jest.fn(),
  disconnectRedis: jest.fn(),
  getRedis: jest.fn().mockReturnValue({
    get:   jest.fn().mockResolvedValue(null),
    setex: jest.fn(),
    del:   jest.fn(),
    keys:  jest.fn().mockResolvedValue([]),
    lrange: jest.fn().mockResolvedValue([]),
    llen:   jest.fn().mockResolvedValue(0),
    lpush:  jest.fn(),
    ltrim:  jest.fn(),
    ping:   jest.fn().mockResolvedValue('PONG'),
  }),
  cache: {
    get:              jest.fn().mockResolvedValue(null),
    set:              jest.fn(),
    del:              jest.fn(),
    invalidatePattern: jest.fn(),
  },
}))

// ── Test data ─────────────────────────────────────────────
let adminUser
let managerUser
let testStore
let testProduct

// ── DB setup ─────────────────────────────────────────────
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/koutix_test')

  adminUser = await User.create({
    uid:      'test-uid-admin',
    email:    'admin@koutix.test',
    name:     'Test Admin',
    role:     'superAdmin',
    isActive: true,
  })

  testStore = await Store.create({
    name:     'Test Store',
    email:    'store@koutix.test',
    phone:    '+1555000001',
    address:  { street: '123 Main St', city: 'Dubai', country: 'UAE' },
    status:   'active',
    currency: 'USD',
    vatRate:  5,
  })

  managerUser = await User.create({
    uid:      'test-uid-manager',
    email:    'manager@koutix.test',
    name:     'Test Manager',
    role:     'branchManager',
    storeId:  testStore._id,
    isActive: true,
  })
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(() => {
  jest.clearAllMocks()
  // Default: authenticate as superAdmin
  const { verifyIdToken } = require('../../src/config/firebase')
  verifyIdToken.mockResolvedValue({ uid: 'test-uid-admin' })
})

// ── Helper: authenticated request ────────────────────────
const asAdmin   = (r) => r.set('Authorization', 'Bearer valid-token')
const asManager = (r) => {
  const { verifyIdToken } = require('../../src/config/firebase')
  verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })
  return r.set('Authorization', 'Bearer manager-token')
}

// ═══════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════
describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('timestamp')
    expect(res.body).toHaveProperty('env')
  })
})

// ═══════════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════════
describe('Auth API', () => {
  test('GET /auth/me — 401 without token', async () => {
    const res = await request(app).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  test('GET /auth/me — 200 with valid token', async () => {
    const res = await asAdmin(request(app).get('/api/v1/auth/me'))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.email).toBe('admin@koutix.test')
    expect(res.body.data.role).toBe('superAdmin')
  })

  test('GET /auth/me — 401 with invalid token', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockRejectedValueOnce(new Error('Invalid token'))

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer bad-token')

    expect(res.status).toBe(401)
  })

  test('POST /auth/register/chain — 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/chain')
      .send({ chainName: 'Test' }) // missing email, password, phone

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.errors).toBeDefined()
  })

  test('POST /auth/register/store — 400 with weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/store')
      .send({
        storeName: 'Test Store',
        email:     'test@test.com',
        password:  'weak',         // too weak
        phone:     '+971500000000',
        address:   '123 Main St',
        city:      'Dubai',
        country:   'UAE',
      })

    expect(res.status).toBe(400)
  })

  test('GET /auth/invite/verify/:token — 400 for invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/invite/verify/invalidtoken123')

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid|expired/i)
  })
})

// ═══════════════════════════════════════════════════════════
// Stores
// ═══════════════════════════════════════════════════════════
describe('Stores API', () => {
  test('GET /stores — 200 returns store list', async () => {
    const res = await asAdmin(request(app).get('/api/v1/stores'))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.pagination).toBeDefined()
  })

  test('GET /stores — 401 without auth', async () => {
    const res = await request(app).get('/api/v1/stores')
    expect(res.status).toBe(401)
  })

  test('POST /stores — 400 with missing required fields', async () => {
    const res = await asAdmin(
      request(app).post('/api/v1/stores').send({ name: 'Incomplete' })
    )
    expect(res.status).toBe(400)
    expect(res.body.errors).toBeDefined()
  })

  test('POST /stores — 403 when branchManager tries to create', async () => {
    const res = await asManager(
      request(app).post('/api/v1/stores').send({
        name: 'New Store', email: 'n@n.com', phone: '+1', address: '1 st', city: 'c', country: 'c',
      })
    )
    expect(res.status).toBe(403)
  })

  test('GET /stores/:id — 200 returns specific store', async () => {
    const res = await asAdmin(
      request(app).get(`/api/v1/stores/${testStore._id}`)
    )
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Test Store')
    expect(res.body.data.gatewayConfig).toBeUndefined() // hidden
  })

  test('GET /stores/:id — 404 for non-existent store', async () => {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await asAdmin(request(app).get(`/api/v1/stores/${fakeId}`))
    expect(res.status).toBe(404)
  })

  test('PATCH /stores/:id/approve — approves store', async () => {
    const pendingStore = await Store.create({
      name: 'Pending', email: 'p@p.com', phone: '+1',
      address: { street: '1', city: 'c', country: 'c' },
      status: 'pending_approval',
    })
    const res = await asAdmin(
      request(app).patch(`/api/v1/stores/${pendingStore._id}/approve`)
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('active')
    await Store.findByIdAndDelete(pendingStore._id)
  })
})

// ═══════════════════════════════════════════════════════════
// Products
// ═══════════════════════════════════════════════════════════
describe('Products API', () => {
  beforeEach(async () => {
    testProduct = await Product.create({
      storeId:           testStore._id,
      name:              'Test Milk 1L',
      barcode:           '1234567890123',
      sku:               'MILK-1L-001',
      price:             2.50,
      category:          'Dairy',
      stock:             100,
      lowStockThreshold: 10,
    })
  })

  afterEach(async () => {
    await Product.deleteMany({ storeId: testStore._id })
  })

  test('GET /stores/:storeId/products — returns product list', async () => {
    const res = await asAdmin(
      request(app).get(`/api/v1/stores/${testStore._id}/products`)
    )
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThan(0)
    expect(res.body.pagination.total).toBeGreaterThan(0)
  })

  test('GET /stores/:storeId/products/barcode/:barcode — finds product', async () => {
    const res = await asAdmin(
      request(app).get(`/api/v1/stores/${testStore._id}/products/barcode/1234567890123`)
    )
    expect(res.status).toBe(200)
    expect(res.body.data.name).toBe('Test Milk 1L')
    expect(res.body.data.price).toBe(2.50)
  })

  test('GET /stores/:storeId/products/barcode/:barcode — 404 not found', async () => {
    const res = await asAdmin(
      request(app).get(`/api/v1/stores/${testStore._id}/products/barcode/9999999999`)
    )
    expect(res.status).toBe(404)
  })

  test('GET /stores/:storeId/products/categories — returns category list', async () => {
    const res = await asAdmin(
      request(app).get(`/api/v1/stores/${testStore._id}/products/categories`)
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toContain('Dairy')
  })

  test('POST /stores/:storeId/products — 400 with missing fields', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .post(`/api/v1/stores/${testStore._id}/products`)
      .set('Authorization', 'Bearer manager-token')
      .send({ name: 'Missing fields' }) // no barcode, sku, price, category

    expect(res.status).toBe(400)
  })

  test('POST stock-adjust — increases stock', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .post(`/api/v1/stores/${testStore._id}/products/${testProduct._id}/stock-adjust`)
      .set('Authorization', 'Bearer manager-token')
      .send({ delta: 50, reason: 'Received new stock' })

    expect(res.status).toBe(200)
    expect(res.body.data.stock).toBe(150)
  })

  test('POST stock-adjust — decreases stock', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .post(`/api/v1/stores/${testStore._id}/products/${testProduct._id}/stock-adjust`)
      .set('Authorization', 'Bearer manager-token')
      .send({ delta: -20, reason: 'Damaged goods' })

    expect(res.status).toBe(200)
    expect(res.body.data.stock).toBe(80)
  })

  test('POST stock-adjust — 400 when delta causes negative stock', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .post(`/api/v1/stores/${testStore._id}/products/${testProduct._id}/stock-adjust`)
      .set('Authorization', 'Bearer manager-token')
      .send({ delta: -999, reason: 'Error test' })

    expect(res.status).toBe(400)
  })

  test('DELETE /stores/:storeId/products/:id — soft deletes product', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .delete(`/api/v1/stores/${testStore._id}/products/${testProduct._id}`)
      .set('Authorization', 'Bearer manager-token')

    expect(res.status).toBe(200)

    // Verify soft-deleted (isActive = false)
    const p = await Product.findById(testProduct._id)
    expect(p.isActive).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════
// Orders
// ═══════════════════════════════════════════════════════════
describe('Orders API', () => {
  test('GET /orders — returns order list', async () => {
    const res = await asAdmin(request(app).get('/api/v1/orders'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('GET /orders — 401 without auth', async () => {
    const res = await request(app).get('/api/v1/orders')
    expect(res.status).toBe(401)
  })

  test('GET /orders/:id — 404 for non-existent order', async () => {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await asAdmin(request(app).get(`/api/v1/orders/${fakeId}`))
    expect(res.status).toBe(404)
  })

  test('GET /orders/:id — 400 for invalid ObjectId', async () => {
    const res = await asAdmin(request(app).get('/api/v1/orders/not-an-id'))
    expect(res.status).toBe(400)
  })

  test('POST /orders — 400 with empty items array', async () => {
    const res = await asAdmin(
      request(app).post('/api/v1/orders').send({ storeId: testStore._id, items: [] })
    )
    expect(res.status).toBe(400)
    expect(res.body.errors).toBeDefined()
  })

  test('POST /orders — 400 with missing storeId', async () => {
    const res = await asAdmin(
      request(app).post('/api/v1/orders').send({
        items: [{ productId: new mongoose.Types.ObjectId(), quantity: 1 }],
      })
    )
    expect(res.status).toBe(400)
  })

  test('PATCH /orders/:id/status — validates status enum', async () => {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await asAdmin(
      request(app).patch(`/api/v1/orders/${fakeId}/status`).send({ status: 'invalid_status' })
    )
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════
// Promotions
// ═══════════════════════════════════════════════════════════
describe('Promotions API', () => {
  test('GET /promotions — returns promotion list', async () => {
    const res = await asAdmin(request(app).get('/api/v1/promotions'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('POST /promotions — 400 when endsAt before startsAt', async () => {
    const res = await asAdmin(
      request(app).post('/api/v1/promotions').send({
        title:    'Test Promo',
        type:     'percentage',
        value:    10,
        startsAt: '2025-12-31T00:00:00Z',
        endsAt:   '2025-01-01T00:00:00Z', // before start
      })
    )
    expect(res.status).toBe(400)
  })

  test('POST /promotions — 400 with missing required fields', async () => {
    const res = await asAdmin(
      request(app).post('/api/v1/promotions').send({ title: 'No type or dates' })
    )
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════
// Admin
// ═══════════════════════════════════════════════════════════
describe('Admin API', () => {
  test('GET /admin/stats — returns platform stats', async () => {
    const res = await asAdmin(request(app).get('/api/v1/admin/stats'))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('totalRevenue')
    expect(res.body.data).toHaveProperty('totalOrders')
    expect(res.body.data).toHaveProperty('activeStores')
    expect(res.body.data).toHaveProperty('totalUsers')
  })

  test('GET /admin/stats — 403 for non-superAdmin', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', 'Bearer manager-token')

    expect(res.status).toBe(403)
  })

  test('GET /admin/stores/pending — lists pending stores', async () => {
    const res = await asAdmin(request(app).get('/api/v1/admin/stores/pending'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  test('GET /admin/users — returns user list', async () => {
    const res = await asAdmin(request(app).get('/api/v1/admin/users'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    // inviteToken should be stripped
    if (res.body.data.length > 0) {
      expect(res.body.data[0].inviteToken).toBeUndefined()
    }
  })

  test('GET /admin/analytics/revenue — returns revenue series', async () => {
    const res = await asAdmin(
      request(app).get('/api/v1/admin/analytics/revenue').query({ interval: 'day' })
    )
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// POS
// ═══════════════════════════════════════════════════════════
describe('POS API', () => {
  test('GET /pos/connectors — returns connector list', async () => {
    const res = await asAdmin(request(app).get('/api/v1/pos/connectors'))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBe(3)
    const ids = res.body.data.map((c) => c.id)
    expect(ids).toContain('odoo')
    expect(ids).toContain('lightspeed')
    expect(ids).toContain('square')
  })

  test('POST /pos/stores/:storeId/connect — 400 with invalid connector', async () => {
    const { verifyIdToken } = require('../../src/config/firebase')
    verifyIdToken.mockResolvedValueOnce({ uid: 'test-uid-manager' })

    const res = await request(app)
      .post(`/api/v1/pos/stores/${testStore._id}/connect`)
      .set('Authorization', 'Bearer manager-token')
      .send({ connector: 'invalid_connector', credentials: {} })

    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════
// Security
// ═══════════════════════════════════════════════════════════
describe('Security', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await asAdmin(request(app).get('/api/v1/nonexistent'))
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  test('returns 401 for protected routes without token', async () => {
    const routes = [
      '/api/v1/stores',
      '/api/v1/orders',
      '/api/v1/promotions',
    ]
    for (const route of routes) {
      const res = await request(app).get(route)
      expect(res.status).toBe(401)
    }
  })

  test('webhook returns 400 without signature header', async () => {
    const fakeId = new mongoose.Types.ObjectId()
    const res = await request(app)
      .post(`/api/v1/webhooks/stripe/${fakeId}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'test' }))

    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/signature/i)
  })

  test('NoSQL injection is sanitized', async () => {
    const res = await asAdmin(
      request(app).get('/api/v1/stores').query({ status: { $gt: '' } })
    )
    // Should not throw — sanitized gracefully
    expect(res.status).toBe(200)
  })
})
