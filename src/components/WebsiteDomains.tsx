import { useId, useImperativeHandle, useRef, useState } from 'react'
import type { ComponentProps, Ref } from 'react'
import { CircleHelp, X } from 'lucide-react'
import { getDomainPatterns, updateWebsiteScope } from '../lib/pattern'
import type { WebsiteScope } from '../lib/pattern'
import { commitWebsiteDomainDrafts, removeWebsiteDomain } from '../lib/website-domain-draft'
import type { WebsiteDomainDraft } from '../lib/website-domain-draft'
import { Button } from './ui/button'
import { Field, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { Icon } from './Icon'

export type WebsiteDomainsHandle = { commit: () => boolean }

export function WebsiteDomains({ value, onChange, onBlur, onPendingChange, inputRef, error, disabled = false, ref }: {
  value: WebsiteScope
  onChange: (value: WebsiteScope) => void
  onBlur: () => void
  onPendingChange: (pending: boolean) => void
  inputRef: (input: HTMLInputElement | null) => void
  error?: string
  disabled?: boolean
  ref: Ref<WebsiteDomainsHandle>
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const managerInput = useRef<HTMLInputElement>(null)
  const domains = getDomainPatterns(value)
  const [open, setOpen] = useState(false)
  const [showSingleDomainManager, setShowSingleDomainManager] = useState(domains.length !== 1)
  // A null draft displays the saved singleton without submitting it as a new domain.
  const [creationDraft, setCreationDraft] = useState<string | null>(domains.length === 1 ? null : '')
  const [managerDraft, setManagerDraft] = useState<WebsiteDomainDraft>({ text: '', editing: null })
  const [inputErrors, setInputErrors] = useState({ creation: '', manager: '' })
  const creationText = creationDraft ?? ''
  const creationValue = creationDraft ?? (domains.length === 1 ? domains[0] : '')
  const creationPending = !!creationText.trim()
  const managerPending = managerDraft.editing === null ? !!managerDraft.text.trim() : managerDraft.text !== domains[managerDraft.editing]
  const creationMessage = inputErrors.creation || (!open ? error : undefined)
  const managerMessage = inputErrors.manager || error
  const showManage = domains.length > 1 || (domains.length === 1 && showSingleDomainManager) || !!managerDraft.text || managerDraft.editing !== null

  function showError(field: 'creation' | 'manager', message: string) {
    setInputErrors(current => ({ ...current, [field]: message }))
    setOpen(field === 'manager')
    const activeInput = field === 'manager' ? managerInput.current : input.current
    activeInput?.focus()
  }

  function commitInput(field: 'creation' | 'manager') {
    const draft = field === 'creation' ? { text: creationText, editing: null } : managerDraft
    try {
      onChange(updateWebsiteScope(value, draft.text, draft.editing))
    } catch (error) {
      showError(field, error instanceof Error ? error.message : 'Enter a valid website domain.')
      return
    }
    if (field === 'creation') {
      setCreationDraft('')
      setShowSingleDomainManager(true)
    } else {
      setManagerDraft({ text: '', editing: null })
    }
    setInputErrors(current => ({ ...current, [field]: '' }))
    onPendingChange(field === 'creation' ? managerPending : creationPending)
  }

  function commit() {
    const result = commitWebsiteDomainDrafts(value, creationText, managerDraft)
    if (!result.ok) { showError(result.field, result.message); return false }
    onChange(result.value)
    setCreationDraft('')
    setShowSingleDomainManager(true)
    setManagerDraft({ text: '', editing: null })
    setInputErrors({ creation: '', manager: '' })
    onPendingChange(false)
    return true
  }

  useImperativeHandle(ref, () => ({ commit }))

  const inputProps = (field: 'creation' | 'manager') => ({
    value: field === 'creation' ? creationValue : managerDraft.text,
    placeholder: 'Type a URL or domain', autoComplete: 'off', spellCheck: false, disabled, onBlur,
    'aria-invalid': !!(field === 'creation' ? creationMessage : managerMessage),
    onChange: event => {
      const next = event.target.value
      if (field === 'creation') {
        setCreationDraft(next)
        onPendingChange(!!next.trim() || managerPending)
      } else {
        setManagerDraft({ ...managerDraft, text: next })
        onPendingChange(creationPending || (managerDraft.editing === null ? !!next.trim() : next !== domains[managerDraft.editing]))
      }
      setInputErrors(current => ({ ...current, [field]: '' }))
    },
    onKeyDown: event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); commitInput(field) }
      if (event.key === 'Escape' && field === 'creation' && !event.defaultPrevented && creationText) {
        event.preventDefault(); event.stopPropagation()
        setCreationDraft(''); setInputErrors(current => ({ ...current, creation: '' })); onPendingChange(managerPending)
      }
    },
  } satisfies ComponentProps<typeof Input>)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Field className="min-w-0 gap-2" data-invalid={!!creationMessage} data-disabled={disabled}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor={id} className="text-[11px] font-semibold">Website domains</FieldLabel>
            <TooltipProvider delayDuration={350}><Tooltip>
              <TooltipTrigger asChild><span tabIndex={0} role="img" aria-label="How website domains work"
                className="inline-flex shrink-0 cursor-help text-muted-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                <Icon icon={CircleHelp} size={14} />
              </span></TooltipTrigger>
              <TooltipContent className="max-w-72" align="start" alignOffset={-8} sideOffset={4}>
                <div className="flex flex-col gap-2 text-left">
                  <p className="font-semibold">Use the same rule on multiple websites.</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    <li>Type a URL or domain and press <kbd>Enter</kbd> to add it.</li>
                    <li>Click <strong>Manage</strong> to see all domains.</li>
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip></TooltipProvider>
          </div>
          {showManage && <SheetTrigger asChild><Button variant="domain" size="inline" type="button" disabled={disabled}
            aria-label={domains.length ? `Manage website domains (${domains.length})` : 'Manage website domains'}>Manage{domains.length > 0 && ` ${domains.length}`}</Button></SheetTrigger>}
        </div>
        <Input {...inputProps('creation')} id={id} ref={node => { input.current = node; inputRef(node) }}
          aria-describedby={creationMessage ? `${id}-error` : undefined} />
        {creationMessage && <FieldError id={`${id}-error`} className="text-[11px]">{creationMessage}</FieldError>}
      </Field>
      <SheetContent aria-describedby={undefined} onOpenAutoFocus={event => {
        event.preventDefault(); managerInput.current?.focus()
        if (managerDraft.editing !== null) managerInput.current?.select()
      }} onCloseAutoFocus={event => {
        event.preventDefault(); input.current?.focus()
      }} onEscapeKeyDown={event => {
        event.stopPropagation()
      }}>
        <SheetHeader className="shrink-0"><SheetTitle>Website domains</SheetTitle></SheetHeader>
        <Field className="shrink-0 gap-2" data-invalid={!!managerMessage} data-disabled={disabled}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={`${id}-manager`} className="text-[11px] font-semibold">Add or edit a domain</FieldLabel>
            {domains.length > 0 && <span className="text-[11px] text-muted-foreground">{domains.length} {domains.length === 1 ? 'domain' : 'domains'}</span>}
          </div>
          <Input {...inputProps('manager')} id={`${id}-manager`} ref={managerInput}
            aria-describedby={managerMessage ? `${id}-manager-error` : undefined} />
          {managerMessage && <FieldError id={`${id}-manager-error`} className="text-[11px]">{managerMessage}</FieldError>}
        </Field>
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain" aria-label="Website domains">
        {domains.map((domain, index) => <li key={`${index}-${domain}`} className="flex min-w-0 items-center justify-between gap-3">
          <Button variant="domain" size="inline" className="min-w-0 justify-start" type="button" disabled={disabled} aria-label={`Edit domain ${domain}`}
            aria-pressed={managerDraft.editing === index} onClick={() => {
              setManagerDraft({ text: domain, editing: index }); setInputErrors(current => ({ ...current, manager: '' })); onPendingChange(creationPending)
              managerInput.current?.focus()
              // Select after React has placed the chosen domain in the input.
              requestAnimationFrame(() => managerInput.current?.select())
            }}>{domain}</Button>
          <Button variant="ghost-muted" size="icon-sm" type="button" disabled={disabled} aria-label={`Remove domain ${domain}`} onClick={() => {
            const next = removeWebsiteDomain(value, index, managerDraft)
            onChange(next.value)
            setManagerDraft({ text: next.text, editing: next.editing })
            onPendingChange(creationPending || next.pending)
            setInputErrors(current => ({ ...current, manager: '' }))
          }}><Icon icon={X} /></Button>
        </li>)}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
