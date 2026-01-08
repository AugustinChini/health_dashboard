import nodemailer from 'nodemailer'

function envBool(value, fallback) {
  if (value == null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

export function createEmailClientFromEnv() {
  const enabled = envBool(process.env.EMAIL_ENABLED, true)

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const secure = envBool(process.env.SMTP_SECURE, false)

  const from = process.env.EMAIL_FROM
  const to = process.env.EMAIL_TO

  if (!enabled) {
    return { enabled: false, sendTransitionEmail: async () => {} }
  }

  if (!host || !from || !to) {
    return {
      enabled: false,
      sendTransitionEmail: async () => {},
    }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  })

  async function sendTransitionEmail({ app, fromStatus, toStatus }) {
    const subject = `[Health] ${app.name} transitioned ${fromStatus.toUpperCase()} → ${toStatus.toUpperCase()}`

    const lines = [
      `App: ${app.name}`,
      `URL: ${app.url}`,
      `Environment: ${app.environment}`,
      `From: ${fromStatus}`,
      `To: ${toStatus}`,
      `HTTP: ${app.httpCode ?? '—'}`,
      `Latency: ${app.latencyMs ?? '—'} ms`,
      `Checked at: ${app.checkedAt ?? '—'}`,
    ]

    await transporter.sendMail({
      from,
      to,
      subject,
      text: lines.join('\n'),
    })
  }

  return { enabled: true, sendTransitionEmail }
}
