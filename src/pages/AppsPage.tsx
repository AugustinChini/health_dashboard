import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import type { AppRecord, Environment } from '../api/apps'
import { useApps } from '../hooks/useApps'

type Draft = {
  name: string
  url: string
  environment: Environment
}

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export default function AppsPage() {
  const { apps, loading, error, addApp, updateApp, deleteApp } = useApps()
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [draft, setDraft] = useState<Draft>({
    name: '',
    url: '',
    environment: 'prod',
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft | null>(null)

  const canAdd = useMemo(() => {
    return draft.name.trim().length > 0 && draft.url.trim().length > 0 && isValidUrl(draft.url.trim())
  }, [draft.name, draft.url])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const name = draft.name.trim()
    const url = draft.url.trim()

    if (!name || !url || !isValidUrl(url)) return

    setSubmitting(true)
    setActionError(null)
    addApp({ name, url, environment: draft.environment })
      .then(() => {
        setDraft({ name: '', url: '', environment: draft.environment })
      })
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : 'Failed to add app')
      })
      .finally(() => setSubmitting(false))
  }

  function startEdit(app: AppRecord) {
    setEditingId(app.id)
    setEditDraft({ name: app.name, url: app.url, environment: app.environment })
    setActionError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  function saveEdit() {
    if (!editingId || !editDraft) return

    const name = editDraft.name.trim()
    const url = editDraft.url.trim()

    if (!name || !url || !isValidUrl(url)) return

    setSubmitting(true)
    setActionError(null)
    updateApp(editingId, { name, url, environment: editDraft.environment })
      .then(() => cancelEdit())
      .catch((e) => {
        setActionError(e instanceof Error ? e.message : 'Failed to save changes')
      })
      .finally(() => setSubmitting(false))
  }

  return (
    <div>
      <section className="pageHeader">
        <div>
          <div className="pageHeader__title">Registered apps</div>
          <div className="pageHeader__subtitle">Add, rename, or delete apps to monitor.</div>
        </div>

        <div className="pageHeader__meta">
          <span className="metaPill">
            <strong>{apps.length}</strong> apps
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel__title">Add an application</div>

        {error || actionError ? (
          <div className="list__meta">{actionError ?? error}</div>
        ) : null}

        <form className="form" onSubmit={onSubmit}>
          <div className="form__grid">
            <label className="field">
              <span className="field__label">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Billing API"
              />
            </label>

            <label className="field">
              <span className="field__label">Health URL</span>
              <input
                value={draft.url}
                onChange={(e) => setDraft((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://myapp.fr/health"
              />
            </label>

            <label className="field">
              <span className="field__label">Environment</span>
              <select
                value={draft.environment}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, environment: e.target.value as Environment }))
                }
              >
                <option value="prod">prod</option>
                <option value="staging">staging</option>
                <option value="dev">dev</option>
              </select>
            </label>

            <div className="field field--actions">
              <span className="field__label">&nbsp;</span>
              <button className="btn" type="submit" disabled={!canAdd || submitting}>
                Add app
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="list">
        <div className="list__header">
          <div className="list__title">Manage</div>
          <div className="list__meta">Rename, edit URL, or delete.{loading ? ' (loading...)' : ''}</div>
        </div>

        <div className="stack">
          {apps.map((app) => {
            const isEditing = editingId === app.id
            const d = isEditing ? editDraft : null

            return (
              <article key={app.id} className="rowCard">
                <div className="rowCard__main">
                  {isEditing && d ? (
                    <div className="rowCard__editGrid">
                      <label className="field">
                        <span className="field__label">Name</span>
                        <input
                          value={d.name}
                          onChange={(e) =>
                            setEditDraft((p) => (p ? { ...p, name: e.target.value } : p))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Health URL</span>
                        <input
                          value={d.url}
                          onChange={(e) =>
                            setEditDraft((p) => (p ? { ...p, url: e.target.value } : p))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">Env</span>
                        <select
                          value={d.environment}
                          onChange={(e) =>
                            setEditDraft((p) =>
                              p ? { ...p, environment: e.target.value as Environment } : p,
                            )
                          }
                        >
                          <option value="prod">prod</option>
                          <option value="staging">staging</option>
                          <option value="dev">dev</option>
                        </select>
                      </label>
                    </div>
                  ) : (
                    <div>
                      <div className="rowCard__title">{app.name}</div>
                      <div className="rowCard__subtitle">{app.url}</div>
                      <div className="rowCard__tags">
                        <span className="tag">{app.environment}</span>
                        <span className={`badge badge--${app.status === 'ok' ? 'good' : app.status === 'fail' ? 'bad' : 'warn'}`}>
                          {app.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rowCard__actions">
                  {isEditing ? (
                    <>
                      <button className="btn" type="button" onClick={saveEdit} disabled={submitting}>
                        Save
                      </button>
                      <button className="btn btn--ghost" type="button" onClick={cancelEdit} disabled={submitting}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn" type="button" onClick={() => startEdit(app)} disabled={submitting}>
                        Edit
                      </button>
                      <button
                        className="btn btn--danger"
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setSubmitting(true)
                          setActionError(null)
                          deleteApp(app.id)
                            .catch((e) => {
                              setActionError(e instanceof Error ? e.message : 'Failed to delete app')
                            })
                            .finally(() => setSubmitting(false))
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
