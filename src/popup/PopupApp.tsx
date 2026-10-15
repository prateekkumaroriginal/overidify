import { startTransition, useEffect, useState } from 'react'

import { SwitchRuleOptionSelect } from '../components/SwitchRuleOptionSelect'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { matchesPageDomain } from '../lib/pattern'
import { getRequestHeaderRules, saveRequestHeaderRules, subscribeToRequestHeaderRules } from '../lib/request-header-storage'
import type { RequestHeaderRule } from '../lib/types'
import { networkRulesForPage } from '../lib/network-rules'
import type { NetworkRule } from '../lib/network-rules'
import { getNetworkRules, saveNetworkRules, subscribeToNetworkRules } from '../lib/network-storage'

async function getCurrentPageUrl(): Promise<string> {
  if (import.meta.env.DEV && !globalThis.chrome?.tabs?.query) {
    return window.location.href
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.url ?? ''
}

export function PopupApp() {
  const [rules, setRules] = useState<RequestHeaderRule[]>([])
  const [networkRules, setNetworkRules] = useState<NetworkRule[]>([])
  const [notice, setNotice] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [nextRules, currentPageUrl, nextNetworkRules] = await Promise.all([
          getRequestHeaderRules(),
          getCurrentPageUrl(),
          getNetworkRules(),
        ])
        if (alive) {
          startTransition(() => {
            setRules(nextRules)
            setNetworkRules(nextNetworkRules)
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
    const unsubscribe = subscribeToRequestHeaderRules((nextRules) => {
      if (alive) startTransition(() => setRules(nextRules))
    })
    const unsubscribeNetwork = subscribeToNetworkRules(next => {
      if (alive) startTransition(() => setNetworkRules(next))
    })
    return () => {
      alive = false
      unsubscribe()
      unsubscribeNetwork()
    }
  }, [])

  async function handleUpdate(rule: RequestHeaderRule, patch: { enabled?: boolean; selectedOptionId?: string }) {
    setPending(true)
    setError('')
    try {
      setRules(
        await saveRequestHeaderRules(
          rules.map((current) =>
            current.id !== rule.id ? current : current.kind === 'switch-rule'
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
  const pageNetworkRules = networkRulesForPage(networkRules, pageUrl)

  async function toggleNetworkRule(networkRule: NetworkRule, enabled: boolean) {
    setPending(true)
    setError('')
    try {
      const result = await saveNetworkRules(networkRules.map(entry => entry.id === networkRule.id ? { ...entry, enabled } : entry))
      setNetworkRules(result.entries)
      setNotice(result.reloadTabIds.length ? 'Reload matching website tabs to activate the latest network rules.' : '')
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
        pageRules.length || pageNetworkRules.length ? (
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
                {rule.kind === 'switch-rule' && <SwitchRuleOptionSelect
                  switchRule={rule}
                  disabled={pending}
                  onChange={(selectedOptionId) => { void handleUpdate(rule, { selectedOptionId }) }}
                />}
              </li>
            ))}
            {pageNetworkRules.length > 0 && <li className="pt-3 pb-1 text-[10px] text-muted-foreground">Network Rules</li>}
            {pageNetworkRules.map(networkRule => <li key={networkRule.id} className="flex min-h-12 items-center gap-3 border-b py-3 last:border-b-0"><ToggleSwitch checked={networkRule.enabled} label={`Enable ${networkRule.name}`} disabled={pending} onChange={enabled => { void toggleNetworkRule(networkRule, enabled) }} /><span className="min-w-0 flex-1 text-[13px] wrap-anywhere">{networkRule.name}</span></li>)}
          </ul>
        ) : (
          <p className="py-4 text-xs text-muted-foreground">No matches for this page</p>
        )
      )}
      {notice && <p className="mt-3 text-[11px] text-muted-foreground" role="status">{notice}</p>}
      <footer className="mt-2 flex justify-end border-t pt-3 [&_a]:text-xs [&_a]:text-muted-foreground [&_a]:no-underline [&_a:hover]:text-foreground">
        <a href="options.html#/header-rules" target="_blank" rel="noreferrer">
          Settings
        </a>
      </footer>
    </main>
  )
}
