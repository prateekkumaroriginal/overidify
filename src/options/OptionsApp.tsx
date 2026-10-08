import { startTransition, useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'

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
    if (!existingId) window.location.hash = entryRoute(entry)
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
    <div className="app-shell">
      <header className="site-header"><Brand /></header>
      <main className="page">
        {error && <p className="notice error" role="alert">{error}</p>}
        {loading ? (
          <div className="loading-state" role="status"><span className="loading-dot" /> Loading...</div>
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
          <div className="empty-state"><h1>Not found.</h1><a className="button" href="#/">Back to rules <Icon name="arrow" /></a></div>
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

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextSwitchers = event.key === 'End' || (event.key !== 'Home' && !isSwitchers)
    window.location.hash = nextSwitchers ? '/switchers' : '/'
    document.getElementById(nextSwitchers ? 'switchers-tab' : 'rules-tab')?.focus()
  }

  return (
    <section className="rules-section">
      <div className="workspace-tabs" role="tablist" aria-label="Header settings">
        <button id="rules-tab" type="button" role="tab" aria-selected={!isSwitchers} aria-controls="workspace-panel" tabIndex={isSwitchers ? -1 : 0} onClick={() => { window.location.hash = '/' }} onKeyDown={handleTabKey}>Rules</button>
        <button id="switchers-tab" type="button" role="tab" aria-selected={isSwitchers} aria-controls="workspace-panel" tabIndex={isSwitchers ? 0 : -1} onClick={() => { window.location.hash = '/switchers' }} onKeyDown={handleTabKey}>Switchers</button>
      </div>
      <div id="workspace-panel" role="tabpanel" aria-labelledby={isSwitchers ? 'switchers-tab' : 'rules-tab'}>
        <div className="section-heading">
          <h1>{isSwitchers ? 'Switchers' : 'Rules'}</h1>
          <a className="button button-primary" href={newRoute}><Icon name="plus" /> {isSwitchers ? 'New Switcher' : 'New Rule'}</a>
        </div>
        <div className="rulebook">
          <div className="rules-toolbar">
            <label className="search-field">
              <Icon name="search" />
              <input aria-label={`Search ${plural}`} placeholder={`Find a ${noun}...`} value={query} onChange={(event) => setQueries({ ...queries, [view]: event.target.value })} />
              {query && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => setQueries({ ...queries, [view]: '' })}><Icon name="close" /></button>}
            </label>
          </div>
          {!group.length ? (
            <div className="empty-state">
              <h3>No {plural} yet</h3>
              <a className="button button-primary empty-create-button" href={newRoute}>
                <Icon name="plus" /> {isSwitchers ? 'New Switcher' : 'New Rule'}
              </a>
            </div>
          ) : visible.length ? (
            isSwitchers ? (
              <SwitchersList switchers={visible.filter((entry): entry is HeaderSwitcher => entry.kind === 'switcher')} disabled={pending} switcherHref={(switcher) => `#${entryRoute(switcher)}`} onToggle={onToggle} onSelectOption={onSelectOption} />
            ) : (
              <>
                <div className="list-columns" aria-hidden="true"><span>RULE / URL PATTERN</span><span>HEADERS</span></div>
                <RulesList rules={visible.filter((entry): entry is HeaderRule => entry.kind === 'rule')} disabled={pending} ruleHref={(rule) => `#${entryRoute(rule)}`} onToggle={onToggle} />
              </>
            )
          ) : (
            <div className="empty-state filtered-empty"><Icon name="search" /><h3>No matching {plural}.</h3><button className="button button-secondary" onClick={() => setQueries({ ...queries, [view]: '' })}>Show all {plural}</button></div>
          )}
        </div>
      </div>
    </section>
  )
}
