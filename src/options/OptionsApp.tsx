import { startTransition, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'

import { RulesList } from '../components/RulesList'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { isValidUrlPattern } from '../lib/dnr'
import {
  createHeaderPair,
  createRuleDraft,
  createRuleId,
  getRules,
  normalizeRules,
  ruleToDraft,
  saveRules,
  STORAGE_KEY,
} from '../lib/storage'
import type { HeaderPair, HeaderRule, RuleDraft } from '../lib/types'

type SaveState = {
  tone: 'idle' | 'success' | 'error'
  message: string
}

const initialSaveState: SaveState = { tone: 'idle', message: '' }

function readRoute() {
  return window.location.hash.slice(1) || '/'
}

export function OptionsApp() {
  const [rules, setRules] = useState<HeaderRule[]>([])
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

    async function load() {
      try {
        const nextRules = await getRules()
        if (alive) {
          startTransition(() => {
            setRules(nextRules)
            setLoading(false)
          })
        }
      } catch {
        if (alive) {
          setError('Could not load rules. Reopen this page to try again.')
          setLoadFailed(true)
          setLoading(false)
        }
      }
    }

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && STORAGE_KEY in changes) {
        startTransition(() => setRules(normalizeRules(changes[STORAGE_KEY]?.newValue)))
      }
    }

    void load()
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      alive = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  async function persistRules(nextRules: HeaderRule[]) {
    setPending(true)
    setError('')
    try {
      const savedRules = await saveRules(nextRules)
      setRules(savedRules)
      return savedRules
    } finally {
      setPending(false)
    }
  }

  async function handleSaveRule(draft: RuleDraft, ruleId?: string) {
    const nextRule: HeaderRule = {
      id: ruleId ?? createRuleId(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      enabled: draft.enabled,
      headers: sanitizeHeaders(draft.headers),
      order: ruleId ? rules.find((rule) => rule.id === ruleId)?.order ?? rules.length : rules.length,
    }
    const nextRules = ruleId
      ? rules.map((rule) => (rule.id === ruleId ? nextRule : rule))
      : [...rules, nextRule]
    await persistRules(nextRules)
    if (!ruleId) {
      window.location.hash = `/rules/${encodeURIComponent(nextRule.id)}`
    }
    return nextRule
  }

  async function handleDeleteRule(rule: HeaderRule) {
    if (!window.confirm(`Delete "${rule.name}"?`)) {
      return
    }
    try {
      await persistRules(rules.filter((currentRule) => currentRule.id !== rule.id))
      window.location.hash = '/'
    } catch {
      setError('Could not delete the rule. Try again.')
    }
  }

  async function handleToggleRule(ruleId: string, enabled: boolean) {
    try {
      await persistRules(rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)))
    } catch {
      setError('Could not change rule state. Try again.')
    }
  }

  const selectedRule = rules.find((rule) => route === `/rules/${encodeURIComponent(rule.id)}`)
  const isHome = route === '/'

  return (
    <main className="page">
      <header className="page-header">
        <a className="brand" href="#/">Overidify</a>
        {isHome ? <a className="button" href="#/new" aria-disabled={loading || loadFailed}
          onClick={(event) => { if (loading || loadFailed) event.preventDefault() }}>New rule</a> : <a href="#/">Back to rules</a>}
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {loading ? <p className="muted" role="status">Loading rules...</p> : loadFailed ? null : isHome ? (
        <section aria-labelledby="rules-title">
          <h1 id="rules-title">Rules</h1>
          {rules.length === 0 ? <p className="muted">No rules yet. Create a rule to get started.</p> : (
            <RulesList rules={rules} disabled={pending}
              ruleHref={(rule) => `#/rules/${encodeURIComponent(rule.id)}`}
              onToggle={(rule, enabled) => { void handleToggleRule(rule.id, enabled) }} />
          )}
        </section>
      ) : route === '/new' || selectedRule ? (
        <RuleEditor key={route} rule={selectedRule} pending={pending}
          onSave={(draft) => handleSaveRule(draft, selectedRule?.id)}
          onDelete={selectedRule ? () => { void handleDeleteRule(selectedRule) } : undefined} />
      ) : <p className="muted">Rule not found. <a href="#/">Back to rules</a></p>}
    </main>
  )
}

type RuleEditorProps = {
  rule?: HeaderRule
  pending: boolean
  onSave: (draft: RuleDraft) => Promise<HeaderRule>
  onDelete?: () => void
}

function RuleEditor({ rule, pending, onSave, onDelete }: RuleEditorProps) {
  const [draft, setDraft] = useState<RuleDraft>(() => rule ? ruleToDraft(rule) : createRuleDraft())
  const [saveState, setSaveState] = useState<SaveState>(initialSaveState)

  function updateHeader(index: number, field: keyof HeaderPair, value: string) {
    setDraft((current) => ({ ...current,
      headers: current.headers.map((header, i) => i === index ? { ...header, [field]: value } : header),
    }))
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateDraft(draft)
    if (validationError) {
      setSaveState({ tone: 'error', message: validationError })
      return
    }
    try {
      const savedRule = await onSave(draft)
      setDraft(ruleToDraft(savedRule))
      setSaveState({ tone: 'success', message: 'Rule saved.' })
    } catch {
      setSaveState({ tone: 'error', message: 'Could not save the rule. Try again.' })
    }
  }

  return (
    <section aria-labelledby="editor-title">
      <h1 id="editor-title">{rule ? 'Edit rule' : 'New rule'}</h1>
      <form onSubmit={(event) => { void handleSubmit(event) }}>
        <fieldset disabled={pending}>
          <label className="field">
            Rule name
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Authenticated API" autoFocus required />
          </label>
          <label className="field">
            URL pattern
            <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              placeholder="*://api.example.com/*" aria-describedby="url-help" required />
          </label>
          <p className="hint" id="url-help">Use * for all requests or a wildcard pattern such as *://api.example.com/*.</p>
          <label className="checkbox-label">
            <ToggleSwitch checked={draft.enabled} label="Rule enabled"
              onChange={(enabled) => setDraft({ ...draft, enabled })} />
            Enabled
          </label>

          <div className="section-header">
            <h2>Headers</h2>
            <button type="button" onClick={() => setDraft({ ...draft, headers: [...draft.headers, createHeaderPair()] })}>Add header</button>
          </div>
          <div className="header-list">
            {draft.headers.map((header, index) => (
              <div className="header-row" key={index}>
                <label className="field">Name
                  <input value={header.key} onChange={(event) => updateHeader(index, 'key', event.target.value)}
                    placeholder="Authorization" aria-label={`Header ${index + 1} name`} />
                </label>
                <label className="field">Value
                  <input value={header.value} onChange={(event) => updateHeader(index, 'value', event.target.value)}
                    placeholder="Bearer token" aria-label={`Header ${index + 1} value`} />
                </label>
                <button type="button" aria-label={`Remove header ${index + 1}`}
                  onClick={() => setDraft({ ...draft, headers: draft.headers.length === 1
                    ? [createHeaderPair()] : draft.headers.filter((_, i) => i !== index) })}>Remove</button>
              </div>
            ))}
          </div>
          {saveState.message && <p className={saveState.tone === 'error' ? 'error' : 'muted'}
            role={saveState.tone === 'error' ? 'alert' : 'status'}>{saveState.message}</p>}
          <div className="form-actions">
            <button type="submit">{pending ? 'Saving...' : 'Save rule'}</button>
            <a href="#/">Cancel</a>
            {onDelete && <button type="button" className="delete-button" onClick={onDelete}>Delete rule</button>}
          </div>
        </fieldset>
      </form>
    </section>
  )
}

function sanitizeHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers.map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key || header.value)
}

function validateDraft(draft: RuleDraft): string | null {
  if (!draft.name.trim()) return 'Rule name is required.'
  if (!draft.url.trim()) return 'URL pattern is required.'
  if (!isValidUrlPattern(draft.url.trim())) return 'Use * or a wildcard URL pattern like *://api.example.com/*.'
  const headers = sanitizeHeaders(draft.headers)
  if (headers.length === 0) return 'Add at least one header pair.'
  if (headers.some((header) => !header.key || !header.value)) return 'Each header row needs both a name and a value.'
  return null
}
