import { startTransition, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'

import { Brand } from '../components/Brand'
import { Icon } from '../components/Icon'
import { RulesList } from '../components/RulesList'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { isValidUrlPattern } from '../lib/pattern'
import {
  createHeaderPair,
  createRuleDraft,
  createRuleId,
  getRules,
  ruleToDraft,
  saveRules,
  subscribeToRules,
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

    void load()
    const unsubscribe = subscribeToRules((nextRules) => {
      if (alive) startTransition(() => setRules(nextRules))
    })
    return () => {
      alive = false
      unsubscribe()
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
      order: ruleId
        ? (rules.find((rule) => rule.id === ruleId)?.order ?? rules.length)
        : rules.length,
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
      await persistRules(
        rules.filter((currentRule) => currentRule.id !== rule.id),
      )
      window.location.hash = '/'
    } catch {
      setError('Could not delete the rule. Try again.')
    }
  }

  async function handleToggleRule(ruleId: string, enabled: boolean) {
    try {
      await persistRules(
        rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)),
      )
    } catch {
      setError('Could not change rule state. Try again.')
    }
  }

  const selectedRule = rules.find(
    (rule) => route === `/rules/${encodeURIComponent(rule.id)}`,
  )
  const isHome = route === '/'

  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
      </header>
      <main className="page">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="loading-state" role="status">
            <span className="loading-dot" /> Loading your rules...
          </div>
        ) : loadFailed ? null : isHome ? (
          <RulesWorkspace
            rules={rules}
            pending={pending}
            onToggle={(rule, enabled) => {
              void handleToggleRule(rule.id, enabled)
            }}
          />
        ) : route === '/new' || selectedRule ? (
          <RuleEditor
            key={route}
            rule={selectedRule}
            pending={pending}
            onSave={(draft) => handleSaveRule(draft, selectedRule?.id)}
            onDelete={
              selectedRule
                ? () => {
                    void handleDeleteRule(selectedRule)
                  }
                : undefined
            }
          />
        ) : (
          <div className="empty-state">
            <h1>Rule not found.</h1>
            <a className="button" href="#/">
              Back to rules <Icon name="arrow" />
            </a>
          </div>
        )}
      </main>
    </div>
  )
}

function RulesWorkspace({
  rules,
  pending,
  onToggle,
}: {
  rules: HeaderRule[]
  pending: boolean
  onToggle: (rule: HeaderRule, enabled: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const visibleRules = rules.filter((rule) => {
    const term = query.trim().toLowerCase()
    return (
      !term ||
      `${rule.name} ${rule.url} ${rule.headers.map((header) => header.key).join(' ')}`
        .toLowerCase()
        .includes(term)
    )
  })

  return (
    <section className="rules-section" aria-labelledby="rules-title">
      <div className="section-heading">
        <h1 id="rules-title">Request rules</h1>
        <a className="button button-primary" href="#/new">
          <Icon name="plus" /> New rule
        </a>
      </div>
      <div className="rulebook">
        <div className="rules-toolbar">
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="Search rules"
              placeholder="Find a rule..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <Icon name="close" />
              </button>
            )}
          </label>
        </div>
        {rules.length === 0 ? (
          <div className="empty-state">
            <h3>No rules yet</h3>
            <a className="empty-link" href="#/new">
              Create your first rule <Icon name="arrow" />
            </a>
          </div>
        ) : visibleRules.length ? (
          <>
            <div className="list-columns" aria-hidden="true">
              <span>RULE / URL PATTERN</span>
              <span>HEADERS</span>
            </div>
            <RulesList
              rules={visibleRules}
              disabled={pending}
              ruleHref={(rule) => `#/rules/${encodeURIComponent(rule.id)}`}
              onToggle={onToggle}
            />
          </>
        ) : (
          <div className="empty-state filtered-empty">
            <Icon name="search" />
            <h3>No matching rules.</h3>
            <button
              className="button button-secondary"
              onClick={() => {
                setQuery('')
              }}
            >
              Show all rules
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

type RuleEditorProps = {
  rule?: HeaderRule
  pending: boolean
  onSave: (draft: RuleDraft) => Promise<HeaderRule>
  onDelete?: () => void
}

function RuleEditor({ rule, pending, onSave, onDelete }: RuleEditorProps) {
  const [draft, setDraft] = useState<RuleDraft>(() =>
    rule ? ruleToDraft(rule) : createRuleDraft(),
  )
  const [saveState, setSaveState] = useState<SaveState>(initialSaveState)

  function updateHeader(index: number, field: keyof HeaderPair, value: string) {
    setDraft((current) => ({
      ...current,
      headers: current.headers.map((header, i) =>
        i === index ? { ...header, [field]: value } : header,
      ),
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
      setSaveState({
        tone: 'error',
        message: 'Could not save the rule. Try again.',
      })
    }
  }

  return (
    <section className="editor" aria-labelledby="editor-title">
      <a className="back-link" href="#/">
        <Icon name="back" /> Back to rules
      </a>
      <div className="editor-heading">
        <h1 id="editor-title">{rule ? 'Edit rule' : 'New rule'}</h1>
      </div>
      <form
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
      >
        <fieldset disabled={pending}>
          <div className="editor-card">
            <div className="card-heading">
              <div>
                <h2>Rule details</h2>
              </div>
            </div>
            <div className="details-fields">
              <label className="field">
                Rule name
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="Authenticated API"
                  autoFocus
                  required
                />
              </label>
              <label className="field">
                URL pattern
                <input
                  className="mono-input"
                  value={draft.url}
                  onChange={(event) =>
                    setDraft({ ...draft, url: event.target.value })
                  }
                  placeholder="*://api.example.com/*"
                  aria-label="URL pattern"
                  required
                />
              </label>
            </div>
            <div className="enabled-setting">
              <span className="setting-title">Enabled</span>
              <ToggleSwitch
                checked={draft.enabled}
                label="Rule enabled"
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
            </div>
          </div>
          <div className="editor-card">
            <div className="card-heading">
              <div>
                <h2>Request headers</h2>
              </div>
              <button
                className="button button-secondary add-header"
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    headers: [...draft.headers, createHeaderPair()],
                  })
                }
              >
                <Icon name="plus" /> Add header
              </button>
            </div>
            <div className="header-list">
              {draft.headers.map((header, index) => (
                <div className="header-row" key={index}>
                  <span className="header-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <label className="field">
                    Name
                    <input
                      className="mono-input"
                      value={header.key}
                      onChange={(event) =>
                        updateHeader(index, 'key', event.target.value)
                      }
                      placeholder="Authorization"
                      aria-label={`Header ${index + 1} name`}
                    />
                  </label>
                  <label className="field">
                    Value
                    <input
                      className="mono-input"
                      value={header.value}
                      onChange={(event) =>
                        updateHeader(index, 'value', event.target.value)
                      }
                      placeholder="Bearer token"
                      aria-label={`Header ${index + 1} value`}
                    />
                  </label>
                  <button
                    className="icon-button remove-header"
                    type="button"
                    aria-label={`Remove header ${index + 1}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        headers:
                          draft.headers.length === 1
                            ? [createHeaderPair()]
                            : draft.headers.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {saveState.message && (
            <p
              className={`notice ${saveState.tone === 'error' ? 'error' : 'success'}`}
              role={saveState.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon name={saveState.tone === 'error' ? 'close' : 'check'} />
              {saveState.message}
            </p>
          )}
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              <Icon name="check" />
              {pending ? 'Saving...' : 'Save rule'}
            </button>
            <a className="cancel-link" href="#/">
              Cancel
            </a>
            {onDelete && (
              <button
                type="button"
                className="delete-button"
                onClick={onDelete}
              >
                Delete rule
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  )
}

function sanitizeHeaders(headers: HeaderPair[]): HeaderPair[] {
  return headers
    .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
    .filter((header) => header.key || header.value)
}

function validateDraft(draft: RuleDraft): string | null {
  if (!draft.name.trim()) return 'Rule name is required.'
  if (!draft.url.trim()) return 'URL pattern is required.'
  if (!isValidUrlPattern(draft.url.trim()))
    return 'Use * or a wildcard URL pattern like *://api.example.com/*.'
  const headers = sanitizeHeaders(draft.headers)
  if (headers.length === 0) return 'Add at least one header pair.'
  if (headers.some((header) => !header.key || !header.value))
    return 'Each header row needs both a name and a value.'
  return null
}
