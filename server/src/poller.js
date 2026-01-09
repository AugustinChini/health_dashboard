function withTimeout(ms, controller) {
  const id = setTimeout(() => controller.abort(), ms)
  return () => clearTimeout(id)
}

export async function checkUrl(url, timeoutMs) {
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
    const status = res.status === 200 ? 'ok' : 'fail'
    let responseSnippet = null

    if (status !== 'ok') {
      try {
        const text = await res.text()
        responseSnippet = text.slice(0, 2000)
      } catch {
        responseSnippet = null
      }
    }

    return {
      status,
      httpCode: res.status,
      latencyMs,
      error: null,
      responseSnippet,
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt

    if (err && typeof err === 'object' && err.name === 'AbortError') {
      return {
        status: 'timeout',
        httpCode: null,
        latencyMs: timeoutMs,
        error: 'timeout',
        responseSnippet: null,
      }
    }

    return {
      status: 'fail',
      httpCode: null,
      latencyMs,
      error: 'network_error',
      responseSnippet: null,
    }
  } finally {
    clear()
  }
}

export async function checkAndPersistApp({ db, app, timeoutMs, emailClient, logger, notify }) {
  const now = new Date().toISOString()
  const prevStatus = app.status

  const result = await checkUrl(app.url, timeoutMs)
  const nextStatus = result.status
  const httpCode = result.httpCode
  const latencyMs = result.latencyMs
  const error = result.error
  const responseSnippet = result.responseSnippet

  const statusChanged = prevStatus !== nextStatus
  const lastStatusChangeAt = statusChanged ? now : app.lastStatusChangeAt

  if (prevStatus === 'ok' && nextStatus !== 'ok') {
    await db.run(
      `INSERT INTO incidents (
        appId,
        startedAt,
        startStatus,
        startHttpCode,
        startLatencyMs,
        startError,
        startResponseSnippet,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        app.id,
        now,
        nextStatus,
        httpCode,
        latencyMs,
        error,
        responseSnippet,
        now,
        now,
      ],
    )
  }

  if (prevStatus !== 'ok' && nextStatus === 'ok') {
    const openIncident = await db.get(
      `SELECT id FROM incidents
       WHERE appId = ? AND endedAt IS NULL
       ORDER BY startedAt DESC
       LIMIT 1`,
      [app.id],
    )

    if (openIncident) {
      await db.run(
        `UPDATE incidents
         SET endedAt = ?, updatedAt = ?
         WHERE id = ?`,
        [now, now, openIncident.id],
      )
    }
  }

  await db.run(
    `UPDATE apps
     SET status = ?, httpCode = ?, latencyMs = ?, checkedAt = ?, lastStatusChangeAt = ?, updatedAt = ?
     WHERE id = ?`,
    [nextStatus, httpCode, latencyMs, now, lastStatusChangeAt, now, app.id],
  )

  if (notify && prevStatus === 'ok' && nextStatus !== 'ok') {
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

  const row = await db.get('SELECT * FROM apps WHERE id = ?', [app.id])
  return row
}

export function createPoller({ db, timeoutMs, emailClient, logger }) {
  async function pollOnce() {
    const apps = await db.all('SELECT * FROM apps ORDER BY id DESC')

    for (const app of apps) {
      await checkAndPersistApp({
        db,
        app,
        timeoutMs,
        emailClient,
        logger,
        notify: true,
      })
    }
  }

  return { pollOnce }
}
