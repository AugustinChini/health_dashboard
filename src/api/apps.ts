export type Environment = "prod" | "staging" | "dev";
export type AppStatus = "ok" | "fail" | "timeout" | "unknown";
export type NotificationChannel = "email" | "push" | "both";

export type AppRecord = {
  id: number;
  name: string;
  url: string;
  environment: Environment;

  status: AppStatus;
  httpCode: number | null;
  latencyMs: number | null;
  checkedAt: string | null;
  lastStatusChangeAt: string | null;

  createdAt: string;
  updatedAt: string;
};

export type NotificationSettings = {
  channel: NotificationChannel;
  createdAt: string | null;
  updatedAt: string | null;
};

export type IncidentRecord = {
  id: number;
  appId: number;
  startedAt: string;
  endedAt: string | null;

  startStatus: Exclude<AppStatus, "ok" | "unknown">;
  startHttpCode: number | null;
  startLatencyMs: number | null;
  startError: string | null;
  startResponseSnippet: string | null;

  createdAt: string;
  updatedAt: string;
};

const AUTH_TOKEN_KEY = "auth_token";

export function getStoredAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function resolvePath(path: string): string {
  if (import.meta.env.PROD && path.startsWith("/api")) {
    return path.replace(/^\/api/, "https://achini.fr/api-monit");
  }
  return path;
}

function authHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolvePath(path);
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (res.status === 401) {
    clearStoredAuthToken();
    window.dispatchEvent(new Event("auth:logout"));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function login(pin: string): Promise<{ token: string }> {
  const result = await request<{ token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
  setStoredAuthToken(result.token);
  return result;
}

export async function verifyAuthToken(): Promise<boolean> {
  try {
    await request<{ ok: true }>("/api/auth/verify");
    return true;
  } catch {
    return false;
  }
}

export async function listApps(): Promise<AppRecord[]> {
  return request<AppRecord[]>("/api/apps");
}

export async function getApp(id: number): Promise<AppRecord> {
  return request<AppRecord>(`/api/apps/${id}`);
}

export async function getAppIncidents(
  id: number,
  year: number,
): Promise<{ year: number; incidents: IncidentRecord[] }> {
  return request<{ year: number; incidents: IncidentRecord[] }>(
    `/api/apps/${id}/incidents?year=${encodeURIComponent(String(year))}`,
  );
}

export async function createApp(input: {
  name: string;
  url: string;
  environment: Environment;
}): Promise<AppRecord> {
  return request<AppRecord>("/api/apps", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateApp(
  id: number,
  patch: Partial<{ name: string; url: string; environment: Environment }>,
): Promise<AppRecord> {
  return request<AppRecord>(`/api/apps/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function deleteApp(id: number): Promise<void> {
  const res = await fetch(resolvePath(`/api/apps/${id}`), {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (res.status === 401) {
    clearStoredAuthToken();
    window.dispatchEvent(new Event("auth:logout"));
  }
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Delete failed: ${res.status}`);
  }
}

export async function refreshApp(id: number): Promise<AppRecord> {
  return request<AppRecord>(`/api/apps/${id}/refresh`, {
    method: "POST",
  });
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return request<NotificationSettings>("/api/notification-settings");
}

export async function updateNotificationSettings(
  channel: NotificationChannel,
): Promise<NotificationSettings> {
  return request<NotificationSettings>("/api/notification-settings", {
    method: "PUT",
    body: JSON.stringify({ channel }),
  });
}

export type PushTokenRecord = {
  id: number;
  token: string;
  deviceLabel: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export async function listPushTokens(): Promise<PushTokenRecord[]> {
  return request<PushTokenRecord[]>("/api/notification-push/tokens");
}

export async function deletePushToken(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/notification-push/tokens/${id}`, {
    method: "DELETE",
  });
}

export async function registerPushToken(input: {
  token: string;
  deviceLabel?: string;
}): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/notification-push/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function unregisterPushToken(
  token: string,
): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/notification-push/unregister", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
