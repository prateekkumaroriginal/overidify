import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { startTransition, useEffect, useState } from 'react'

import { Brand } from '../components/Brand'
import { Icon } from '../components/Icon'
import { RuleEditor } from '../components/RuleEditor'
import { RulesList } from '../components/RulesList'
import { SwitcherEditor } from '../components/SwitcherEditor'
import { SwitchersList } from '../components/SwitchersList'
import { createRuleId, getEntryHeaders, sanitizeHeaders } from '../lib/rules'
import { getEntries, saveEntries, subscribeToEntries } from '../lib/storage'
import type { HeaderEntry, HeaderRule, HeaderSwitcher, RuleDraft, SwitcherDraft } from '../lib/types'

function readRoute() {
  return window.location.hash.slice(1) || '/'
}

function entryRoute(entry: HeaderEntry) {
  const group = entry.kind === 'switcher' ? 'switchers' : 'rules'
  return `/${group}/${encodeURIComponent(entry.id)}`
}

export function OptionsApp() {
  const [entries, setEntries] = useState<HeaderEntry[]>([])
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
    void getEntries().then((nextEntries) => {
      if (alive) startTransition(() => { setEntries(nextEntries); setLoading(false) })
    }).catch(() => {
      if (alive) {
        setError('Could not load your settings. Reopen this page to try again.')
        setLoadFailed(true)
        setLoading(false)
      }
    })
    const unsubscribe = subscribeToEntries((nextEntries) => {
      if (alive) startTransition(() => setEntries(nextEntries))
    })
    return () => { alive = false; unsubscribe() }
  }, [])

  async function persistEntries(nextEntries: HeaderEntry[]) {
    setPending(true)
    setError('')
    try {
      const saved = await saveEntries(nextEntries)
      setEntries(saved)
      return saved
    } finally {
      setPending(false)
    }
  }

  async function persistEntry(entry: HeaderEntry, existingId?: string) {
    await persistEntries(existingId
      ? entries.map((current) => current.id === existingId ? entry : current)
      : [...entries, entry])
    window.location.hash = entry.kind === 'switcher' ? '/switchers' : '/'
  }

  async function handleSaveRule(draft: RuleDraft, ruleId?: string): Promise<HeaderRule> {
    const current = entries.find((entry) => entry.id === ruleId)
    const rule: HeaderRule = {
      kind: 'rule',
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

  async function handleSaveSwitcher(draft: SwitcherDraft, switcherId?: string): Promise<HeaderSwitcher> {
    const current = entries.find((entry) => entry.id === switcherId)
    const switcher: HeaderSwitcher = {
      kind: 'switcher',
      id: switcherId ?? createRuleId(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      enabled: draft.enabled,
      options: draft.options.map((option) => ({
        ...option, name: option.name.trim(), headers: sanitizeHeaders(option.headers),
      })),
      selectedOptionId: current?.kind === 'switcher' && draft.options.some((option) => option.id === current.selectedOptionId)
        ? current.selectedOptionId
        : draft.selectedOptionId,
      order: current?.order ?? entries.length,
    }
    await persistEntry(switcher, switcherId)
    return switcher
  }

  async function handleDelete(entry: HeaderEntry) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return
    try {
      await persistEntries(entries.filter((current) => current.id !== entry.id))
      window.location.hash = entry.kind === 'switcher' ? '/switchers' : '/'
    } catch {
      setError(`Could not delete the ${entry.kind}. Try again.`)
    }
  }

  async function handleToggle(entry: HeaderEntry, enabled: boolean) {
    try {
      await persistEntries(entries.map((current) => current.id === entry.id ? { ...current, enabled } : current))
    } catch {
      setError(`Could not change ${entry.kind} state. Try again.`)
    }
  }

  async function handleSelectOption(switcher: HeaderSwitcher, selectedOptionId: string) {
    try {
      await persistEntries(entries.map((current) => current.id === switcher.id && current.kind === 'switcher'
        ? { ...current, selectedOptionId }
        : current))
    } catch {
      setError('Could not change the selected option. Try again.')
    }
  }

  // Old bookmarks for multi-option rules still open their switcher editor.
  const selected = entries.find((entry) => route === entryRoute(entry) || route === `/rules/${encodeURIComponent(entry.id)}`)
  const isHome = route === '/' || route === '/switchers'

  return (
    <div className="mx-auto max-w-[1240px] px-16 min-[1440px]:max-w-[1280px] min-[1440px]:px-[90px] tablet:px-9 mobile:px-5">
      <header className="flex h-[78px] items-center justify-between gap-5 border-b tablet:h-[72px]"><Brand /></header>
      <main className="pt-[34px] pb-[50px] min-[1440px]:pt-10 tablet:pt-10 mobile:pt-[31px]">
        {error && <p className="mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 border-destructive/40 bg-destructive/10 text-destructive" role="alert">{error}</p>}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center gap-2.5 text-xs text-muted-foreground" role="status"><span className="size-[7px] animate-loading-pulse rounded-full bg-primary" /> Loading...</div>
        ) : loadFailed ? null : isHome ? (
          <Workspace
            entries={entries}
            view={route === '/switchers' ? 'switcher' : 'rule'}
            pending={pending}
            onToggle={(entry, enabled) => { void handleToggle(entry, enabled) }}
            onSelectOption={(switcher, optionId) => { void handleSelectOption(switcher, optionId) }}
          />
        ) : route === '/new' || selected?.kind === 'rule' ? (
          <RuleEditor
            key={route}
            rule={selected?.kind === 'rule' ? selected : undefined}
            pending={pending}
            onSave={(draft) => handleSaveRule(draft, selected?.id)}
            onDelete={selected ? () => { void handleDelete(selected) } : undefined}
          />
        ) : route === '/switchers/new' || selected?.kind === 'switcher' ? (
          <SwitcherEditor
            key={route}
            switcher={selected?.kind === 'switcher' ? selected : undefined}
            pending={pending}
            onSave={(draft) => handleSaveSwitcher(draft, selected?.id)}
            onDelete={selected ? () => { void handleDelete(selected) } : undefined}
          />
        ) : (
          <div className="flex flex-col items-center px-5 pt-[45px] pb-11 text-center mobile:px-4 mobile:py-[33px] [&_h3]:mt-[11px] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-[-0.3px]"><h1 className="text-[28px] font-semibold">Not found.</h1><Button asChild variant="ghost" size="default" className="min-h-[46px] gap-[9px] rounded-[7px] border border-transparent px-5 py-[13px] text-xs font-bold hover:bg-transparent"><a href="#/">Back to rules <Icon name="arrow" /></a></Button></div>
        )}
      </main>
    </div>
  )
}

type WorkspaceProps = {
  entries: HeaderEntry[]
  view: HeaderEntry['kind']
  pending: boolean
  onToggle: (entry: HeaderEntry, enabled: boolean) => void
  onSelectOption: (switcher: HeaderSwitcher, optionId: string) => void
}

function Workspace({ entries, view, pending, onToggle, onSelectOption }: WorkspaceProps) {
  const [queries, setQueries] = useState({ rule: '', switcher: '' })
  const query = queries[view]
  const isSwitchers = view === 'switcher'
  const noun = isSwitchers ? 'switcher' : 'rule'
  const plural = isSwitchers ? 'switchers' : 'rules'
  const newRoute = isSwitchers ? '#/switchers/new' : '#/new'
  const group = entries.filter((entry) => entry.kind === view)
  const visible = group.filter((entry) => {
    const term = query.trim().toLowerCase()
    const options = entry.kind === 'switcher'
      ? entry.options.map((option) => `${option.name} ${option.headers.map((header) => header.key).join(' ')}`).join(' ')
      : getEntryHeaders(entry).map((header) => header.key).join(' ')
    return !term || `${entry.name} ${entry.url} ${options}`.toLowerCase().includes(term)
  })


  return (
    <Tabs value={view} onValueChange={(value) => { window.location.hash = value === 'switcher' ? '/switchers' : '/' }} className="animate-[rise-in_550ms_80ms_both] gap-0">
      <TabsList aria-label="Header settings" className="mb-6">
        <TabsTrigger value="rule">Rules</TabsTrigger>
        <TabsTrigger value="switcher">Switchers</TabsTrigger>
      </TabsList>
      <TabsContent value={view}>
        <div className="mb-5 flex items-center justify-between gap-5 mobile:gap-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:flex [&_h1]:items-center [&_h1]:gap-2.5 mobile:[&_h1]:gap-2 mobile:[&_h1]:whitespace-nowrap">
          <h1>{isSwitchers ? 'Switchers' : 'Rules'}</h1>
          <Button asChild className="mobile:px-3 mobile:text-xs mobile:shrink-0 mobile:whitespace-nowrap"><a href={newRoute}><Icon name="plus" /> {isSwitchers ? 'New Switcher' : 'New Rule'}</a></Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card shadow-panel">
          <div className="flex min-h-[66px] items-center gap-5 border-b px-6 py-[17px] mobile:px-[15px] mobile:py-3.5 mobile:flex-col mobile:items-stretch mobile:gap-2.5">
            <label className="flex w-full min-w-0 items-center gap-2 text-muted-foreground focus-within:text-foreground focus-within:shadow-[0_1px_0_var(--ring)] [&>svg]:size-[15px]">
              <Icon name="search" />
              <Input className="h-auto flex-1 rounded-none border-0 bg-transparent px-0 py-2 text-[11px] shadow-none focus:bg-transparent focus:ring-0 placeholder:text-muted-foreground" aria-label={`Search ${plural}`} placeholder={`Find a ${noun}...`} value={query} onChange={(event) => setQueries({ ...queries, [view]: event.target.value })} />
              {query && <Button variant="ghost" type="button" className="size-[26px] text-muted-foreground [&_svg]:size-[15px]" aria-label="Clear search" onClick={() => setQueries({ ...queries, [view]: '' })}><Icon name="close" /></Button>}
            </label>
          </div>
          {!group.length ? (
            <div className="flex flex-col items-center px-5 pt-[45px] pb-11 text-center mobile:px-4 mobile:py-[33px] [&_h3]:mt-[11px] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-[-0.3px]">
              <h3>No {plural} yet</h3>
              <Button asChild className="mt-[23px] mobile:px-3 mobile:text-xs mobile:shrink-0 mobile:whitespace-nowrap"><a href={newRoute}>
                <Icon name="plus" /> {isSwitchers ? 'New Switcher' : 'New Rule'}
              </a></Button>
            </div>
          ) : visible.length ? (
            isSwitchers ? (
              <SwitchersList switchers={visible.filter((entry): entry is HeaderSwitcher => entry.kind === 'switcher')} disabled={pending} switcherHref={(switcher) => `#${entryRoute(switcher)}`} onToggle={onToggle} onSelectOption={onSelectOption} />
            ) : (
              <>
                <div className="grid grid-cols-[32px_minmax(0,1fr)_92px] gap-4 px-6 pt-[17px] pb-2 text-[8px] tracking-[1.1px] text-muted-foreground tablet:grid-cols-[32px_minmax(0,1fr)_68px] mobile:hidden" aria-hidden="true"><span /><span>RULE / URL PATTERN</span><span>HEADERS</span></div>
                <RulesList rules={visible.filter((entry): entry is HeaderRule => entry.kind === 'rule')} disabled={pending} ruleHref={(rule) => `#${entryRoute(rule)}`} onToggle={onToggle} />
              </>
            )
          ) : (
            <div className="flex flex-col items-center px-5 pt-[45px] pb-11 text-center mobile:px-4 mobile:py-[33px] [&_h3]:mt-[11px] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-[-0.3px] min-h-[290px] justify-center [&>svg]:size-7 [&>svg]:text-muted-foreground [&>button]:mt-5"><Icon name="search" /><h3>No matching {plural}.</h3><Button variant="outline" className="h-auto min-h-[46px] px-5 py-[13px] text-xs font-bold" onClick={() => setQueries({ ...queries, [view]: '' })}>Show all {plural}</Button></div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
