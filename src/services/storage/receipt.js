// ============================================================
// KOUTIX — Receipt PDF Generator + S3 Upload
// ============================================================
const PDFDocument = require('pdfkit')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const logger = require('../../config/logger')

// ── S3 client ─────────────────────────────────────────────
let s3 = null

function getS3() {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return s3
}

const BUCKET = process.env.S3_BUCKET_NAME || 'koutix-media'
const CF_URL  = process.env.CLOUDFRONT_BASE_URL || ''

// ── Generate receipt PDF + upload ────────────────────────
async function generateReceiptPDF(order) {
  try {
    const pdfBuffer = await buildReceiptPDF(order)
    const key = `receipts/${order.storeId}/${order._id}.pdf`

    await getS3().send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        orderId:     order._id.toString(),
        orderNumber: order.orderNumber,
      },
    }))

    const url = CF_URL
      ? `${CF_URL}/${key}`
      : `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`

    return { url }
  } catch (err) {
    logger.error('Receipt PDF generation/upload failed:', err)
    throw err
  }
}

// ── Get signed URL for download ───────────────────────────
async function getReceiptSignedUrl(orderId, storeId) {
  const key     = `receipts/${storeId}/${orderId}.pdf`
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getS3(), command, { expiresIn: 3600 })
}

// ── Upload any buffer to S3 ───────────────────────────────
async function uploadToS3(buffer, key, contentType) {
  await getS3().send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }))

  return CF_URL
    ? `${CF_URL}/${key}`
    : `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
}

// ── Build PDF with pdfkit ─────────────────────────────────
function buildReceiptPDF(order) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: [300, 600] })
    const chunks = []

    doc.on('data',  (chunk) => chunks.push(chunk))
    doc.on('end',   () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const BRAND   = '#00E5A0'
    const DARK    = '#050505'
    const GRAY    = '#6B7280'
    const DIVIDER = '#E5E7EB'

    // Header
    doc.rect(0, 0, 300, 80).fill(DARK)
    doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
       .text('KOUTIX', 50, 20)
    doc.fillColor(BRAND).fontSize(8).font('Helvetica')
       .text('SCAN & GO RECEIPT', 50, 44)
    doc.fillColor('#FFFFFF').fontSize(10)
       .text(order.storeName, 50, 58, { width: 200, ellipsis: true })

    // Order info
    doc.fillColor(DARK).fontSize(11).font('Helvetica-Bold')
       .text(`Order ${order.orderNumber}`, 50, 100)
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text(new Date(order.createdAt).toLocaleString(), 50, 116)

    // Status badge
    const statusColor = ['paid','completed'].includes(order.status) ? BRAND : '#EF4444'
    doc.roundedRect(50, 130, 60, 18, 4).fill(statusColor)
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
       .text(order.status.toUpperCase(), 55, 135)

    // Divider
    doc.moveTo(50, 160).lineTo(250, 160).strokeColor(DIVIDER).lineWidth(0.5).stroke()

    // Items
    doc.fillColor(DARK).fontSize(9).font('Helvetica-Bold').text('ITEMS', 50, 170)

    let y = 186
    for (const item of order.items) {
      const name = item.productName.length > 22
        ? item.productName.slice(0, 22) + '…'
        : item.productName

      doc.fillColor(DARK).fontSize(9).font('Helvetica')
         .text(name, 50, y)
         .text(`x${item.quantity}`, 180, y)
         .text(`$${item.subtotal.toFixed(2)}`, 220, y, { align: 'right', width: 30 })
      y += 18
    }

    // Divider
    doc.moveTo(50, y + 6).lineTo(250, y + 6).strokeColor(DIVIDER).lineWidth(0.5).stroke()
    y += 18

    // Totals
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text('Subtotal',              130, y,      { width: 70, align: 'right' })
       .text(`$${order.subtotal.toFixed(2)}`,  220, y,  { align: 'right', width: 30 })
    y += 16
    doc.text(`VAT (${order.vatRate}%)`, 130, y,    { width: 70, align: 'right' })
       .text(`$${order.vatAmount.toFixed(2)}`, 220, y, { align: 'right', width: 30 })
    y += 4

    doc.moveTo(50, y + 6).lineTo(250, y + 6).strokeColor(DARK).lineWidth(1).stroke()
    y += 18

    doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold')
       .text('TOTAL', 50, y)
       .text(`$${order.total.toFixed(2)} ${order.currency}`, 180, y, { align: 'right', width: 70 })

    // Payment info
    y += 28
    doc.moveTo(50, y).lineTo(250, y).strokeColor(DIVIDER).lineWidth(0.5).stroke()
    y += 12
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text(`Payment: ${order.paymentGateway === 'stripe' ? 'Stripe' : 'Checkout.com'}`, 50, y)
    if (order.paymentReference) {
      y += 12
      doc.text(`Ref: ${order.paymentReference}`, 50, y)
    }
    if (order.paidAt) {
      y += 12
      doc.text(`Paid: ${new Date(order.paidAt).toLocaleString()}`, 50, y)
    }

    // Footer
    y += 28
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Thank you for shopping with KOUTIX', 50, y, { align: 'center', width: 200 })
    y += 16
    doc.fillColor(BRAND).fontSize(8)
       .text('koutix.com', 50, y, { align: 'center', width: 200 })

    doc.end()
  })
}

module.exports = { generateReceiptPDF, getReceiptSignedUrl, uploadToS3 }
