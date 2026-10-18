import { ArrowRight, Plus, Search, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { startTransition, useEffect, useState } from 'react'

import { Brand } from '../components/Brand'
import { Icon } from '../components/Icon'
import { HeaderRuleEditor } from '../components/HeaderRuleEditor'
import { HeaderRulesList } from '../components/HeaderRulesList'
import { SwitchRuleEditor } from '../components/SwitchRuleEditor'
import { SwitchRulesList } from '../components/SwitchRulesList'
import { NetworkRuleEditor } from '../components/NetworkRuleEditor'
import { NetworkRulesList } from '../components/NetworkRulesList'
import { cleanResponseHeaders } from '../lib/network-rules'
import type { NetworkRule, NetworkRuleDraft } from '../lib/network-rules'
import { getNetworkRules, saveNetworkRules, subscribeToNetworkRules } from '../lib/network-storage'
import { createRuleId, getEntryHeaders, sanitizeHeaders } from '../lib/request-header-rules'
import { getRequestHeaderRules, saveRequestHeaderRules, subscribeToRequestHeaderRules } from '../lib/request-header-storage'
import type { RequestHeaderRule, HeaderRule, SwitchRule, HeaderRuleDraft, SwitchRuleDraft } from '../lib/types'

function readRoute() {
  return window.location.hash.slice(1) || '/header-rules'
}

function entryRoute(entry: RequestHeaderRule) {
  const group = entry.kind === 'switch-rule' ? 'switch-rules' : 'header-rules'
  return `/${group}/${encodeURIComponent(entry.id)}`
}

export function OptionsApp() {
  const [entries, setEntries] = useState<RequestHeaderRule[]>([])
  const [networkRules, setNetworkRules] = useState<NetworkRule[]>([])
  const [networkNotice, setNetworkNotice] = useState('')
  const [route, setRoute] = useState(readRoute)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    let alive = true
    void Promise.all([getRequestHeaderRules(), getNetworkRules()]).then(([nextEntries, nextNetworkRules]) => {
      if (alive) startTransition(() => { setEntries(nextEntries); setNetworkRules(nextNetworkRules); setLoading(false) })
    }).catch(() => {
      if (alive) {
        setError('Could not load your settings. Reopen this page to try again.')
        setLoadFailed(true)
        setLoading(false)
      }
    })
    const unsubscribe = subscribeToRequestHeaderRules((nextEntries) => {
      if (alive) startTransition(() => setEntries(nextEntries))
    })
    const unsubscribeNetwork = subscribeToNetworkRules(nextNetworkRules => {
      if (alive) startTransition(() => setNetworkRules(nextNetworkRules))
    })
    return () => { alive = false; unsubscribe(); unsubscribeNetwork() }
  }, [])

  async function persistNetworkRules(next: NetworkRule[]) {
    setPending(true)
    setError('')
    try {
      const result = await saveNetworkRules(next)
      setNetworkRules(result.entries)
      setNetworkNotice(result.reloadTabIds.length
        ? 'Settings saved. Reload matching website tabs to activate the latest network rules.'
        : '')
    } finally { setPending(false) }
  }

  async function handleSaveNetworkRule(draft: NetworkRuleDraft, id?: string) {
    const current = networkRules.find(entry => entry.id === id)
    const entry: NetworkRule = {
      ...draft, id: id ?? createRuleId(), order: current?.order ?? networkRules.length,
      name: draft.name.trim(), url: draft.url.trim(), requestUrl: draft.requestUrl.trim(),
      headers: cleanResponseHeaders(draft.headers),
    }
    await persistNetworkRules(id ? networkRules.map(item => item.id === id ? entry : item) : [...networkRules, entry])
    window.location.hash = '/network-rules'
  }

  async function handleToggleNetworkRule(entry: NetworkRule, enabled: boolean) {
    try { await persistNetworkRules(networkRules.map(item => item.id === entry.id ? { ...item, enabled } : item)) }
    catch (reason) { setError(`Could not change the network rule. ${reason instanceof Error ? reason.message : 'Try again.'}`) }
  }

  async function handleDeleteNetworkRule(entry: NetworkRule) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return
    try {
      await persistNetworkRules(networkRules.filter(item => item.id !== entry.id))
      window.location.hash = '/network-rules'
    } catch { setError('Could not delete the network rule. Try again.') }
  }

  async function persistEntries(nextEntries: RequestHeaderRule[]) {
    setPending(true)
    setError('')
    try {
      const saved = await saveRequestHeaderRules(nextEntries)
      setEntries(saved)
      return saved
    } finally {
      setPending(false)
    }
  }

  async function persistEntry(entry: RequestHeaderRule, existingId?: string) {
    await persistEntries(existingId
      ? entries.map((current) => current.id === existingId ? entry : current)
      : [...entries, entry])
    window.location.hash = entry.kind === 'switch-rule' ? '/switch-rules' : '/header-rules'
  }

  async function handleSaveHeaderRule(draft: HeaderRuleDraft, ruleId?: string): Promise<HeaderRule> {
    const current = entries.find((entry) => entry.id === ruleId)
    const rule: HeaderRule = {
      kind: 'header-rule',
      id: ruleId ?? createRuleId(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      enabled: draft.enabled,
      headers: sanitizeHeaders(draft.headers),
      order: current?.order ?? entries.length,
    }
    await persistEntry(rule, ruleId)
    return rule
  }

  async function handleSaveSwitchRule(draft: SwitchRuleDraft, switchRuleId?: string): Promise<SwitchRule> {
    const current = entries.find((entry) => entry.id === switchRuleId)
    const switchRule: SwitchRule = {
      kind: 'switch-rule',
      id: switchRuleId ?? createRuleId(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      enabled: draft.enabled,
      options: draft.options.map((option) => ({
        ...option, name: option.name.trim(), headers: sanitizeHeaders(option.headers),
      })),
      selectedOptionId: current?.kind === 'switch-rule' && draft.options.some((option) => option.id === current.selectedOptionId)
        ? current.selectedOptionId
        : draft.selectedOptionId,
      order: current?.order ?? entries.length,
    }
    await persistEntry(switchRule, switchRuleId)
    return switchRule
  }

  async function handleDelete(entry: RequestHeaderRule) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return
    try {
      await persistEntries(entries.filter((current) => current.id !== entry.id))
      window.location.hash = entry.kind === 'switch-rule' ? '/switch-rules' : '/header-rules'
    } catch {
      setError(`Could not delete the ${entry.kind === 'switch-rule' ? 'switch rule' : 'header rule'}. Try again.`)
    }
  }

  async function handleToggle(entry: RequestHeaderRule, enabled: boolean) {
    try {
      await persistEntries(entries.map((current) => current.id === entry.id ? { ...current, enabled } : current))
    } catch {
      setError(`Could not change ${entry.kind === 'switch-rule' ? 'switch rule' : 'header rule'} state. Try again.`)
    }
  }

  async function handleSelectOption(switchRule: SwitchRule, selectedOptionId: string) {
    try {
      await persistEntries(entries.map((current) => current.id === switchRule.id && current.kind === 'switch-rule'
        ? { ...current, selectedOptionId }
        : current))
    } catch (error) {
      setError(`Could not apply the selected headers. ${error instanceof Error ? error.message : 'Try again.'}`)
    }
  }

  const selected = entries.find((entry) => route === entryRoute(entry))
  const selectedNetworkRule = networkRules.find(entry => route === `/network-rules/${encodeURIComponent(entry.id)}`)
  const isHome = route === '/header-rules' || route === '/switch-rules' || route === '/network-rules'

  return (
    <div className="mx-auto max-w-[1240px] px-16 min-[1440px]:max-w-[1280px] min-[1440px]:px-[90px] tablet:px-9 mobile:px-5">
      <header className="flex h-[78px] items-center justify-between gap-5 border-b tablet:h-[72px]"><Brand /></header>
      <main className="pt-[34px] pb-[50px] min-[1440px]:pt-10 tablet:pt-10 mobile:pt-[31px]">
        {error && <p className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 border-destructive/40 bg-destructive/10 text-destructive" role="alert">{error}</p>}
        {networkNotice && route === '/network-rules' && <p className="mb-5 text-xs text-muted-foreground" role="status">{networkNotice}</p>}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2.5 text-xs text-muted-foreground" role="status"><span className="size-[7px] animate-loading-pulse rounded-full bg-primary" /> Loading...</div>
        ) : loadFailed ? null : isHome ? (
          <Workspace
            entries={entries}
            networkRules={networkRules}
            view={route === '/network-rules' ? 'network-rule' : route === '/switch-rules' ? 'switch-rule' : 'header-rule'}
            pending={pending}
            onToggle={(entry, enabled) => { void handleToggle(entry, enabled) }}
            onSelectOption={(switchRule, optionId) => { void handleSelectOption(switchRule, optionId) }}
            onToggleNetworkRule={(entry, enabled) => { void handleToggleNetworkRule(entry, enabled) }}
          />
        ) : route === '/network-rules/new' || selectedNetworkRule ? (
          <NetworkRuleEditor key={route} networkRule={selectedNetworkRule} pending={pending}
            onSave={draft => handleSaveNetworkRule(draft, selectedNetworkRule?.id)}
            onDelete={selectedNetworkRule ? () => { void handleDeleteNetworkRule(selectedNetworkRule) } : undefined} />
        ) : route === '/header-rules/new' || selected?.kind === 'header-rule' ? (
          <HeaderRuleEditor
            key={route}
            headerRule={selected?.kind === 'header-rule' ? selected : undefined}
            pending={pending}
            onSave={(draft) => handleSaveHeaderRule(draft, selected?.id)}
            onDelete={selected ? () => { void handleDelete(selected) } : undefined}
          />
        ) : route === '/switch-rules/new' || selected?.kind === 'switch-rule' ? (
          <SwitchRuleEditor
            key={route}
            switchRule={selected?.kind === 'switch-rule' ? selected : undefined}
            pending={pending}
            onSave={(draft) => handleSaveSwitchRule(draft, selected?.id)}
            onDelete={selected ? () => { void handleDelete(selected) } : undefined}
          />
        ) : (
          <div className="flex flex-col items-center px-5 pt-[45px] pb-11 text-center mobile:px-4 mobile:py-[33px] [&_h3]:mt-[11px] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-[-0.3px]"><h1 className="text-[28px] font-semibold">Not found.</h1><Button asChild variant="ghost" size="default" className="min-h-[46px] gap-[9px] rounded-[7px] border border-transparent px-5 py-[13px] text-xs font-bold hover:bg-transparent"><a href="#/header-rules">Back to header rules <Icon icon={ArrowRight} /></a></Button></div>
        )}
      </main>
    </div>
  )
}

type WorkspaceProps = {
  entries: RequestHeaderRule[]
  networkRules: NetworkRule[]
  view: RequestHeaderRule['kind'] | 'network-rule'
  pending: boolean
  onToggle: (entry: RequestHeaderRule, enabled: boolean) => void
  onSelectOption: (switchRule: SwitchRule, optionId: string) => void
  onToggleNetworkRule: (networkRule: NetworkRule, enabled: boolean) => void
}

function Workspace({ entries, networkRules, view, pending, onToggle, onSelectOption, onToggleNetworkRule }: WorkspaceProps) {
  const [queries, setQueries] = useState({ 'header-rule': '', 'switch-rule': '', 'network-rule': '' })
  const query = queries[view]
  const isSwitchRules = view === 'switch-rule'
  const isNetwork = view === 'network-rule'
  const noun = isNetwork ? 'network rule' : isSwitchRules ? 'switch rule' : 'header rule'
  const plural = `${noun}s`
  const title = isNetwork ? 'Network Rules' : isSwitchRules ? 'Switch Rules' : 'Header Rules'
  const newTitle = isNetwork ? 'New Network Rule' : isSwitchRules ? 'New Switch Rule' : 'New Header Rule'
  const newRoute = isNetwork ? '#/network-rules/new' : isSwitchRules ? '#/switch-rules/new' : '#/header-rules/new'
  const group = entries.filter((entry) => entry.kind === view)
  const visible = group.filter((entry) => {
    const term = query.trim().toLowerCase()
    const options = entry.kind === 'switch-rule'
      ? entry.options.map((option) => `${option.name} ${option.headers.map((header) => header.key).join(' ')}`).join(' ')
      : getEntryHeaders(entry).map((header) => header.key).join(' ')
    return !term || `${entry.name} ${entry.url} ${options}`.toLowerCase().includes(term)
  })
  const visibleNetworkRules = networkRules.filter(entry => !query.trim() || `${entry.name} ${entry.url} ${entry.requestUrl} ${entry.method}`.toLowerCase().includes(query.trim().toLowerCase()))
  const groupCount = isNetwork ? networkRules.length : group.length
  const visibleCount = isNetwork ? visibleNetworkRules.length : visible.length


  return (
    <Tabs value={view} onValueChange={(value) => { window.location.hash = value === 'network-rule' ? '/network-rules' : value === 'switch-rule' ? '/switch-rules' : '/header-rules' }} className="animate-[rise-in_550ms_80ms_both] gap-0">
      <TabsList aria-label="Rule settings" className="mb-6 max-w-full [&_button]:mobile:px-2">
        <TabsTrigger value="header-rule">Header Rules</TabsTrigger>
        <TabsTrigger value="switch-rule">Switch Rules</TabsTrigger>
        <TabsTrigger value="network-rule">Network Rules</TabsTrigger>
      </TabsList>
      <TabsContent value={view}>
        <div className={`mb-5 flex items-center justify-between gap-5 mobile:gap-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:flex [&_h1]:items-center [&_h1]:gap-2.5 mobile:[&_h1]:gap-2 mobile:[&_h1]:whitespace-nowrap ${isNetwork ? 'mobile:flex-wrap' : ''}`}>
          <h1>{title}</h1>
          <Button asChild className="mobile:px-3 mobile:text-xs mobile:shrink-0 mobile:whitespace-nowrap"><a href={newRoute}><Icon icon={Plus} /> {newTitle}</a></Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card shadow-panel">
          <div className="flex min-h-[66px] items-center gap-5 border-b px-6 py-[17px] mobile:px-[15px] mobile:py-3.5 mobile:flex-col mobile:items-stretch mobile:gap-2.5">
            <label className="flex w-full min-w-0 items-center gap-2 text-muted-foreground focus-within:text-foreground focus-within:shadow-[0_1px_0_var(--ring)] [&>svg]:size-[15px]">
              <Icon icon={Search} />
              <Input className="h-auto flex-1 rounded-none border-0 bg-transparent px-0 py-2 text-[11px] shadow-none focus:bg-transparent focus:ring-0 placeholder:text-muted-foreground" aria-label={`Search ${plural}`} placeholder={`Find a ${noun}...`} value={query} onChange={(event) => setQueries({ ...queries, [view]: event.target.value })} />
              {query && <Button variant="ghost" type="button" className="size-[26px] text-muted-foreground [&_svg]:size-[15px]" aria-label="Clear search" onClick={() => setQueries({ ...queries, [view]: '' })}><Icon icon={X} /></Button>}
            </label>
          </div>
          {!groupCount ? (
            <div className="flex flex-col items-center px-5 pt-[45px] pb-11 text-center mobile:px-4 mobile:py-[33px] [&_h3]:mt-[11px] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-[-0.3px]">
              <h3>No {plural} yet</h3>
              <Button asChild className="mt-[23px] mobile:px-3 mobile:text-xs mobile:shrink-0 mobile:whitespace-nowrap"><a href={newRoute}>
                <Icon icon={Plus} /> {newTitle}
              </a></Button>
            </div>
          ) : visibleCount ? (
            isNetwork ? <NetworkRulesList networkRules={visibleNetworkRules} pending={pending} onToggle={onToggleNetworkRule} /> : isSwitchRules ? (
              <SwitchRulesList switchRules={visible.filter((entry): entry is SwitchRule => entry.kind === 'switch-rule')} pending={pending} switchRuleHref={(switchRule) => `#${entryRoute(switchRule)}`} onToggle={onToggle} onSelectOption={onSelectOption} />
            ) : (
              <>
                <div className="grid grid-cols-[32px_minmax(0,1fr)_92px] gap-4 px-6 pt-[17px] pb-2 text-[8px] tracking-[1.1px] text-muted-foreground tablet:grid-cols-[32px_minmax(0,1fr)_68px] mobile:hidden" aria-hidden="true"><span /><span>HEADER RULE / URL PATTERN</span><span>HEADERS</span></div>
                <HeaderRulesList headerRules={visible.filter((entry): entry is HeaderRule => entry.kind === 'header-rule')} pending={pending} headerRuleHref={(rule) => `#${entryRoute(rule)}`} onToggle={onToggle} />
              </>
            )
          ) : (
            <div className="flex flex-col items-center px-5 pt-[45px] pb-11 text-center mobile:px-4 mobile:py-[33px] [&_h3]:mt-[11px] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-[-0.3px] min-h-[290px] justify-center [&>svg]:size-7 [&>svg]:text-muted-foreground [&>button]:mt-5"><Icon icon={Search} /><h3>No matching {plural}.</h3><Button variant="outline" className="h-auto min-h-[46px] px-5 py-[13px] text-xs font-bold" onClick={() => setQueries({ ...queries, [view]: '' })}>Show all {plural}</Button></div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
