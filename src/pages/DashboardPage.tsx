import { useMemo, useState } from 'react'

import type { AppRecord, AppStatus } from '../api/apps'
import { useApps } from '../hooks/useApps'

function formatRelativeTime(iso: string | null) {
  if (!iso) return '—'

  const deltaMs = Date.now() - new Date(iso).getTime()
  const s = Math.max(0, Math.floor(deltaMs / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function statusLabel(status: AppStatus) {
  if (status === 'ok') return 'OK'
  if (status === 'fail') return 'FAIL'
  if (status === 'timeout') return 'TIMEOUT'
  return 'UNKNOWN'
}

function statusTone(status: AppStatus) {
  if (status === 'ok') return 'good'
  if (status === 'fail') return 'bad'
  if (status === 'timeout') return 'warn'
  return 'warn'
}

export default function DashboardPage() {
  const { apps, loading, error } = useApps({ refreshIntervalMs: 10_000 })
  const [query, setQuery] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter((app) => {
      const matchesQuery =
        q.length === 0 ||
        app.name.toLowerCase().includes(q) ||
        app.url.toLowerCase().includes(q)
      const matchesIssue = !onlyIssues || app.status !== 'ok'
      return matchesQuery && matchesIssue
    })
  }, [apps, onlyIssues, query])

  const summary = useMemo(() => {
    return apps.reduce(
      (acc, app) => {
        acc.total += 1
        if (app.status === 'ok') acc.ok += 1
        if (app.status === 'fail') acc.fail += 1
        if (app.status === 'timeout') acc.timeout += 1
        return acc
      },
      { total: 0, ok: 0, fail: 0, timeout: 0 },
    )
  }, [apps])

  return (
    <div>
      <section className="pageHeader">
        <div>
          <div className="pageHeader__title">Monitoring</div>
          <div className="pageHeader__subtitle">Statuses are refreshed by the server every minute.</div>
        </div>

        <div className="pageHeader__actions">
          <div className="search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps or URLs"
              aria-label="Search applications"
            />
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
            />
            <span>Only issues</span>
          </label>
        </div>
      </section>

      <section className="summary">
        <div className="summary__card">
          <div className="summary__label">Total</div>
          <div className="summary__value">{summary.total}</div>
        </div>
        <div className="summary__card tone-good">
          <div className="summary__label">OK</div>
          <div className="summary__value">{summary.ok}</div>
        </div>
        <div className="summary__card tone-bad">
          <div className="summary__label">Fail</div>
          <div className="summary__value">{summary.fail}</div>
        </div>
        <div className="summary__card tone-warn">
          <div className="summary__label">Timeout</div>
          <div className="summary__value">{summary.timeout}</div>
        </div>
      </section>

      <section className="list">
        <div className="list__header">
          <div className="list__title">Applications</div>
          <div className="list__meta">
            {error ? (
              <span>{error}</span>
            ) : (
              <>
                Showing <strong>{filtered.length}</strong> of <strong>{apps.length}</strong>
                {loading ? ' (loading...)' : ''}
              </>
            )}
          </div>
        </div>

        <div className="grid">
          {filtered.map((app: AppRecord) => (
            <article key={app.id} className="appCard">
              <div className="appCard__top">
                <div className="appCard__name">{app.name}</div>
                <div className={`badge badge--${statusTone(app.status)}`}>{statusLabel(app.status)}</div>
              </div>

              <div className="appCard__url" title={app.url}>
                {app.url}
              </div>

              <div className="appCard__meta">
                <div className="metaItem">
                  <div className="metaItem__label">Env</div>
                  <div className="metaItem__value">{app.environment}</div>
                </div>
                <div className="metaItem">
                  <div className="metaItem__label">HTTP</div>
                  <div className="metaItem__value">{app.httpCode ?? '—'}</div>
                </div>
                <div className="metaItem">
                  <div className="metaItem__label">Latency</div>
                  <div className="metaItem__value">{app.latencyMs != null ? `${app.latencyMs} ms` : '—'}</div>
                </div>
                <div className="metaItem">
                  <div className="metaItem__label">Checked</div>
                  <div className="metaItem__value">{formatRelativeTime(app.checkedAt)}</div>
                </div>
              </div>

              <div className="appCard__footer">
                <button className="btn" type="button" disabled>
                  Details
                </button>
                <button className="btn btn--ghost" type="button" disabled>
                  Retry
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
