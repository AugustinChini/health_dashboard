function withTimeout(ms, controller) {
  const id = setTimeout(() => controller.abort(), ms)
  return () => clearTimeout(id)
}

async function checkUrl(url, timeoutMs) {
  const controller = new AbortController()
  const clear = withTimeout(timeoutMs, controller)
  const startedAt = Date.now()

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
    })

    const latencyMs = Date.now() - startedAt
    return {
      status: res.status === 200 ? 'ok' : 'fail',
      httpCode: res.status,
      latencyMs,
      error: null,
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt

    if (err && typeof err === 'object' && err.name === 'AbortError') {
      return {
        status: 'timeout',
        httpCode: null,
        latencyMs: timeoutMs,
        error: 'timeout',
      }
    }

    return {
      status: 'fail',
      httpCode: null,
      latencyMs,
      error: 'network_error',
    }
  } finally {
    clear()
  }
}

export function createPoller({ db, timeoutMs, emailClient, logger }) {
  async function pollOnce() {
    const apps = await db.all('SELECT * FROM apps ORDER BY id DESC')
    const now = new Date().toISOString()

    for (const app of apps) {
      const prevStatus = app.status
      const result = await checkUrl(app.url, timeoutMs)

      const nextStatus = result.status
      const httpCode = result.httpCode
      const latencyMs = result.latencyMs

      const statusChanged = prevStatus !== nextStatus
      const lastStatusChangeAt = statusChanged ? now : app.lastStatusChangeAt

      await db.run(
        `UPDATE apps
         SET status = ?, httpCode = ?, latencyMs = ?, checkedAt = ?, lastStatusChangeAt = ?, updatedAt = ?
         WHERE id = ?`,
        [nextStatus, httpCode, latencyMs, now, lastStatusChangeAt, now, app.id],
      )

      if (prevStatus === 'ok' && nextStatus !== 'ok') {
        try {
          const updated = {
            ...app,
            status: nextStatus,
            httpCode,
            latencyMs,
            checkedAt: now,
            lastStatusChangeAt,
          }
          await emailClient.sendTransitionEmail({
            app: updated,
            fromStatus: prevStatus,
            toStatus: nextStatus,
          })
        } catch (e) {
          logger?.error?.('email_send_failed', e)
        }
      }
    }
  }

  return { pollOnce }
}
