import { Settings } from 'lucide-react'
import { startTransition, useEffect, useState } from 'react'

import { BrandIcon } from '../components/Brand'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { Icon } from '../components/Icon'
import { SwitchRuleOptionSelect } from '../components/SwitchRuleOptionSelect'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { getDomainPattern, matchesPageDomain } from '../lib/pattern'
import { getRequestHeaderRules, updateRequestHeaderRules, subscribeToRequestHeaderRules } from '../lib/request-header-storage'
import type { RequestHeaderRule } from '../lib/types'
import { networkRulesForPage } from '../lib/network-rules'
import type { NetworkRule } from '../lib/network-rules'
import { getNetworkRules, updateNetworkRules, subscribeToNetworkRules } from '../lib/network-storage'

const ruleTabs = [
  { value: 'all', label: 'All' },
  { value: 'header-rule', label: 'Header Rules' },
  { value: 'switch-rule', label: 'Switch Rules' },
  { value: 'network-rule', label: 'Network Rules' },
] as const

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
    let rulesChanged = false
    let networkRulesChanged = false
    async function load() {
      try {
        const [nextRules, currentPageUrl, nextNetworkRules] = await Promise.all([
          getRequestHeaderRules(),
          getCurrentPageUrl(),
          getNetworkRules(),
        ])
        if (alive) {
          startTransition(() => {
            if (!rulesChanged) setRules(nextRules)
            if (!networkRulesChanged) setNetworkRules(nextNetworkRules)
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
      rulesChanged = true
      if (alive) startTransition(() => setRules(nextRules))
    })
    const unsubscribeNetwork = subscribeToNetworkRules(next => {
      networkRulesChanged = true
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
      await updateRequestHeaderRules(
        currentRules => currentRules.map((current) =>
          current.id !== rule.id ? current : current.kind === 'switch-rule'
            ? { ...current, ...patch }
            : { ...current, enabled: patch.enabled ?? current.enabled },
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
      const result = await updateNetworkRules(rules => rules.map(entry => entry.id === networkRule.id ? { ...entry, enabled } : entry))
      setNotice(result.reloadTabIds.length ? 'Reload matching website tabs to activate the latest network rules.' : '')
    } catch (reason) { setError(`Could not apply the network rule. ${reason instanceof Error ? reason.message : 'Try again.'}`) }
    finally { setPending(false) }
  }

  return (
    <main className="w-full p-4">
      <header className="mb-2.5 flex items-center justify-between gap-3">
        <BrandIcon size={24} />
        <span className="min-w-0 flex-1 truncate text-xs" title={pageUrl}>
          {getDomainPattern(pageUrl) || pageUrl}
        </span>
        <Button variant="ghost" size="icon" asChild>
          <a href="options.html#/header-rules" target="_blank" rel="noreferrer" aria-label="Settings">
            <Icon icon={Settings} />
          </a>
        </Button>
      </header>
      {error && (
        <p className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 border-destructive/40 bg-destructive/10 text-destructive" role="alert">
          {error}
        </p>
      )}
      <Tabs defaultValue="all" className="gap-[3px]">
        <TabsList className="w-full gap-0.5" aria-label="Rule types">
          {ruleTabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} size="sm" className="flex-1">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ruleTabs.map(tab => {
          const visibleRules = pageRules.filter(rule => tab.value === 'all' || rule.kind === tab.value)
          const visibleNetworkRules = tab.value === 'all' || tab.value === 'network-rule' ? pageNetworkRules : []

          return (
            <TabsContent key={tab.value} value={tab.value}>
              {loading ? (
                <p className="py-4 text-xs text-muted-foreground" role="status">
                  Loading...
                </p>
              ) : (
                visibleRules.length || visibleNetworkRules.length ? (
                  <ul className="m-0 max-h-[400px] list-none overflow-y-auto p-0">
                    {visibleRules.map((rule) => (
                      <li className="flex min-h-[43px] items-center gap-2.5 border-b py-[9px] last:border-b-0" key={rule.id}>
                        <ToggleSwitch
                          size="sm"
                          checked={rule.enabled}
                          label={`Enable ${rule.name}`}
                          pending={pending}
                          onChange={(enabled) => {
                            void handleUpdate(rule, { enabled })
                          }}
                        />
                        <span className="min-w-0 flex-1 text-xs wrap-anywhere">{rule.name}</span>
                        {rule.kind === 'switch-rule' && <SwitchRuleOptionSelect
                          size="sm"
                          switchRule={rule}
                          pending={pending}
                          onChange={(selectedOptionId) => { void handleUpdate(rule, { selectedOptionId }) }}
                        />}
                      </li>
                    ))}
                    {visibleNetworkRules.map(networkRule => (
                      <li key={networkRule.id} className="flex min-h-[43px] items-center gap-2.5 border-b py-[9px] last:border-b-0">
                        <ToggleSwitch
                          size="sm"
                          checked={networkRule.enabled}
                          label={`Enable ${networkRule.name}`}
                          pending={pending}
                          onChange={enabled => { void toggleNetworkRule(networkRule, enabled) }}
                        />
                        <span className="min-w-0 flex-1 text-xs wrap-anywhere">{networkRule.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-xs text-muted-foreground">
                    {tab.value === 'all' ? 'No matches for this page' : `No ${tab.label} match this page`}
                  </p>
                )
              )}
            </TabsContent>
          )
        })}
      </Tabs>
      {notice && <p className="mt-3 text-[11px] text-muted-foreground" role="status">{notice}</p>}
    </main>
  )
}
