export type Environment = 'prod' | 'staging' | 'dev'
export type AppStatus = 'ok' | 'fail' | 'timeout' | 'unknown'

export type AppRecord = {
  id: number
  name: string
  url: string
  environment: Environment

  status: AppStatus
  httpCode: number | null
  latencyMs: number | null
  checkedAt: string | null
  lastStatusChangeAt: string | null

  createdAt: string
  updatedAt: string
}

export type IncidentRecord = {
  id: number
  appId: number
  startedAt: string
  endedAt: string | null

  startStatus: Exclude<AppStatus, 'ok' | 'unknown'>
  startHttpCode: number | null
  startLatencyMs: number | null
  startError: string | null
  startResponseSnippet: string | null

  createdAt: string
  updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Request failed: ${res.status}`)
  }

  return (await res.json()) as T
}

export async function listApps(): Promise<AppRecord[]> {
  return request<AppRecord[]>('/api/apps')
}

export async function getApp(id: number): Promise<AppRecord> {
  return request<AppRecord>(`/api/apps/${id}`)
}

export async function getAppIncidents(id: number, year: number): Promise<{ year: number; incidents: IncidentRecord[] }> {
  return request<{ year: number; incidents: IncidentRecord[] }>(
    `/api/apps/${id}/incidents?year=${encodeURIComponent(String(year))}`,
  )
}

export async function createApp(input: {
  name: string
  url: string
  environment: Environment
}): Promise<AppRecord> {
  return request<AppRecord>('/api/apps', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateApp(
  id: number,
  patch: Partial<{ name: string; url: string; environment: Environment }>,
): Promise<AppRecord> {
  return request<AppRecord>(`/api/apps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function deleteApp(id: number): Promise<void> {
  const res = await fetch(`/api/apps/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Delete failed: ${res.status}`)
  }
}

export async function refreshApp(id: number): Promise<AppRecord> {
  return request<AppRecord>(`/api/apps/${id}/refresh`, {
    method: 'POST',
  })
}
