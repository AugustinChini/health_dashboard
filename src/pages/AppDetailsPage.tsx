import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import type { AppRecord, IncidentRecord } from '../api/apps'
import { getApp, getAppIncidents } from '../api/apps'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString()
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const h = totalHours % 24
  const days = Math.floor(totalHours / 24)

  if (days > 0) return `${days}d ${h}h ${m}m`
  if (totalHours > 0) return `${totalHours}h ${m}m ${s}s`
  if (totalMinutes > 0) return `${totalMinutes}m ${s}s`
  return `${s}s`
}

function statusTone(status: AppRecord['status']) {
  if (status === 'ok') return 'good'
  if (status === 'fail') return 'bad'
  return 'warn'
}

function downtimeWithinYear(incident: IncidentRecord, year: number) {
  const yearStart = Date.UTC(year, 0, 1, 0, 0, 0)
  const yearEnd = Date.UTC(year + 1, 0, 1, 0, 0, 0)

  const start = Math.max(yearStart, new Date(incident.startedAt).getTime())
  const end = Math.min(
    yearEnd,
    incident.endedAt ? new Date(incident.endedAt).getTime() : Date.now(),
  )

  return Math.max(0, end - start)
}

export default function AppDetailsPage() {
  const navigate = useNavigate()
  const params = useParams()
  const appId = params.id ? Number(params.id) : NaN

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [app, setApp] = useState<AppRecord | null>(null)
  const [incidents, setIncidents] = useState<IncidentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(appId)) {
      setError('Invalid app id')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([getApp(appId), getAppIncidents(appId, year)])
      .then(([appRes, incidentsRes]) => {
        if (cancelled) return
        setApp(appRes)
        setIncidents(incidentsRes.incidents)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [appId, year])

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear()
    return Array.from({ length: 6 }, (_, i) => now - i)
  }, [])

  const totalDowntimeMs = useMemo(() => {
    return incidents.reduce((acc, inc) => acc + downtimeWithinYear(inc, year), 0)
  }, [incidents, year])

  const openIncident = useMemo(() => {
    return incidents.find((i) => i.endedAt == null) ?? null
  }, [incidents])

  return (
    <div>
      <section className="pageHeader">
        <div>
          <div className="pageHeader__title">Details</div>
          <div className="pageHeader__subtitle">
            {app ? (
              <>
                <span className="detailsTitle">{app.name}</span>
                <span className="detailsSep">—</span>
                <span className="detailsUrl" title={app.url}>
                  {app.url}
                </span>
              </>
            ) : (
              'Incident timeline'
            )}
          </div>
        </div>

        <div className="pageHeader__actions">
          <button className="btn" type="button" onClick={() => navigate(-1)}>
            Back
          </button>

          <label className="field">
            <span className="field__label">Year</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="list__meta">{error}</div> : null}

      <section className="summary">
        <div className="summary__card">
          <div className="summary__label">Incidents ({year})</div>
          <div className="summary__value">{incidents.length}</div>
        </div>
        <div className="summary__card tone-warn">
          <div className="summary__label">Downtime ({year})</div>
          <div className="summary__value">{formatDuration(totalDowntimeMs)}</div>
        </div>
        <div className={`summary__card tone-${app ? statusTone(app.status) : 'warn'}`}>
          <div className="summary__label">Current status</div>
          <div className="summary__value">{app ? app.status.toUpperCase() : loading ? '…' : '—'}</div>
        </div>
        <div className="summary__card">
          <div className="summary__label">Currently down</div>
          <div className="summary__value">
            {openIncident
              ? formatDuration(Date.now() - new Date(openIncident.startedAt).getTime())
              : '—'}
          </div>
        </div>
      </section>

      <section className="list">
        <div className="list__header">
          <div className="list__title">Timeline</div>
          <div className="list__meta">{loading ? 'Loading…' : 'Last incidents, most recent first'}</div>
        </div>

        <div className="stack">
          {incidents.map((inc) => {
            const startedAt = new Date(inc.startedAt).getTime()
            const endedAt = inc.endedAt ? new Date(inc.endedAt).getTime() : Date.now()
            const durationMs = Math.max(0, endedAt - startedAt)

            return (
              <article key={inc.id} className="rowCard">
                <div className="rowCard__main">
                  <div className="incidentHeader">
                    <div className="incidentTitle">
                      <span className="badge badge--warn">{inc.startStatus.toUpperCase()}</span>
                      <span className="incidentWhen">{formatDateTime(inc.startedAt)}</span>
                      <span className="incidentSep">→</span>
                      <span className="incidentWhen">{inc.endedAt ? formatDateTime(inc.endedAt) : 'Ongoing'}</span>
                    </div>
                    <div className="incidentDuration">Down: {formatDuration(durationMs)}</div>
                  </div>

                  <div className="incidentMeta">
                    <div>
                      <div className="metaItem__label">HTTP</div>
                      <div className="metaItem__value">{inc.startHttpCode ?? '—'}</div>
                    </div>
                    <div>
                      <div className="metaItem__label">Latency</div>
                      <div className="metaItem__value">
                        {inc.startLatencyMs != null ? `${inc.startLatencyMs} ms` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="metaItem__label">Error</div>
                      <div className="metaItem__value">{inc.startError ?? '—'}</div>
                    </div>
                    <div>
                      <div className="metaItem__label">Downtime in {year}</div>
                      <div className="metaItem__value">{formatDuration(downtimeWithinYear(inc, year))}</div>
                    </div>
                  </div>

                  {inc.startResponseSnippet ? (
                    <pre className="incidentSnippet">{inc.startResponseSnippet}</pre>
                  ) : null}
                </div>
              </article>
            )
          })}

          {!loading && incidents.length === 0 ? (
            <div className="list__meta">No incidents for {year}.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
