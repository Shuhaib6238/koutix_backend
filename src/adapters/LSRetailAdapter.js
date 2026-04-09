// ============================================================
// KOUTIX — LS Retail POS Adapter
// ============================================================
const BaseAdapter = require('./BaseAdapter')

class LSRetailAdapter extends BaseAdapter {
  get posType() {
    return 'ls_retail'
  }

  /**
   * Convert LS Retail API response record to KoutixStandardEvent.
   *
   * LS Retail raw field mapping:
   *  - TransactionID  → transactionId
   *  - ItemCode       → productId
   *  - ItemDescription → productName
   *  - SoldQty        → quantitySold
   *  - UnitAmt        → unitPrice
   *  - CurrencyCode   → currency
   *  - TransactionDate → soldAt
   *  - StoreNo        → IGNORED (branchId comes from the connection)
   */
  convert(rawData, branchId) {
    if (!rawData || !rawData.TransactionID) {
      throw new Error('Invalid LS Retail record: missing TransactionID')
    }

    return {
      branchId,
      productId:     String(rawData.ItemCode || ''),
      productName:   String(rawData.ItemDescription || 'Unknown'),
      quantitySold:  Number(rawData.SoldQty) || 0,
      unitPrice:     Number(rawData.UnitAmt) || 0,
      currency:      String(rawData.CurrencyCode || 'USD'),
      transactionId: String(rawData.TransactionID),
      soldAt:        rawData.TransactionDate
        ? new Date(rawData.TransactionDate)
        : new Date(),
    }
  }
}

module.exports = LSRetailAdapter
