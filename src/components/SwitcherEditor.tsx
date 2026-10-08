import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { isValidUrlPattern } from '../lib/pattern'
import {
  createHeaderPair,
  createSwitcherDraft,
  createSwitcherOption,
  switcherToDraft,
  sanitizeHeaders,
} from '../lib/rules'
import type { HeaderPair, HeaderSwitcher, SwitcherDraft, SwitcherOption } from '../lib/types'
import { Icon } from './Icon'
import { ToggleSwitch } from './ToggleSwitch'

type SwitcherEditorProps = {
  switcher?: HeaderSwitcher
  pending: boolean
  onSave: (draft: SwitcherDraft) => Promise<HeaderSwitcher>
  onDelete?: () => void
}

type SaveState = { tone: 'idle' | 'success' | 'error'; message: string }
type DeletedOption = { option: SwitcherOption; index: number; selectedOptionId: string }

export function SwitcherEditor({ switcher, pending, onSave, onDelete }: SwitcherEditorProps) {
  const [draft, setDraft] = useState<SwitcherDraft>(() => switcher ? switcherToDraft(switcher) : createSwitcherDraft())
  const [editingId, setEditingId] = useState(draft.selectedOptionId)
  const [deletedOption, setDeletedOption] = useState<DeletedOption | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ tone: 'idle', message: '' })
  const optionNameInput = useRef<HTMLInputElement>(null)
  const editingOption = draft.options.find((option) => option.id === editingId) ?? draft.options[0]

  function updateOption(update: (option: SwitcherOption) => SwitcherOption) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => option.id === editingOption.id ? update(option) : option),
    }))
    setSaveState({ tone: 'idle', message: '' })
  }

  function updateHeader(index: number, field: keyof HeaderPair, value: string) {
    updateOption((option) => ({
      ...option,
      headers: option.headers.map((header, i) => i === index ? { ...header, [field]: value } : header),
    }))
  }

  function addOption() {
    let number = draft.options.length + 1
    while (draft.options.some((option) => option.name.trim().toLowerCase() === `option ${number}`)) number++
    const option = createSwitcherOption(`Option ${number}`)
    setDraft((current) => ({ ...current, options: [...current.options, option] }))
    setEditingId(option.id)
    requestAnimationFrame(() => optionNameInput.current?.focus())
    setSaveState({ tone: 'idle', message: '' })
  }

  function deleteOption() {
    if (draft.options.length < 2) return
    const index = draft.options.findIndex((option) => option.id === editingOption.id)
    const options = draft.options.filter((option) => option.id !== editingOption.id)
    setDeletedOption({ option: editingOption, index, selectedOptionId: draft.selectedOptionId })
    setDraft({
      ...draft,
      options,
      selectedOptionId: draft.selectedOptionId === editingOption.id ? options[0].id : draft.selectedOptionId,
    })
    setEditingId(options[Math.min(index, options.length - 1)].id)
    requestAnimationFrame(() => optionNameInput.current?.focus())
    setSaveState({ tone: 'idle', message: '' })
  }

  function undoDelete() {
    if (!deletedOption) return
    setDraft((current) => {
      const options = [...current.options]
      options.splice(deletedOption.index, 0, deletedOption.option)
      return { ...current, options, selectedOptionId: deletedOption.selectedOptionId }
    })
    setEditingId(deletedOption.option.id)
    requestAnimationFrame(() => optionNameInput.current?.focus())
    setDeletedOption(null)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = validateDraft(draft)
    if (error) {
      if (error.optionId) setEditingId(error.optionId)
      setSaveState({ tone: 'error', message: error.message })
      return
    }
    try {
      const savedRule = await onSave(draft)
      setDraft(switcherToDraft(savedRule))
      setDeletedOption(null)
      setSaveState({ tone: 'success', message: 'Switcher saved.' })
    } catch {
      setSaveState({ tone: 'error', message: 'Could not save the switcher. Try again.' })
    }
  }

  return (
    <section className="editor switcher-editor" aria-labelledby="editor-title">
      <a className="back-link" href="#/switchers"><Icon name="back" /> Back to switchers</a>
      <div className="editor-heading"><h1 id="editor-title">{switcher ? 'Edit switcher' : 'New switcher'}</h1></div>
      <form onSubmit={(event) => { void handleSubmit(event) }}>
        <fieldset disabled={pending}>
          <div className="editor-card">
            <div className="card-heading"><h2>Switcher details</h2></div>
            <div className="details-fields">
              <label className="field">Switcher name
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Authenticated API" autoFocus required />
              </label>
              <label className="field">URL pattern
                <input className="mono-input" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="*://api.example.com/*" required />
              </label>
            </div>
            <div className="enabled-setting">
              <span className="setting-title">Enabled</span>
              <ToggleSwitch checked={draft.enabled} label="Switcher enabled" onChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>
          </div>
          <div className="editor-card options-card">
            <div className="card-heading">
              <h2>Options</h2>
              <button className="option-add" type="button" onClick={addOption}>Add option</button>
            </div>
            <div className="option-layout">
              <div className="option-list" aria-label="Options to edit">
                {draft.options.map((option) => (
                  <div className={`option-list-row ${option.id === editingOption.id ? 'selected' : ''}`} key={option.id}>
                    <button className="option-list-choice" type="button" aria-pressed={option.id === editingOption.id} onClick={() => setEditingId(option.id)}>
                      {option.name || 'Untitled'}
                    </button>
                    {option.id === editingOption.id && (
                      <button
                        className="icon-button delete-option"
                        type="button"
                        aria-label={`Delete option ${option.name || 'Untitled'}`}
                        title={draft.options.length === 1 ? 'At least one option is required' : 'Delete option'}
                        disabled={draft.options.length === 1}
                        onClick={deleteOption}
                      ><Icon name="trash" /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="option-pane" key={editingOption.id}>
                <label className="field option-name-field">Option name
                  <input ref={optionNameInput} value={editingOption.name} onChange={(event) => updateOption((option) => ({ ...option, name: event.target.value }))} />
                </label>
                <div className="header-list">
                  {editingOption.headers.map((header, index) => (
                    <div className="header-row" key={index}>
                      <label className="field">Header
                        <input className="mono-input" value={header.key} onChange={(event) => updateHeader(index, 'key', event.target.value)} placeholder="Authorization" aria-label={`Header ${index + 1} name`} />
                      </label>
                      <label className="field">Value
                        <input className="mono-input" value={header.value} onChange={(event) => updateHeader(index, 'value', event.target.value)} placeholder="Bearer token" aria-label={`Header ${index + 1} value`} />
                      </label>
                      <button className="icon-button remove-header" type="button" aria-label={`Remove header ${index + 1}`} onClick={() => updateOption((option) => ({ ...option, headers: option.headers.filter((_, i) => i !== index) }))}><Icon name="close" /></button>
                    </div>
                  ))}
                </div>
                <button className="option-add add-option-header" type="button" onClick={() => updateOption((option) => ({ ...option, headers: [...option.headers, createHeaderPair()] }))}>Add header</button>
              </div>
            </div>
            {deletedOption && <div className="option-deleted" role="status"><span>{deletedOption.option.name} deleted</span><button type="button" onClick={undoDelete}>Undo</button></div>}
          </div>
          {saveState.message && <p className={`notice ${saveState.tone === 'error' ? 'error' : 'success'}`} role={saveState.tone === 'error' ? 'alert' : 'status'}>{saveState.message}</p>}
          <div className="form-actions">
            {onDelete && <button type="button" className="delete-button" onClick={onDelete}>Delete switcher</button>}
            <a className="cancel-link" href="#/switchers">Cancel</a>
            <button className="button button-primary" type="submit">{pending ? 'Saving...' : 'Save switcher'}</button>
          </div>
        </fieldset>
      </form>
    </section>
  )
}

function validateDraft(draft: SwitcherDraft): { message: string; optionId?: string } | null {
  if (!draft.name.trim()) return { message: 'Switcher name is required.' }
  if (!draft.url.trim()) return { message: 'URL pattern is required.' }
  if (!isValidUrlPattern(draft.url.trim())) return { message: 'Use * or a wildcard URL pattern like *://api.example.com/*.' }
  const names = new Set<string>()
  for (const option of draft.options) {
    const name = option.name.trim()
    if (!name) return { message: 'Option name is required.', optionId: option.id }
    if (names.has(name.toLowerCase())) return { message: 'Give each option a different name.', optionId: option.id }
    names.add(name.toLowerCase())
    const headers = sanitizeHeaders(option.headers)
    if (!headers.length) return { message: `${name}: add at least one header pair.`, optionId: option.id }
    if (headers.some((header) => !header.key || !header.value)) return { message: `${name}: each header needs a name and a value.`, optionId: option.id }
  }
  return null
}
