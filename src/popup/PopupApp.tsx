import { startTransition, useEffect, useState } from 'react'

import { SwitchRuleOptionSelect } from '../components/SwitchRuleOptionSelect'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { matchesPageDomain } from '../lib/pattern'
import { getEntries, saveEntries, subscribeToEntries } from '../lib/storage'
import type { HeaderEntry } from '../lib/types'
import { networkOverridesForPage } from '../lib/network-rules'
import type { NetworkOverride } from '../lib/network-rules'
import { getNetworkOverrides, saveNetworkOverrides, subscribeToNetworkOverrides } from '../lib/network-storage'

async function getCurrentPageUrl(): Promise<string> {
  if (import.meta.env.DEV && !globalThis.chrome?.tabs?.query) {
    return window.location.href
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? ''
}

export function PopupApp() {
  const [rules, setRules] = useState<HeaderEntry[]>([])
  const [overrides, setOverrides] = useState<NetworkOverride[]>([])
  const [notice, setNotice] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [nextRules, currentPageUrl, nextOverrides] = await Promise.all([
          getEntries(),
          getCurrentPageUrl(),
          getNetworkOverrides(),
        ])
        if (alive) {
          startTransition(() => {
            setRules(nextRules)
            setOverrides(nextOverrides)
            setPageUrl(currentPageUrl)
            setLoading(false)
          })
        }
      } catch {
        if (alive) {
          setError('Could not load your settings. Reopen the popup to try again.')
          setLoading(false)
        }
      }
    }
    void load()
    const unsubscribe = subscribeToEntries((nextRules) => {
      if (alive) startTransition(() => setRules(nextRules))
    })
    const unsubscribeNetwork = subscribeToNetworkOverrides(next => {
      if (alive) startTransition(() => setOverrides(next))
    })
    return () => {
      alive = false
      unsubscribe()
      unsubscribeNetwork()
    }
  }, [])

  async function handleUpdate(rule: HeaderEntry, patch: { enabled?: boolean; selectedOptionId?: string }) {
    setPending(true)
    setError('')
    try {
      setRules(
        await saveEntries(
          rules.map((current) =>
            current.id !== rule.id ? current : current.kind === 'switcher'
              ? { ...current, ...patch }
              : { ...current, enabled: patch.enabled ?? current.enabled },
          ),
        ),
      )
    } catch (error) {
      setError(`Could not apply the headers. ${error instanceof Error ? error.message : 'Try again.'}`)
    } finally {
      setPending(false)
    }
  }

  const pageRules = rules.filter((rule) => matchesPageDomain(rule.url, pageUrl))
  const pageOverrides = networkOverridesForPage(overrides, pageUrl)

  async function toggleOverride(override: NetworkOverride, enabled: boolean) {
    setPending(true)
    setError('')
    try {
      const result = await saveNetworkOverrides(overrides.map(entry => entry.id === override.id ? { ...entry, enabled } : entry))
      setOverrides(result.entries)
      setNotice(result.reloadTabIds.length ? 'Reload matching website tabs to activate the latest network rules.' : 'Changes apply to the next request.')
    } catch (reason) { setError(`Could not apply the network rule. ${reason instanceof Error ? reason.message : 'Try again.'}`) }
    finally { setPending(false) }
  }

  return (
    <main className="w-full px-[18px] pt-2 pb-3.5">
      {error && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 border-destructive/40 bg-destructive/10 text-destructive" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="py-4 text-xs text-muted-foreground" role="status">
          Loading...
        </p>
      ) : (
        pageRules.length || pageOverrides.length ? (
          <ul className="m-0 max-h-[400px] list-none overflow-y-auto p-0">
            {pageRules.map((rule) => (
              <li className="flex min-h-12 items-center gap-3 border-b py-3 last:border-b-0" key={rule.id}>
                <ToggleSwitch
                  checked={rule.enabled}
                  label={`Enable ${rule.name}`}
                  disabled={pending}
                  onChange={(enabled) => {
                    void handleUpdate(rule, { enabled })
                  }}
                />
                <span className="min-w-0 flex-1 text-[13px] wrap-anywhere">{rule.name}</span>
                {rule.kind === 'switcher' && <SwitchRuleOptionSelect
                  switcher={rule}
                  disabled={pending}
                  onChange={(selectedOptionId) => { void handleUpdate(rule, { selectedOptionId }) }}
                />}
              </li>
            ))}
            {pageOverrides.length > 0 && <li className="pt-3 pb-1 text-[10px] text-muted-foreground">Network Rules</li>}
            {pageOverrides.map(override => <li key={override.id} className="flex min-h-12 items-center gap-3 border-b py-3 last:border-b-0"><ToggleSwitch checked={override.enabled} label={`Enable ${override.name}`} disabled={pending} onChange={enabled => { void toggleOverride(override, enabled) }} /><span className="min-w-0 flex-1 text-[13px] wrap-anywhere">{override.name}</span></li>)}
          </ul>
        ) : (
          <p className="py-4 text-xs text-muted-foreground">No matches for this page</p>
        )
      )}
      {notice && <p className="mt-3 text-[11px] text-muted-foreground" role="status">{notice}</p>}
      <footer className="mt-2 flex justify-end border-t pt-3 [&_a]:text-xs [&_a]:text-muted-foreground [&_a]:no-underline [&_a:hover]:text-foreground">
        <a href="options.html#/" target="_blank" rel="noreferrer">
          Settings
        </a>
      </footer>
    </main>
  )
}
