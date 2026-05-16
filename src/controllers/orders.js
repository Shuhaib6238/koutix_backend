// ============================================================
// KOUTIX — Orders Controller
// ============================================================
const mongoose = require('mongoose')
const QRCode = require('qrcode')
const { Order, Product, Store, User } = require('../models')
const { createPaymentSession, createPaymentIntent, refundPayment } = require('../services/payment')
const { generateReceiptPDF } = require('../services/storage/receipt')
const { sendPushNotification } = require('../config/firebase')
const { success, successList, error, getPaginationParams, getDateRange, generateOrderNumber, calculateVAT } = require('../utils')
const logger = require('../config/logger')

// ── POST /orders — Create order with atomic stock deduction
async function createOrder(req, res, next) {
  const session = await mongoose.startSession()
  session.startTransaction()

  let committedOrder = null

  try {
    const { storeId, items, notes } = req.body
    const customer = req.user

    const store = await Store.findById(storeId).session(session)
    if (!store || store.status !== 'active') {
      await session.abortTransaction()
      return error(res, 'Store not found or inactive', 404)
    }

    if (!store.gatewayConfig) {
      await session.abortTransaction()
      return error(res, 'Store payment gateway is not configured. Please ask the store to set up their payment gateway.', 400)
    }
    if (!store.gatewayConfig.provider) {
      await session.abortTransaction()
      return error(res, 'Store payment gateway provider is not set. The store must choose Stripe or Checkout.com.', 400)
    }
    if (!store.gatewayConfig.secretKeyEncrypted) {
      await session.abortTransaction()
      return error(res, 'Store payment gateway secret key is missing. The store must reconfigure their payment gateway.', 400)
    }

    // Fetch & validate all products atomically
    const productIds = items.map((i) => i.productId)
    const products = await Product.find({
      _id:      { $in: productIds },
      storeId,
      isActive: true,
    }).session(session)

    if (products.length !== items.length) {
      await session.abortTransaction()
      return error(res, 'One or more products not found or unavailable', 400)
    }

    // Build order items + check stock
    const orderItems = []
    let rawSubtotal = 0

    for (const reqItem of items) {
      const product = products.find((p) => p._id.toString() === reqItem.productId)

      if (product.stock < reqItem.quantity) {
        await session.abortTransaction()
        return error(res, `Insufficient stock for "${product.name}"`, 400)
      }

      const subtotal = product.price * reqItem.quantity
      rawSubtotal += subtotal

      orderItems.push({
        productId:   product._id,
        productName: product.name,
        barcode:     product.barcode,
        price:       product.price,
        quantity:    reqItem.quantity,
        subtotal:    parseFloat(subtotal.toFixed(2)),
        imageUrl:    product.images[0],
      })
    }

    // Atomic stock deduction
    await Promise.all(
      orderItems.map((item) =>
        Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: -item.quantity } },
          { session, runValidators: true }
        )
      )
    )

    // VAT calculation
    const { subtotal, vatAmount, total } = calculateVAT(rawSubtotal, store.vatRate, true)

    // Create order
    const [order] = await Order.create(
      [{
        orderNumber:   generateOrderNumber(),
        storeId,
        storeName:     store.name,
        customerId:    customer._id,
        customerName:  customer.name,
        customerPhone: customer.phone || '',
        items:         orderItems,
        subtotal,
        vatAmount,
        vatRate:       store.vatRate,
        total,
        currency:      store.currency,
        status:        'payment_pending',
        paymentGateway: store.gatewayConfig.provider,
        notes,
      }],
      { session }
    )

    await Store.findByIdAndUpdate(storeId, { $inc: { totalOrders: 1 } }, { session })

    await session.commitTransaction()
    committedOrder = order

    // Create payment session (outside transaction). Failures here must not
    // abort the (already-committed) DB transaction.
    let paymentData
    try {
      if (store.gatewayConfig.provider === 'stripe') {
        paymentData = await createPaymentIntent({
          storeId,
          orderId:      order._id.toString(),
          orderNumber:  order.orderNumber,
          amount:       total,
          currency:     store.currency,
          customerEmail: customer.email,
          customerName: customer.name,
          description:  `Order ${order.orderNumber} — ${store.name}`,
        })
      } else {
        // Fallback for Checkout.com
        paymentData = await createPaymentSession({
          storeId,
          orderId:      order._id.toString(),
          orderNumber:  order.orderNumber,
          amount:       total,
          currency:     store.currency,
          customerName: customer.name,
          items:        orderItems, // Added items for itemized billing
          description:  `Order ${order.orderNumber} — ${store.name}`,
        })
      }
    } catch (gatewayErr) {
      // Roll the order back manually: mark cancelled and restore stock.
      logger.error(`[createOrder] gateway failure for ${order.orderNumber}: ${gatewayErr.message}`)
      await Order.findByIdAndUpdate(order._id, {
        status:       'cancelled',
        cancelReason: `Gateway error: ${gatewayErr.message}`,
      })
      await Promise.all(
        orderItems.map((item) =>
          Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } })
        )
      )
      return error(res, gatewayErr.message || 'Payment gateway unavailable', 502)
    }

    const sessionId = paymentData.paymentIntentId || paymentData.sessionId
    await Order.findByIdAndUpdate(order._id, { paymentSessionId: sessionId })

    logger.info(`Order created: ${order.orderNumber} ($${total}) for ${customer.email}`)

    // Return Stripe PaymentSheet params OR Checkout.com URL depending on gateway
    if (store.gatewayConfig.provider === 'stripe') {
      return success(res, {
        order,
        storeName:      store.name,
        clientSecret:   paymentData.clientSecret,
        ephemeralKey:   paymentData.ephemeralKey,
        customerId:     paymentData.customerId,
        publishableKey: paymentData.publishableKey,
      }, 201)
    } else {
      return success(res, {
        order,
        storeName:  store.name,
        paymentUrl: paymentData.paymentUrl,
        sessionId:  paymentData.sessionId,
        expiresAt:  paymentData.expiresAt,
      }, 201)
    }
  } catch (err) {
    if (!committedOrder && session.inTransaction()) {
      await session.abortTransaction()
    }
    next(err)
  } finally {
    session.endSession()
  }
}

// ── GET /orders ──────────────────────────────────────────
async function getOrders(req, res, next) {
  try {
    const { page, limit, skip, sort } = getPaginationParams(req.query)
    const { status, storeId } = req.query
    const user = req.user

    const filter = {}

    if (user.role === 'branchManager') {
      filter.storeId = user.storeId
    } else if (user.role === 'chainManager') {
      const stores = await Store.find({ chainId: user.chainId }).select('_id')
      filter.storeId = { $in: stores.map((s) => s._id) }
    } else if (user.role === 'customer') {
      filter.customerId = user._id
    }

    if (status)  {filter.status = status}
    if (storeId && user.role === 'superAdmin') {filter.storeId = storeId}

    const dateRange = getDateRange(req.query)
    if (dateRange) {filter.createdAt = dateRange}

    const [orders, total] = await Promise.all([
      Order.find(filter).sort(sort).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ])

    return successList(res, orders, { page, limit, total })
  } catch (err) { next(err) }
}

// ── GET /orders/:id ──────────────────────────────────────
async function getOrder(req, res, next) {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) {return error(res, 'Order not found', 404)}

    // IDOR: customers can only see their own orders
    if (req.user.role === 'customer' && order.customerId.toString() !== req.user._id.toString()) {
      return error(res, 'Access denied', 403)
    }

    return success(res, order)
  } catch (err) { next(err) }
}

// ── PATCH /orders/:id/status ─────────────────────────────
async function updateOrderStatus(req, res, next) {
  try {
    const { status } = req.body
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true })
    if (!order) {return error(res, 'Order not found', 404)}

    const customer = await User.findById(order.customerId)
    if (customer?.fcmToken) {
      const messages = {
        paid:       `Order ${order.orderNumber} payment confirmed! 🎉`,
        processing: `Your order ${order.orderNumber} is being prepared`,
        ready:      `Your order ${order.orderNumber} is ready for pickup!`,
        completed:  `Order ${order.orderNumber} completed. Thank you!`,
        cancelled:  `Order ${order.orderNumber} has been cancelled`,
      }
      if (messages[status]) {
        await sendPushNotification({
          token: customer.fcmToken,
          title: 'KOUTIX Order Update',
          body:  messages[status],
          data:  { orderId: order._id.toString(), status },
        })
      }
    }

    return success(res, order)
  } catch (err) { next(err) }
}

// ── POST /orders/:id/refund ──────────────────────────────
async function refundOrder(req, res, next) {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { reason } = req.body
    const order = await Order.findById(req.params.id)
    if (!order) {return error(res, 'Order not found', 404)}

    if (!['paid', 'completed'].includes(order.status)) {
      return error(res, 'Order cannot be refunded in its current status', 400)
    }
    if (!order.paymentReference) {return error(res, 'No payment reference found', 400)}

    await refundPayment(order.storeId.toString(), order.paymentReference, order.total, order.currency)

    // Restore stock
    await Promise.all(
      order.items.map((item) =>
        Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } }, { session })
      )
    )

    await Order.findByIdAndUpdate(
      order._id,
      { status: 'refunded', refundReason: reason, refundedAt: new Date() },
      { session }
    )

    await Store.findByIdAndUpdate(order.storeId, { $inc: { totalRevenue: -order.total } }, { session })

    await session.commitTransaction()

    logger.info(`Order refunded: ${order.orderNumber} — ${reason}`)
    return success(res, null, 200, 'Refund processed')
  } catch (err) {
    await session.abortTransaction()
    next(err)
  } finally {
    session.endSession()
  }
}

// ── GET /orders/:id/receipt ──────────────────────────────
async function getOrderReceipt(req, res, next) {
  try {
    const order = await Order.findById(req.params.id)
    if (!order) {return error(res, 'Order not found', 404)}

    let receiptUrl = order.receiptUrl
    let qrCode = order.qrCode

    if (!receiptUrl) {
      const { url } = await generateReceiptPDF(order)
      const qrData = JSON.stringify({ orderId: order._id, orderNumber: order.orderNumber, total: order.total })
      qrCode = await QRCode.toDataURL(qrData)
      await Order.findByIdAndUpdate(order._id, { receiptUrl: url, qrCode })
      receiptUrl = url
    }

    return success(res, { receiptUrl, qrCode })
  } catch (err) { next(err) }
}

module.exports = {
  createOrder, getOrders, getOrder,
  updateOrderStatus, refundOrder, getOrderReceipt,
}
