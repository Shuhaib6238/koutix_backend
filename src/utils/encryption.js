// ============================================================
// KOUTIX — AES-256 Encryption Utility
// ============================================================
const CryptoJS = require('crypto-js')

// Accepts either a 32-char raw UTF-8 string OR a 64-char hex-encoded
// 32-byte key. Same idea for IV (16 raw / 32 hex).
function getKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY env var is required')
  if (key.length === 32) return CryptoJS.enc.Utf8.parse(key)
  if (key.length === 64) return CryptoJS.enc.Hex.parse(key)
  throw new Error(`ENCRYPTION_KEY must be 32 chars (raw) or 64 chars (hex) — got ${key.length}`)
}

function getIV() {
  const iv = process.env.ENCRYPTION_IV
  if (!iv) throw new Error('ENCRYPTION_IV env var is required')
  if (iv.length === 16) return CryptoJS.enc.Utf8.parse(iv)
  if (iv.length === 32) return CryptoJS.enc.Hex.parse(iv)
  throw new Error(`ENCRYPTION_IV must be 16 chars (raw) or 32 chars (hex) — got ${iv.length}`)
}

function encrypt(plaintext) {
  const encrypted = CryptoJS.AES.encrypt(plaintext, getKey(), {
    iv:      getIV(),
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return encrypted.toString()
}

function decrypt(ciphertext) {
  const decrypted = CryptoJS.AES.decrypt(ciphertext, getKey(), {
    iv:      getIV(),
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })
  return decrypted.toString(CryptoJS.enc.Utf8)
}

function encryptObject(obj) {
  return encrypt(JSON.stringify(obj))
}

function decryptObject(ciphertext) {
  return JSON.parse(decrypt(ciphertext))
}

module.exports = { encrypt, decrypt, encryptObject, decryptObject }
