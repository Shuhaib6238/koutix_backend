// ============================================================
// KOUTIX — SAP POS Adapter
// ============================================================
const BaseAdapter = require('./BaseAdapter')

class SAPAdapter extends BaseAdapter {
  get posType() {
    return 'sap'
  }

  /**
   * Convert SAP webhook payload to KoutixStandardEvent.
   *
   * SAP raw field mapping:
   *  - VBELN  → transactionId
   *  - MATNR  → productId (trim leading zeros)
   *  - ARKTX  → productName
   *  - MENGE  → quantitySold (parse to number)
   *  - NETWR  → unitPrice (parse to number)
   *  - WAERK  → currency
   *  - ERDAT + ERZET → soldAt (combine date + time)
   *  - WERKS  → IGNORED
   */
  convert(rawData, branchId) {
    if (!rawData || !rawData.VBELN) {
      throw new Error('Invalid SAP record: missing VBELN')
    }

    // Trim leading zeros from material number
    const productId = String(rawData.MATNR || '').replace(/^0+/, '') || '0'

    // Combine date (ERDAT: YYYYMMDD) + time (ERZET: HHMMSS)
    let soldAt = new Date()
    if (rawData.ERDAT) {
      const dateStr = String(rawData.ERDAT)
      const timeStr = String(rawData.ERZET || '000000').padStart(6, '0')
      const isoStr = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}` +
        `T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}Z`
      const parsed = new Date(isoStr)
      if (!isNaN(parsed.getTime())) {
        soldAt = parsed
      }
    }

    return {
      branchId,
      productId,
      productName:   String(rawData.ARKTX || 'Unknown'),
      quantitySold:  parseFloat(rawData.MENGE) || 0,
      unitPrice:     parseFloat(rawData.NETWR) || 0,
      currency:      String(rawData.WAERK || 'USD'),
      transactionId: String(rawData.VBELN),
      soldAt,
    }
  }
}

module.exports = SAPAdapter
