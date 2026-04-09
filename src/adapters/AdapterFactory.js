// ============================================================
// KOUTIX — Adapter Factory
// ============================================================
const LSRetailAdapter = require('./LSRetailAdapter')
const SAPAdapter      = require('./SAPAdapter')

const ADAPTERS = {
  ls_retail: LSRetailAdapter,
  sap:       SAPAdapter,
}

class AdapterFactory {
  /**
   * Returns the correct adapter instance for the given POS type.
   * @param {string} posType - 'ls_retail' | 'sap'
   * @returns {import('./BaseAdapter')}
   */
  static getAdapter(posType) {
    const AdapterClass = ADAPTERS[posType]
    if (!AdapterClass) {
      throw new Error(`Unsupported POS type: ${posType}`)
    }
    return new AdapterClass()
  }

  /**
   * Check if a POS type is supported.
   * @param {string} posType
   * @returns {boolean}
   */
  static isSupported(posType) {
    return posType in ADAPTERS
  }

  /**
   * List all supported POS types.
   * @returns {string[]}
   */
  static supportedTypes() {
    return Object.keys(ADAPTERS)
  }
}

module.exports = AdapterFactory
