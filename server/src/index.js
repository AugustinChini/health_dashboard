import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'

import { openDb, seedIfEmpty } from './db.js'
import { createEmailClientFromEnv } from './email.js'
import { checkAndPersistApp, createPoller } from './poller.js'

dotenv.config()

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001
const DB_PATH = process.env.DB_PATH ?? './data.sqlite'
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS ? Number(process.env.POLL_INTERVAL_MS) : 60_000
const REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS
  ? Number(process.env.REQUEST_TIMEOUT_MS)
  : 10_000

const app = express()
app.use(express.json())
app.use(cors())

const db = await openDb(DB_PATH)
await seedIfEmpty(db)

const emailClient = createEmailClientFromEnv()

function normalizeAppRow(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    environment: row.environment,
    status: row.status,
    httpCode: row.httpCode,
    latencyMs: row.latencyMs,
    checkedAt: row.checkedAt,
    lastStatusChangeAt: row.lastStatusChangeAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function normalizeIncidentRow(row) {
  return {
    id: row.id,
    appId: row.appId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    startStatus: row.startStatus,
    startHttpCode: row.startHttpCode,
    startLatencyMs: row.startLatencyMs,
    startError: row.startError,
    startResponseSnippet: row.startResponseSnippet,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/apps', async (_req, res) => {
  const rows = await db.all('SELECT * FROM apps ORDER BY id DESC')
  res.json(rows.map(normalizeAppRow))
})

app.get('/api/apps/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  const row = await db.get('SELECT * FROM apps WHERE id = ?', [id])
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }

  res.json(normalizeAppRow(row))
})

app.get('/api/apps/:id/incidents', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  const yearRaw = req.query.year
  const year = yearRaw != null ? Number(yearRaw) : new Date().getUTCFullYear()
  if (!Number.isFinite(year) || year < 1970 || year > 9999) {
    res.status(400).json({ error: 'invalid year' })
    return
  }

  const appRow = await db.get('SELECT id FROM apps WHERE id = ?', [id])
  if (!appRow) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString()
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)).toISOString()

  const rows = await db.all(
    `SELECT * FROM incidents
     WHERE appId = ?
       AND (
         (startedAt >= ? AND startedAt < ?)
         OR (endedAt IS NOT NULL AND endedAt >= ? AND endedAt < ?)
         OR (startedAt < ? AND (endedAt IS NULL OR endedAt >= ?))
       )
     ORDER BY startedAt DESC`,
    [id, start, end, start, end, start, start],
  )

  res.json({ year, incidents: rows.map(normalizeIncidentRow) })
})

app.post('/api/apps', async (req, res) => {
  const { name, url, environment } = req.body ?? {}

  if (!name || !url || !environment) {
    res.status(400).json({ error: 'name, url, environment are required' })
    return
  }

  const now = new Date().toISOString()
  const result = await db.run(
    `INSERT INTO apps (name, url, environment, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)` ,
    [String(name), String(url), String(environment), now, now],
  )

  const row = await db.get('SELECT * FROM apps WHERE id = ?', [result.lastID])
  res.status(201).json(normalizeAppRow(row))
})

app.put('/api/apps/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  const existing = await db.get('SELECT * FROM apps WHERE id = ?', [id])
  if (!existing) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const patch = req.body ?? {}
  const name = patch.name != null ? String(patch.name) : existing.name
  const url = patch.url != null ? String(patch.url) : existing.url
  const environment = patch.environment != null ? String(patch.environment) : existing.environment

  const now = new Date().toISOString()

  await db.run(
    `UPDATE apps
     SET name = ?, url = ?, environment = ?, updatedAt = ?
     WHERE id = ?`,
    [name, url, environment, now, id],
  )

  const updated = await db.get('SELECT * FROM apps WHERE id = ?', [id])
  res.json(normalizeAppRow(updated))
})

app.delete('/api/apps/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  const existing = await db.get('SELECT id FROM apps WHERE id = ?', [id])
  if (!existing) {
    res.status(404).json({ error: 'not found' })
    return
  }

  await db.run('DELETE FROM apps WHERE id = ?', [id])
  res.status(204).end()
})

app.post('/api/apps/:id/refresh', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }

  const existing = await db.get('SELECT * FROM apps WHERE id = ?', [id])
  if (!existing) {
    res.status(404).json({ error: 'not found' })
    return
  }

  const row = await checkAndPersistApp({
    db,
    app: existing,
    timeoutMs: REQUEST_TIMEOUT_MS,
    emailClient,
    logger: console,
    notify: false,
  })

  res.json(normalizeAppRow(row))
})

const poller = createPoller({
  db,
  timeoutMs: REQUEST_TIMEOUT_MS,
  emailClient,
  logger: console,
})

let pollTimer = null
async function startPolling() {
  await poller.pollOnce()
  pollTimer = setInterval(() => {
    poller.pollOnce().catch((e) => console.error('poll_failed', e))
  }, POLL_INTERVAL_MS)
}

await startPolling()

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`)
  console.log(`db: ${DB_PATH}`)
  console.log(`poll interval: ${POLL_INTERVAL_MS}ms, timeout: ${REQUEST_TIMEOUT_MS}ms`)
  console.log(`email enabled: ${emailClient.enabled}`)
})
