// ============================================================
// KOUTIX — Payments Controller
// Verifies a gateway session after the WebView callback.
// ============================================================
const mongoose = require('mongoose')
const { Order } = require('../models')
const { verifyPaymentSession } = require('../services/payment')
const { success, error } = require('../utils')
const logger = require('../config/logger')

async function verifyPayment(req, res, next) {
  try {
    const { paymentId, orderId, storeId } = req.body
    if (!paymentId && !orderId) {
      return error(res, 'paymentId or orderId is required', 400)
    }

    const conditions = []
    if (orderId && mongoose.isValidObjectId(orderId)) {
      conditions.push({ _id: orderId })
    }
    if (paymentId) {
      conditions.push({ paymentSessionId: paymentId })
      conditions.push({ paymentReference: paymentId })
    }

    const order = await Order.findOne({ $or: conditions })
    if (!order) return error(res, 'Order not found', 404)

    if (storeId && order.storeId.toString() !== storeId) {
      return error(res, 'Order does not belong to this store', 400)
    }
    if (
      req.userRole === 'customer' &&
      order.customerId.toString() !== req.user._id.toString()
    ) {
      return error(res, 'Access denied', 403)
    }

    if (order.status === 'payment_pending' && paymentId) {
      try {
        const result = await verifyPaymentSession(order.storeId.toString(), paymentId)
        if (result.paid) {
          await Order.findByIdAndUpdate(order._id, {
            status:           'paid',
            paymentReference: result.paymentReference,
            paidAt:           new Date(),
          })
          order.status           = 'paid'
          order.paymentReference = result.paymentReference
          order.paidAt           = new Date()
        }
      } catch (err) {
        logger.warn(`[payment-verify] gateway lookup failed for order ${order._id}: ${err.message}`)
      }
    }

    return success(res, {
      orderId:     order._id,
      orderNumber: order.orderNumber,
      status:      order.status,
      storeId:     order.storeId,
      storeName:   order.storeName,
      items:       order.items,
      subtotal:    order.subtotal,
      vat:         order.vatAmount,
      total:       order.total,
      currency:    order.currency,
      paidAt:      order.paidAt,
      paymentId:   paymentId || order.paymentSessionId,
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { verifyPayment }
