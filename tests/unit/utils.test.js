// ============================================================
// KOUTIX — Unit Tests (utils, encryption, validators)
// ============================================================
const { calculateVAT, generateOrderNumber, generateInviteToken, verifyHmacSignature, getPaginationParams } = require('../../src/utils')
const { encrypt, decrypt, encryptObject, decryptObject } = require('../../src/utils/encryption')
const { applyPromotion } = require('../../src/controllers/promotions')

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'koutix_test_key_exactly_32_chars!'
  process.env.ENCRYPTION_IV  = 'koutix_test_iv16'
})

// ── calculateVAT ─────────────────────────────────────────
describe('calculateVAT', () => {
  test('should extract VAT when included in price', () => {
    const result = calculateVAT(105, 5, true)
    expect(result.subtotal).toBeCloseTo(100, 1)
    expect(result.vatAmount).toBeCloseTo(5, 1)
    expect(result.total).toBe(105)
  })

  test('should add VAT on top when not included', () => {
    const result = calculateVAT(100, 5, false)
    expect(result.subtotal).toBe(100)
    expect(result.vatAmount).toBe(5)
    expect(result.total).toBe(105)
  })

  test('should handle zero VAT rate', () => {
    const result = calculateVAT(100, 0, false)
    expect(result.vatAmount).toBe(0)
    expect(result.total).toBe(100)
  })

  test('should round to 2 decimal places', () => {
    const result = calculateVAT(99.99, 5, false)
    const decimals = result.vatAmount.toString().split('.')[1]?.length ?? 0
    expect(decimals).toBeLessThanOrEqual(2)
  })
})

// ── generateOrderNumber ───────────────────────────────────
describe('generateOrderNumber', () => {
  test('should start with ORD-', () => {
    expect(generateOrderNumber()).toMatch(/^ORD-/)
  })

  test('should be unique on every call', () => {
    const nums = new Set(Array.from({ length: 100 }, generateOrderNumber))
    expect(nums.size).toBe(100)
  })
})

// ── generateInviteToken ───────────────────────────────────
describe('generateInviteToken', () => {
  test('should return 64-char hex string', () => {
    const token = generateInviteToken()
    expect(token).toHaveLength(64)
    expect(token).toMatch(/^[a-f0-9]+$/)
  })
})

// ── verifyHmacSignature ───────────────────────────────────
describe('verifyHmacSignature', () => {
  test('should return true for valid signature', () => {
    const crypto  = require('crypto')
    const secret  = 'test-webhook-secret'
    const payload = Buffer.from('{"event":"payment_captured"}')
    const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    expect(verifyHmacSignature(payload, sig, secret)).toBe(true)
  })

  test('should return false for invalid signature', () => {
    const payload = Buffer.from('{"event":"payment_captured"}')
    expect(verifyHmacSignature(payload, 'invalid_sig_1234567890abcdef1234567890abcdef', 'test-secret')).toBe(false)
  })
})

// ── getPaginationParams ───────────────────────────────────
describe('getPaginationParams', () => {
  test('should return defaults with no query params', () => {
    const p = getPaginationParams({})
    expect(p.page).toBe(1)
    expect(p.limit).toBe(20)
    expect(p.skip).toBe(0)
  })

  test('should clamp limit to 100 maximum', () => {
    const p = getPaginationParams({ limit: '999' })
    expect(p.limit).toBe(100)
  })

  test('should calculate skip correctly', () => {
    const p = getPaginationParams({ page: '3', limit: '10' })
    expect(p.skip).toBe(20)
  })

  test('should not allow page below 1', () => {
    const p = getPaginationParams({ page: '-5' })
    expect(p.page).toBe(1)
    expect(p.skip).toBe(0)
  })
})

// ── AES-256 Encryption ────────────────────────────────────
describe('AES-256 Encryption', () => {
  const plaintext = 'sk_test_koutix_dummy_key_12345'

  test('should encrypt and decrypt a string', () => {
    const encrypted = encrypt(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(decrypt(encrypted)).toBe(plaintext)
  })

  test('should encrypt and decrypt an object', () => {
    const obj = { apiKey: 'pk_test_abc', secretKey: 'sk_test_xyz', webhookSecret: 'whsec_test_123' }
    const encrypted = encryptObject(obj)
    const decrypted = decryptObject(encrypted)
    expect(decrypted).toEqual(obj)
  })

  test('should throw on invalid ciphertext', () => {
    expect(() => decrypt('not_valid')).toThrow()
  })
})

// ── applyPromotion ────────────────────────────────────────
describe('applyPromotion', () => {
  test('should apply percentage discount', () => {
    expect(applyPromotion({ type: 'percentage', value: 20 }, 100)).toBe(20)
  })

  test('should apply fixed discount', () => {
    expect(applyPromotion({ type: 'fixed', value: 10 }, 100)).toBe(10)
  })

  test('should not exceed order total for fixed discount', () => {
    expect(applyPromotion({ type: 'fixed', value: 200 }, 50)).toBe(50)
  })

  test('should return 0 when min order amount not met', () => {
    expect(applyPromotion({ type: 'percentage', value: 20, minOrderAmount: 100 }, 50)).toBe(0)
  })

  test('should apply when min order amount is exactly met', () => {
    expect(applyPromotion({ type: 'fixed', value: 5, minOrderAmount: 50 }, 50)).toBe(5)
  })
})
