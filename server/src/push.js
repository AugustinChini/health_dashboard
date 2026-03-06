import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function envBool(value, fallback) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parsePrivateKey(value) {
  if (!value) return null;
  return String(value).replace(/\\n/g, "\n");
}

function toStringData(data) {
  if (!data) return undefined;

  const out = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}

export function createPushClientFromEnv({ db }) {
  const enabled = envBool(process.env.PUSH_ENABLED, true);

  if (!enabled) {
    console.warn("[push] disabled: PUSH_ENABLED is false");
    return {
      enabled: false,
      sendTransitionPush: async () => {},
      deactivateTokens: async () => {},
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[push] disabled: missing Firebase Admin env vars", {
      hasProjectId: Boolean(projectId),
      hasClientEmail: Boolean(clientEmail),
      hasPrivateKey: Boolean(privateKey),
    });
    return {
      enabled: false,
      sendTransitionPush: async () => {},
      deactivateTokens: async () => {},
    };
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

  const messaging = getMessaging(app);
  console.log("[push] initialized", {
    projectId,
    clickUrl: process.env.PUSH_CLICK_URL || process.env.PUBLIC_APP_URL || "/",
  });

  async function deactivateTokens(tokens) {
    if (!tokens.length) return;

    const now = new Date().toISOString();
    const placeholders = tokens.map(() => "?").join(", ");
    await db.run(
      `UPDATE push_tokens
       SET isActive = 0, updatedAt = ?
       WHERE token IN (${placeholders})`,
      [now, ...tokens],
    );

    console.warn("[push] deactivated invalid tokens", {
      count: tokens.length,
      sample: tokens.slice(0, 3),
    });
  }

  async function sendTransitionPush({
    app: monitoredApp,
    fromStatus,
    toStatus,
  }) {
    const rows = await db.all(
      "SELECT token FROM push_tokens WHERE isActive = 1",
    );
    const tokens = rows.map((r) => String(r.token)).filter(Boolean);

    if (!tokens.length) {
      console.warn("[push] skip send: no active tokens", {
        appId: monitoredApp.id,
        appName: monitoredApp.name,
      });
      return;
    }

    console.log("[push] send start", {
      appId: monitoredApp.id,
      appName: monitoredApp.name,
      fromStatus,
      toStatus,
      tokenCount: tokens.length,
    });

    const title = `[Health] ${monitoredApp.name}`;
    const body = `${fromStatus.toUpperCase()} -> ${toStatus.toUpperCase()} (${monitoredApp.environment})`;

    let res;
    try {
      res = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body,
        },
        data: toStringData({
          appId: monitoredApp.id,
          appName: monitoredApp.name,
          appUrl: monitoredApp.url,
          environment: monitoredApp.environment,
          fromStatus,
          toStatus,
          checkedAt: monitoredApp.checkedAt,
          httpCode: monitoredApp.httpCode,
          latencyMs: monitoredApp.latencyMs,
        }),
        webpush: {
          fcmOptions: {
            link:
              process.env.PUSH_CLICK_URL || process.env.PUBLIC_APP_URL || "/",
          },
        },
      });
    } catch (error) {
      console.error("[push] sendEachForMulticast failed", {
        appId: monitoredApp.id,
        appName: monitoredApp.name,
        tokenCount: tokens.length,
        error,
      });
      throw error;
    }

    console.log("[push] send done", {
      appId: monitoredApp.id,
      appName: monitoredApp.name,
      successCount: res.successCount,
      failureCount: res.failureCount,
    });

    if (res.failureCount > 0) {
      const invalidTokens = [];

      res.responses.forEach((entry, index) => {
        if (entry.success) return;

        const code = entry.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalidTokens.push(tokens[index]);
          return;
        }

        console.error("[push] token_send_failed", {
          token: tokens[index],
          code,
          error: entry.error,
        });
      });

      if (invalidTokens.length) {
        await deactivateTokens(invalidTokens);
      }
    }
  }

  return {
    enabled: true,
    sendTransitionPush,
    deactivateTokens,
  };
}
