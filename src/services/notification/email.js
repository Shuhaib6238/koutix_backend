// ============================================================
// KOUTIX — Email Service (Resend — invites only)
// ============================================================
const { Resend } = require('resend')
const logger = require('../../config/logger')

let resend = null

function getResend() {
  if (!resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) {
      throw new Error('RESEND_API_KEY not set')
    }
    resend = new Resend(key)
  }
  return resend
}

// In development, Resend only allows sending from onboarding@resend.dev 
// until your custom domain (e.g., koutix.com) is verified in the dashboard.
const FROM = process.env.NODE_ENV === 'production'
  ? (process.env.RESEND_FROM_EMAIL || 'noreply@koutix.com')
  : 'onboarding@resend.dev'
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

// ── Invite email ──────────────────────────────────────────
async function sendInviteEmail({ to, storeName, role, inviteToken, inviterName, managerName }) {
  const inviteUrl = `${APP_URL}/activate?token=${inviteToken}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You're invited to KOUTIX</title>
</head>
<body style="margin:0;padding:0;background:#F8F9FA;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
          <tr>
            <td style="background:#050505;padding:32px 40px;text-align:center;">
              <span style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#FFFFFF;letter-spacing:-1px;">
                KOUT<span style="color:#00E5A0;">IX</span>
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                ${managerName ? `Hi ${managerName},` : "You've been invited to KOUTIX"}
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6B7280;line-height:1.6;">
                ${inviterName ? `<strong>${inviterName}</strong> has invited you` : "You've been invited"} to join
                ${storeName ? `<strong>${storeName}</strong>` : 'a store'} as
                <strong>${role}</strong>.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#00E5A0;border-radius:10px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#050505;text-decoration:none;">
                      Accept Invitation →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;color:#9CA3AF;">Or copy this link:</p>
              <p style="margin:0 0 32px;font-size:12px;color:#6B7280;word-break:break-all;background:#F3F4F6;border-radius:8px;padding:12px 16px;">
                ${inviteUrl}
              </p>
              <table cellpadding="0" cellspacing="0" style="background:#FEF3C7;border-radius:10px;border:1px solid #FDE68A;width:100%;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
                      ⏰ This invite link expires in <strong>72 hours</strong>.
                      If you did not expect this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:24px 40px;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;">
                KOUTIX — Retail SaaS Platform · <a href="${APP_URL}" style="color:#6B7280;">koutix.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const maxRetries = 2
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`\n${'='.repeat(60)}`)
        logger.info(`📧 INVITATION EMAIL (Attempt ${attempt}/${maxRetries})`)
        logger.info(`To: ${to}`)
        logger.info(`Role: ${role} at ${storeName}`)
        logger.info(`🔗 ${inviteUrl}`)
        logger.info(`${'='.repeat(60)}\n`)
        return
      }

      await getResend().emails.send({
        from: FROM,
        to,
        subject: `You're invited to ${storeName || 'KOUTIX'} as ${role}`,
        html,
      })

      logger.info(`✓ Invite email delivered to ${to} (${role} at ${storeName})`)
      return
    } catch (err) {
      lastError = err
      logger.warn(`Email attempt ${attempt}/${maxRetries} failed for ${to}: ${err.message}`)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  logger.error(`✗ Failed to send invite email to ${to} after ${maxRetries} attempts:`, lastError)
  throw lastError
}

// ── Generic transactional email ───────────────────────────
async function sendTransactionalEmail({ to, subject, html }) {
  try {
    await getResend().emails.send({ from: FROM, to, subject, html })
    logger.info(`Transactional email sent to ${to}: ${subject}`)
  } catch (err) {
    logger.error(`Failed to send email to ${to}:`, err)
    throw err
  }
}

module.exports = { sendInviteEmail, sendTransactionalEmail }
