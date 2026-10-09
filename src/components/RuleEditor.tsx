import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { isValidUrlPattern } from '../lib/pattern'
import { createHeaderPair, createRuleDraft, ruleToDraft } from '../lib/rules'
import type { HeaderPair, HeaderRule, RuleDraft } from '../lib/types'
import { Icon } from './Icon'
import { ToggleSwitch } from './ToggleSwitch'
import { useEditorShortcuts } from './useEditorShortcuts'

type SaveState = { tone: 'idle' | 'success' | 'error'; message: string }
const initialSaveState: SaveState = { tone: 'idle', message: '' }

type RuleEditorProps = {
  rule?: HeaderRule
  pending: boolean
  onSave: (draft: RuleDraft) => Promise<HeaderRule>
  onDelete?: () => void
}

export function RuleEditor({ rule, pending, onSave, onDelete }: RuleEditorProps) {
  const formRef = useEditorShortcuts('/', pending)
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
    if (pending) return
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
    <section className="mx-auto max-w-[840px] animate-rise-in" aria-labelledby="editor-title">
      <a className="inline-flex items-center gap-2 text-[11px] text-muted-foreground no-underline hover:text-primary [&_svg]:w-[15px]" href="#/">
        <Icon name="back" /> Back to rules
      </a>
      <div className="mt-[27px] mb-[30px] mobile:mt-5 [&_h1]:text-xl [&_h1]:leading-[1.4] [&_h1]:font-semibold">
        <h1 id="editor-title">{rule ? 'Edit rule' : 'New rule'}</h1>
      </div>
      <form
        ref={formRef}
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
      >
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={pending}>
          <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
            <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px] mobile:[&>div]:flex-1">
              <div>
                <h2>Rule details</h2>
              </div>
            </div>
            <div className="mb-[22px] grid grid-cols-[1fr_1.35fr] gap-6 mobile:grid-cols-1 mobile:gap-[17px]">
              <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                Rule name
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="e.g. Authenticated API"
                  autoFocus
                  required
                />
              </label>
              <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                URL pattern
                <Input
                  className="font-mono text-[11px]"
                  value={draft.url}
                  onChange={(event) =>
                    setDraft({ ...draft, url: event.target.value })
                  }
                  placeholder="e.g. *://api.example.com/*"
                  aria-label="URL pattern"
                  required
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-5 border-t py-[17px]">
              <span className="text-[11px] font-semibold">Enabled</span>
              <ToggleSwitch
                checked={draft.enabled}
                label="Rule enabled"
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
            </div>
          </div>
          <div className="mb-5 rounded-lg border bg-card shadow-panel px-7 pt-[25px] mobile:px-[17px] mobile:pt-5">
            <div className="mb-6 flex items-center justify-between gap-[13px] mobile:flex-wrap mobile:gap-[9px] [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px] mobile:[&>div]:flex-1">
              <div>
                <h2>Request headers</h2>
              </div>
              <Button variant="secondary" className="ml-auto"
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    headers: [...draft.headers, createHeaderPair()],
                  })
                }
              >
                <Icon name="plus" /> Add header
              </Button>
            </div>
            <div className="min-w-0">
              {draft.headers.map((header, index) => (
                <div className="mb-6 grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1.4fr)_26px] items-end gap-[13px] mobile:gap-3 mobile:grid-cols-[1fr_26px] mobile:items-center mobile:border-b mobile:pb-5 mobile:last:border-b-0 mobile:last:pb-0" key={index}>
                  <span className="pb-3 font-mono text-[10px] text-muted-foreground mobile:hidden">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                    {index === 0 && 'Name'}
                    <Input
                      className="font-mono text-[11px]"
                      value={header.key}
                      onChange={(event) =>
                        updateHeader(index, 'key', event.target.value)
                      }
                      placeholder="e.g. Authorization"
                      aria-label={`Header ${index + 1} name`}
                    />
                  </label>
                  <label className="grid min-w-0 content-start gap-2 text-[11px] font-semibold mobile:col-start-1">
                    {index === 0 && 'Value'}
                    <Input
                      className="font-mono text-[11px]"
                      value={header.value}
                      onChange={(event) =>
                        updateHeader(index, 'value', event.target.value)
                      }
                      placeholder="e.g. Bearer token"
                      aria-label={`Header ${index + 1} value`}
                    />
                  </label>
                  <Button variant="ghost" className="mb-[7px] size-[26px] text-muted-foreground [&_svg]:size-[15px] mobile:col-start-2 mobile:row-span-2 mobile:row-start-1 mobile:mb-0"
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
                  </Button>
                </div>
              ))}
            </div>
          </div>
          {saveState.message && (
            <p
              className={`mb-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs [&_svg]:size-4 ${saveState.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-input bg-secondary text-secondary-foreground'}`}
              role={saveState.tone === 'error' ? 'alert' : 'status'}
            >
              <Icon name={saveState.tone === 'error' ? 'close' : 'check'} />
              {saveState.message}
            </p>
          )}
          <div className="mt-[25px] mb-10 flex items-center gap-[23px] mobile:gap-[17px]">
            {onDelete && (
              <Button variant="ghost"
                type="button"
                className="h-auto px-0 py-[9px] rounded-none text-[11px] text-muted-foreground hover:bg-transparent hover:text-destructive"
                onClick={onDelete}
              >
                Delete rule
              </Button>
            )}
            <a className="ml-auto text-[11px] text-muted-foreground no-underline hover:text-foreground" href="#/">
              Cancel
            </a>
            <Button variant="default" className="mobile:px-3 mobile:text-xs" type="submit">
              Save
            </Button>
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
