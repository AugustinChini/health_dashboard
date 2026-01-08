import { useCallback, useEffect, useMemo, useState } from 'react'

import type { AppRecord, Environment } from '../api/apps'
import {
  createApp as createAppApi,
  deleteApp as deleteAppApi,
  listApps,
  updateApp as updateAppApi,
} from '../api/apps'

type State = {
  apps: AppRecord[]
  loading: boolean
  error: string | null
}

export function useApps(options?: { refreshIntervalMs?: number }) {
  const refreshIntervalMs = options?.refreshIntervalMs

  const [state, setState] = useState<State>({
    apps: [],
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const apps = await listApps()
      setState({ apps, loading: false, error: null })
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load',
      }))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!refreshIntervalMs) return

    const id = window.setInterval(() => {
      refresh().catch(() => {})
    }, refreshIntervalMs)

    return () => window.clearInterval(id)
  }, [refresh, refreshIntervalMs])

  const api = useMemo(() => {
    return {
      apps: state.apps,
      loading: state.loading,
      error: state.error,
      refresh,
      addApp: async (input: { name: string; url: string; environment: Environment }) => {
        const created = await createAppApi(input)
        setState((s) => ({ ...s, apps: [created, ...s.apps] }))
        return created
      },
      updateApp: async (
        id: number,
        patch: Partial<{ name: string; url: string; environment: Environment }>,
      ) => {
        const updated = await updateAppApi(id, patch)
        setState((s) => ({
          ...s,
          apps: s.apps.map((a) => (a.id === id ? updated : a)),
        }))
        return updated
      },
      deleteApp: async (id: number) => {
        await deleteAppApi(id)
        setState((s) => ({ ...s, apps: s.apps.filter((a) => a.id !== id) }))
      },
    }
  }, [refresh, state.apps, state.error, state.loading])

  return api
}

export type { AppRecord }
