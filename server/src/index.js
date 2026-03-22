import crypto from "node:crypto";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";

import { openDb, seedIfEmpty } from "./db.js";
import { createEmailClientFromEnv } from "./email.js";
import { createPushClientFromEnv } from "./push.js";
import { checkAndPersistApp, createPoller } from "./poller.js";

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const DB_PATH = process.env.DB_PATH ?? "./data.sqlite";
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS
  ? Number(process.env.POLL_INTERVAL_MS)
  : 60_000;
const REQUEST_TIMEOUT_MS = process.env.REQUEST_TIMEOUT_MS
  ? Number(process.env.REQUEST_TIMEOUT_MS)
  : 10_000;

const PIN_CODE = process.env.PIN_CODE || "";
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const JWT_EXPIRY = "30d";

if (!PIN_CODE) {
  console.warn("[auth] WARNING: PIN_CODE is not set — auth endpoints will reject all logins");
}

const app = express();
app.use(express.json());
app.use(cors());

const db = await openDb(DB_PATH);
await seedIfEmpty(db);

const emailClient = createEmailClientFromEnv();
const pushClient = createPushClientFromEnv({ db });

const notificationChannels = new Set(["email", "push", "both"]);

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
  };
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
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ── Auth ────────────────────────────────────────────────────────────────

app.post("/auth/login", (req, res) => {
  const pin = String(req.body?.pin || "").trim();

  if (!PIN_CODE) {
    res.status(500).json({ error: "PIN_CODE is not configured on the server" });
    return;
  }

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: "Pin must be exactly 4 digits" });
    return;
  }

  if (!crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(PIN_CODE))) {
    res.status(401).json({ error: "Invalid pin code" });
    return;
  }

  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  res.json({ token });
});

app.get("/auth/verify", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// ── Auth middleware (protects everything below) ─────────────────────────

app.use((req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

// ── Protected routes ────────────────────────────────────────────────────

app.get("/notification-settings", async (_req, res) => {
  const row = await db.get(
    "SELECT channel, createdAt, updatedAt FROM notification_settings WHERE id = 1",
  );
  res.json({
    channel: row?.channel || "email",
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
});

app.put("/notification-settings", async (req, res) => {
  const channelRaw = req.body?.channel;
  const channel = String(channelRaw || "")
    .trim()
    .toLowerCase();

  if (!notificationChannels.has(channel)) {
    res
      .status(400)
      .json({ error: "channel must be one of: email, push, both" });
    return;
  }

  const now = new Date().toISOString();
  await db.run(
    `UPDATE notification_settings
     SET channel = ?, updatedAt = ?
     WHERE id = 1`,
    [channel, now],
  );

  const row = await db.get(
    "SELECT channel, createdAt, updatedAt FROM notification_settings WHERE id = 1",
  );
  res.json({
    channel: row?.channel || channel,
    createdAt: row?.createdAt ?? null,
    updatedAt: row?.updatedAt ?? now,
  });
});

app.post("/notification-push/register", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const deviceLabelRaw = req.body?.deviceLabel;
  const deviceLabel =
    deviceLabelRaw == null || String(deviceLabelRaw).trim().length === 0
      ? null
      : String(deviceLabelRaw).trim();

  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO push_tokens (token, deviceLabel, isActive, createdAt, updatedAt, lastUsedAt)
     VALUES (?, ?, 1, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET
       deviceLabel = excluded.deviceLabel,
       isActive = 1,
       updatedAt = excluded.updatedAt,
       lastUsedAt = excluded.lastUsedAt`,
    [token, deviceLabel, now, now, now],
  );

  res.status(201).json({ ok: true });
});

app.post("/notification-push/unregister", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  await pushClient.deactivateTokens([token]);
  res.status(200).json({ ok: true });
});

app.get("/notification-push/tokens", async (_req, res) => {
  const rows = await db.all(
    "SELECT id, token, deviceLabel, createdAt, updatedAt, lastUsedAt FROM push_tokens WHERE isActive = 1 ORDER BY createdAt DESC",
  );
  res.json(rows);
});

app.delete("/notification-push/tokens/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const row = await db.get(
    "SELECT token FROM push_tokens WHERE id = ? AND isActive = 1",
    [id],
  );
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }

  await pushClient.deactivateTokens([row.token]);
  res.status(200).json({ ok: true });
});

app.get("/apps", async (_req, res) => {
  const rows = await db.all("SELECT * FROM apps ORDER BY id DESC");
  res.json(rows.map(normalizeAppRow));
});

app.get("/apps/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const row = await db.get("SELECT * FROM apps WHERE id = ?", [id]);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }

  res.json(normalizeAppRow(row));
});

app.get("/apps/:id/incidents", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const yearRaw = req.query.year;
  const year = yearRaw != null ? Number(yearRaw) : new Date().getUTCFullYear();
  if (!Number.isFinite(year) || year < 1970 || year > 9999) {
    res.status(400).json({ error: "invalid year" });
    return;
  }

  const appRow = await db.get("SELECT id FROM apps WHERE id = ?", [id]);
  if (!appRow) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)).toISOString();

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
  );

  res.json({ year, incidents: rows.map(normalizeIncidentRow) });
});

app.post("/apps", async (req, res) => {
  const { name, url, environment } = req.body ?? {};

  if (!name || !url || !environment) {
    res.status(400).json({ error: "name, url, environment are required" });
    return;
  }

  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO apps (name, url, environment, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [String(name), String(url), String(environment), now, now],
  );

  const row = await db.get("SELECT * FROM apps WHERE id = ?", [result.lastID]);
  res.status(201).json(normalizeAppRow(row));
});

app.put("/apps/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const existing = await db.get("SELECT * FROM apps WHERE id = ?", [id]);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const patch = req.body ?? {};
  const name = patch.name != null ? String(patch.name) : existing.name;
  const url = patch.url != null ? String(patch.url) : existing.url;
  const environment =
    patch.environment != null
      ? String(patch.environment)
      : existing.environment;

  const now = new Date().toISOString();

  await db.run(
    `UPDATE apps
     SET name = ?, url = ?, environment = ?, updatedAt = ?
     WHERE id = ?`,
    [name, url, environment, now, id],
  );

  const updated = await db.get("SELECT * FROM apps WHERE id = ?", [id]);
  res.json(normalizeAppRow(updated));
});

app.delete("/apps/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const existing = await db.get("SELECT id FROM apps WHERE id = ?", [id]);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }

  await db.run("DELETE FROM apps WHERE id = ?", [id]);
  res.status(204).end();
});

app.post("/apps/:id/refresh", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const existing = await db.get("SELECT * FROM apps WHERE id = ?", [id]);
  if (!existing) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const row = await checkAndPersistApp({
    db,
    app: existing,
    timeoutMs: REQUEST_TIMEOUT_MS,
    emailClient,
    pushClient,
    logger: console,
    notify: false,
  });

  res.json(normalizeAppRow(row));
});

const poller = createPoller({
  db,
  timeoutMs: REQUEST_TIMEOUT_MS,
  emailClient,
  pushClient,
  logger: console,
});

let pollTimer = null;
async function startPolling() {
  await poller.pollOnce();
  pollTimer = setInterval(() => {
    poller.pollOnce().catch((e) => console.error("poll_failed", e));
  }, POLL_INTERVAL_MS);
}

await startPolling();

app.listen(PORT, () => {
  console.log(`server listening on http://localhost:${PORT}`);
  console.log(`db: ${DB_PATH}`);
  console.log(
    `poll interval: ${POLL_INTERVAL_MS}ms, timeout: ${REQUEST_TIMEOUT_MS}ms`,
  );
  console.log(`email enabled: ${emailClient.enabled}`);
  console.log(`push enabled: ${pushClient.enabled}`);
});
