import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { isValidUrlPattern } from '../lib/pattern'
import { createHeaderPair, createRuleDraft, ruleToDraft } from '../lib/rules'
import type { HeaderPair, HeaderRule, RuleDraft } from '../lib/types'
import { Icon } from './Icon'
import { ToggleSwitch } from './ToggleSwitch'

type SaveState = { tone: 'idle' | 'success' | 'error'; message: string }
const initialSaveState: SaveState = { tone: 'idle', message: '' }

type RuleEditorProps = {
  rule?: HeaderRule
  pending: boolean
  onSave: (draft: RuleDraft) => Promise<HeaderRule>
  onDelete?: () => void
}

export function RuleEditor({ rule, pending, onSave, onDelete }: RuleEditorProps) {
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
    <section className="editor rule-editor" aria-labelledby="editor-title">
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
