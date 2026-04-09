// ============================================================
// KOUTIX — Base POS Adapter (abstract)
// ============================================================

/**
 * KoutixStandardEvent shape:
 * {
 *   branchId:       string,
 *   productId:      string,
 *   productName:    string,
 *   quantitySold:   number,
 *   unitPrice:      number,
 *   currency:       string,
 *   transactionId:  string,
 *   soldAt:         Date,
 * }
 */

class BaseAdapter {
  /**
   * @abstract
   * @type {string}
   */
  get posType() {
    throw new Error('posType must be implemented by subclass')
  }

  /**
   * Convert raw POS data to KoutixStandardEvent
   * @abstract
   * @param {object} rawData - raw data from POS system
   * @param {string} branchId - the Koutix branch/store ID
   * @returns {import('./BaseAdapter').KoutixStandardEvent}
   */
  convert(_rawData, _branchId) {
    throw new Error('convert() must be implemented by subclass')
  }

  /**
   * Convert an array of raw records
   * @param {Array} rawRecords
   * @param {string} branchId
   * @returns {Array}
   */
  convertMany(rawRecords, branchId) {
    const results = []
    const errors = []

    for (const record of rawRecords) {
      try {
        results.push(this.convert(record, branchId))
      } catch (err) {
        errors.push({ record, error: err.message })
      }
    }

    return { results, errors }
  }

  /**
   * Sanitize raw payload — strip PII fields before logging
   * @param {object} rawData
   * @returns {object}
   */
  sanitize(rawData) {
    if (!rawData || typeof rawData !== 'object') {
      return rawData
    }

    const PII_FIELDS = [
      'customerName', 'CustomerName', 'KUNNR', 'customer_email',
      'CustomerEmail', 'phone', 'Phone', 'address', 'Address',
      'creditCard', 'CreditCard', 'ssn', 'SSN',
    ]

    const sanitized = { ...rawData }
    for (const field of PII_FIELDS) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]'
      }
    }
    return sanitized
  }
}

module.exports = BaseAdapter
