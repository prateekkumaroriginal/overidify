import { useId, useImperativeHandle, useRef, useState } from 'react'
import type { ComponentProps, Ref } from 'react'
import { CircleHelp, X } from 'lucide-react'
import { getDomainPatterns, updateWebsiteScope } from '../lib/pattern'
import type { WebsiteScope } from '../lib/pattern'
import { removeWebsiteDomain } from '../lib/website-domain-draft'
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
  const [listMode, setListMode] = useState(domains.length > 1)
  const [text, setText] = useState(domains.length === 1 ? domains[0] : '')
  const [editing, setEditing] = useState<number | null>(domains.length === 1 ? 0 : null)
  const [inputError, setInputError] = useState('')
  const message = inputError || error
  const showManage = domains.length > 0 && (listMode || domains.length > 1)

  function commit(asList = false) {
    try {
      const next = updateWebsiteScope(value, text, editing)
      const nextDomains = getDomainPatterns(next)
      const nextListMode = nextDomains.length > 0 && (asList || listMode || nextDomains.length > 1)
      onChange(next)
      setListMode(nextListMode)
      setText(!nextListMode && nextDomains.length === 1 ? nextDomains[0] : '')
      setEditing(!nextListMode && nextDomains.length === 1 ? 0 : null)
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Enter a valid website domain.')
      const activeInput = open ? managerInput.current : input.current
      activeInput?.focus()
      return false
    }
    setInputError('')
    onPendingChange(false)
    return true
  }

  useImperativeHandle(ref, () => ({ commit }))

  function discard() {
    const inlineSingle = domains.length === 1
    setListMode(domains.length > 1)
    setText(inlineSingle ? domains[0] : ''); setEditing(inlineSingle ? 0 : null)
    setInputError(''); onPendingChange(false)
  }

  const inputProps = {
    value: text, placeholder: 'Type a URL or domain', autoComplete: 'off', spellCheck: false,
    disabled, 'aria-invalid': !!message, onBlur,
    onChange: event => {
      const next = event.target.value
      setText(next); setInputError('')
      onPendingChange(editing === null ? !!next.trim() : next !== domains[editing])
    },
    onKeyDown: event => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); commit(true) }
      if (event.key === 'Escape' && !open && !event.defaultPrevented && (showManage || text !== domains[0]) && (text || editing !== null)) {
        event.preventDefault(); event.stopPropagation(); discard()
      }
    },
  } satisfies ComponentProps<typeof Input>

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Field className="min-w-0 gap-2" data-invalid={!!message} data-disabled={disabled}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor={id} className="text-[11px] font-semibold">Website domains</FieldLabel>
            <TooltipProvider delayDuration={350}><Tooltip>
              <TooltipTrigger asChild><span tabIndex={0} role="img" aria-label="How website domains work"
                className="inline-flex shrink-0 cursor-help text-muted-foreground outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                <Icon icon={CircleHelp} size={14} />
              </span></TooltipTrigger>
              <TooltipContent className="max-w-72" align="start" sideOffset={4}>
                <div className="flex flex-col gap-2 text-left">
                  <p className="font-semibold">Use the same rule on multiple websites.</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    <li>Type a URL or domain and press <kbd>Enter</kbd> to add it.</li>
                    <li>Open <strong>Manage</strong> to see all domains.</li>
                    <li>Click a domain to edit it, or × to remove it.</li>
                    <li>Press <kbd>Esc</kbd> to close the list and keep your draft.</li>
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip></TooltipProvider>
          </div>
          {showManage && <SheetTrigger asChild><Button variant="domain" size="inline" type="button" disabled={disabled}
            aria-label={`Manage website domains (${domains.length})`}>Manage {domains.length}</Button></SheetTrigger>}
        </div>
        <Input {...inputProps} id={id} ref={node => { input.current = node; inputRef(node) }}
          aria-describedby={message && !open ? `${id}-error` : undefined} />
        {message && !open && <FieldError id={`${id}-error`} className="text-[11px]">{message}</FieldError>}
      </Field>
      <SheetContent aria-describedby={undefined} onOpenAutoFocus={event => {
        event.preventDefault(); managerInput.current?.focus()
        if (editing !== null) managerInput.current?.select()
      }} onCloseAutoFocus={event => {
        event.preventDefault(); input.current?.focus()
      }} onEscapeKeyDown={event => {
        event.stopPropagation()
      }}>
        <SheetHeader className="shrink-0"><SheetTitle>Website domains</SheetTitle></SheetHeader>
        <Field className="shrink-0 gap-2" data-invalid={!!message} data-disabled={disabled}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={`${id}-manager`} className="text-[11px] font-semibold">Add or edit a domain</FieldLabel>
            {domains.length > 0 && <span className="text-[11px] text-muted-foreground">{domains.length} {domains.length === 1 ? 'domain' : 'domains'}</span>}
          </div>
          <Input {...inputProps} id={`${id}-manager`} ref={managerInput}
            aria-describedby={message ? `${id}-manager-error` : undefined} />
          {message && <FieldError id={`${id}-manager-error`} className="text-[11px]">{message}</FieldError>}
        </Field>
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain" aria-label="Website domains">
        {domains.map((domain, index) => <li key={`${index}-${domain}`} className="flex min-w-0 items-center justify-between gap-3 py-0.5">
          <Button variant="domain" size="inline" className="min-w-0 justify-start" type="button" disabled={disabled} aria-label={`Edit domain ${domain}`}
            aria-pressed={editing === index} onClick={() => {
              setEditing(index); setText(domain); setInputError(''); onPendingChange(false)
              managerInput.current?.focus()
              // Select after React has placed the chosen domain in the input.
              requestAnimationFrame(() => managerInput.current?.select())
            }}>{domain}</Button>
          <Button variant="ghost-muted" size="icon-sm" type="button" disabled={disabled} aria-label={`Remove domain ${domain}`} onClick={() => {
            const next = removeWebsiteDomain(value, index, { text, editing })
            onChange(next.value)
            setText(next.text); setEditing(next.editing); setListMode(next.listMode)
            onPendingChange(next.pending)
            setInputError('')
          }}><Icon icon={X} /></Button>
        </li>)}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
