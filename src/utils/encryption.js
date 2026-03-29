// ============================================================
// KOUTIX — AES-256 Encryption Utility
// ============================================================
const CryptoJS = require('crypto-js')

function getKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters')
  }
  return key
}

function getIV() {
  const iv = process.env.ENCRYPTION_IV
  if (!iv || iv.length !== 16) {
    throw new Error('ENCRYPTION_IV must be exactly 16 characters')
  }
  return iv
}

function encrypt(plaintext) {
  const key = CryptoJS.enc.Utf8.parse(getKey())
  const iv  = CryptoJS.enc.Utf8.parse(getIV())

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  })

  return encrypted.toString()
}

function decrypt(ciphertext) {
  const key = CryptoJS.enc.Utf8.parse(getKey())
  const iv  = CryptoJS.enc.Utf8.parse(getIV())

  const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
    iv,
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
