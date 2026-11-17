import { useId, useImperativeHandle, useRef, useState } from 'react'
import type { ComponentProps, Ref } from 'react'
import { X } from 'lucide-react'
import { getDomainPatterns, normalizeWebsiteScope, updateWebsiteScope } from '../lib/pattern'
import type { WebsiteScope } from '../lib/pattern'
import { Button } from './ui/button'
import { Field, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet'
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
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [inputError, setInputError] = useState('')
  const domains = getDomainPatterns(value)
  const message = inputError || error

  function commit() {
    try {
      onChange(updateWebsiteScope(value, text, editing))
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Enter a valid website domain.')
      const activeInput = open ? managerInput.current : input.current
      activeInput?.focus()
      return false
    }
    setText('')
    setEditing(null)
    setInputError('')
    onPendingChange(false)
    return true
  }

  useImperativeHandle(ref, () => ({ commit }))

  function discard() {
    setText(''); setEditing(null); setInputError(''); onPendingChange(false)
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
      if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); commit() }
      if (event.key === 'Escape' && !event.defaultPrevented && (text || editing !== null)) {
        event.preventDefault(); event.stopPropagation(); discard()
      }
    },
  } satisfies ComponentProps<typeof Input>

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Field className="min-w-0 gap-2" data-invalid={!!message} data-disabled={disabled}>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor={id} className="text-[11px] font-semibold">Website domains</FieldLabel>
          <SheetTrigger asChild><Button variant="domain" size="inline" type="button" disabled={disabled}
            aria-label={`Manage website domains (${domains.length})`}>Manage {domains.length}</Button></SheetTrigger>
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
        if (text || editing !== null) { event.preventDefault(); discard() }
      }}>
        <SheetHeader className="shrink-0"><SheetTitle>Website domains</SheetTitle></SheetHeader>
        <Field className="shrink-0 gap-2" data-invalid={!!message} data-disabled={disabled}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={`${id}-manager`} className="text-[11px] font-semibold">Add or edit a domain</FieldLabel>
            <span className="text-[11px] text-muted-foreground">{domains.length} {domains.length === 1 ? 'domain' : 'domains'}</span>
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
            onChange(normalizeWebsiteScope(domains.filter((_, position) => position !== index)))
            if (editing === index) { setEditing(null); setText(''); onPendingChange(false) }
            else if (editing !== null && index < editing) setEditing(editing - 1)
            setInputError('')
          }}><Icon icon={X} /></Button>
        </li>)}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
