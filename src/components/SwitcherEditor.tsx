import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { useEditorShortcuts } from './useEditorShortcuts'

type SwitcherEditorProps = {
  switcher?: HeaderSwitcher
  pending: boolean
  onSave: (draft: SwitcherDraft) => Promise<HeaderSwitcher>
  onDelete?: () => void
}

type SaveState = { tone: 'idle' | 'success' | 'error'; message: string }
type DeletedOption = { option: SwitcherOption; index: number; selectedOptionId: string }

export function SwitcherEditor({ switcher, pending, onSave, onDelete }: SwitcherEditorProps) {
  const formRef = useEditorShortcuts('/switchers', pending)
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

  function deleteOption(optionId: string) {
    if (draft.options.length < 2) return
    const index = draft.options.findIndex((option) => option.id === optionId)
    if (index === -1) return
    const options = draft.options.filter((option) => option.id !== optionId)
    setDeletedOption({ option: draft.options[index], index, selectedOptionId: draft.selectedOptionId })
    setDraft({
      ...draft,
      options,
      selectedOptionId: draft.selectedOptionId === optionId ? options[0].id : draft.selectedOptionId,
    })
    if (editingOption.id === optionId) {
      setEditingId(options[Math.min(index, options.length - 1)].id)
      requestAnimationFrame(() => optionNameInput.current?.focus())
    }
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
    if (pending) return
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
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="editor-title">
      <a className="inline-flex items-center gap-2 text-[11px] text-muted-foreground no-underline hover:text-primary [&_svg]:w-[15px]" href="#/switchers"><Icon name="back" /> Back to switchers</a>
      <div className="mt-[27px] mb-[30px] mobile:mt-5 [&_h1]:text-xl [&_h1]:leading-[1.4] [&_h1]:font-semibold"><h1 id="editor-title">{switcher ? 'Edit switcher' : 'New switcher'}</h1></div>
      <form ref={formRef} onSubmit={(event) => { void handleSubmit(event) }}>
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={pending}>
          <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
            <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]"><h2>Switcher details</h2></div>
            <div className="mb-[22px] grid grid-cols-[1fr_1.35fr] gap-6 mobile:grid-cols-1 mobile:gap-[17px]">
              <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">Switcher name
                <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Authenticated API" autoFocus required />
              </label>
              <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">URL pattern
                <Input className="font-mono text-[11px]" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="e.g. *://api.example.com/*" required />
              </label>
            </div>
            <div className="flex items-center justify-between gap-5 border-t py-[17px]">
              <span className="text-[11px] font-semibold">Enabled</span>
              <ToggleSwitch checked={draft.enabled} label="Switcher enabled" onChange={(enabled) => setDraft({ ...draft, enabled })} />
            </div>
          </div>
          <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5 pb-6 mobile:pb-5">
            <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]">
              <h2>Options</h2>
              <Button variant="secondary" type="button" onClick={addOption}><Icon name="plus" />Add option</Button>
            </div>
            <div className="grid grid-cols-[164px_minmax(0,1fr)] gap-6 mobile:grid-cols-1 mobile:gap-5">
              <div className="flex min-w-0 flex-col gap-1.5 self-start border-r pr-4 mobile:flex-row mobile:flex-wrap mobile:border-r-0 mobile:border-b mobile:pr-0 mobile:pb-4" aria-label="Options to edit">
                {draft.options.map((option) => (
                  <div data-selected={option.id === editingOption.id} className="group flex min-w-0 items-center rounded-md border border-transparent hover:bg-accent data-[selected=true]:border-input data-[selected=true]:bg-selection" key={option.id}>
                    <Button variant="ghost" className="h-auto min-w-0 flex-1 shrink justify-start p-2.5 text-left rounded-none text-xs text-muted-foreground whitespace-normal wrap-anywhere group-data-[selected=true]:text-primary hover:bg-transparent" type="button" aria-pressed={option.id === editingOption.id} onClick={() => setEditingId(option.id)}>
                      {option.name || 'Untitled'}
                    </Button>
                    {draft.options.length > 1 && (
                      <Button variant="ghost" className="invisible mr-[3px] size-[26px] text-muted-foreground group-hover:visible group-focus-within:visible group-data-[selected=true]:visible hover:bg-destructive/10 hover:text-destructive [&_svg]:size-[15px]"
                        type="button"
                        aria-label={`Delete option ${option.name || 'Untitled'}`}
                        title="Delete option"
                        onClick={() => deleteOption(option.id)}
                      ><Icon name="trash" /></Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="min-w-0" key={editingOption.id}>
                <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1 mb-5">Option name
                  <Input ref={optionNameInput} value={editingOption.name} onChange={(event) => updateOption((option) => ({ ...option, name: event.target.value }))} />
                </label>
                <div className="min-w-0">
                  {editingOption.headers.map((header, index) => (
                    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_26px] items-end gap-3 mobile:grid-cols-[1fr_26px] mobile:items-center mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0" key={index}>
                      <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">{index === 0 && 'Header'}
                        <Input className="font-mono text-[11px]" value={header.key} onChange={(event) => updateHeader(index, 'key', event.target.value)} placeholder="e.g. Authorization" aria-label={`Header ${index + 1} name`} />
                      </label>
                      <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">{index === 0 && 'Value'}
                        <Input className="font-mono text-[11px]" value={header.value} onChange={(event) => updateHeader(index, 'value', event.target.value)} placeholder="e.g. Bearer token" aria-label={`Header ${index + 1} value`} />
                      </label>
                      <Button variant="ghost" className="mb-[7px] size-[26px] text-muted-foreground [&_svg]:size-[15px] mobile:col-start-2 mobile:row-span-2 mobile:row-start-1 mobile:mb-0" type="button" aria-label={`Remove header ${index + 1}`} onClick={() => updateOption((option) => ({ ...option, headers: option.headers.filter((_, i) => i !== index) }))}><Icon name="close" /></Button>
                    </div>
                  ))}
                </div>
                <Button variant="secondary" type="button" onClick={() => updateOption((option) => ({ ...option, headers: [...option.headers, createHeaderPair()] }))}><Icon name="plus" />Add header</Button>
              </div>
            </div>
            {deletedOption && <div className="mt-[18px] flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground" role="status"><span>{deletedOption.option.name} deleted</span><Button variant="link" className="min-h-0 min-w-0 rounded-none px-1.5 py-[1px] text-xs underline" type="button" onClick={undoDelete}>Undo</Button></div>}
          </div>
          {saveState.message && <p className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 ${saveState.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-secondary text-secondary-foreground'}`} role={saveState.tone === 'error' ? 'alert' : 'status'}>{saveState.message}</p>}
          <div className="mt-[25px] mb-10 flex items-center gap-[23px] mobile:gap-[17px]">
            {onDelete && <Button variant="ghost" type="button" className="h-auto px-0 py-[9px] rounded-none text-[11px] text-muted-foreground hover:bg-transparent hover:text-destructive" onClick={onDelete}>Delete switcher</Button>}
            <a className="ml-auto text-[11px] text-muted-foreground no-underline hover:text-foreground" href="#/switchers">Cancel</a>
            <Button variant="default" className="mobile:px-3 mobile:text-xs" type="submit">Save</Button>
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
