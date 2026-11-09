import { useId, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { X } from 'lucide-react'
import { getDomainPattern, getDomainPatterns, isValidDomainPattern, normalizeWebsiteScope } from '../lib/pattern'
import type { WebsiteScope } from '../lib/pattern'
import { Button } from './ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Icon } from './Icon'

export type WebsiteDomainsHandle = { commit: () => boolean }

export function WebsiteDomains({ value, onChange, onBlur, onPendingChange, inputRef, error, ref }: {
  value: WebsiteScope
  onChange: (value: WebsiteScope) => void
  onBlur: () => void
  onPendingChange: (pending: boolean) => void
  inputRef: (input: HTMLInputElement | null) => void
  error?: string
  ref: Ref<WebsiteDomainsHandle>
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [inputError, setInputError] = useState('')
  const domains = getDomainPatterns(value)
  const message = inputError || error

  function commit() {
    if (!text.trim()) return true
    if (!isValidDomainPattern(text)) {
      setInputError('Use a website domain like localhost:4200, *.example.com, or *.')
      input.current?.focus()
      return false
    }
    const domain = getDomainPattern(text)
    if (domains.some((existing, index) => index !== editing && getDomainPattern(existing) === domain)) {
      setInputError('This domain is already in the list.')
      input.current?.focus()
      return false
    }
    onChange(normalizeWebsiteScope(editing === null ? [...domains, domain] : domains.map((existing, index) => index === editing ? domain : existing)))
    setText('')
    setEditing(null)
    setInputError('')
    onPendingChange(false)
    return true
  }

  useImperativeHandle(ref, () => ({ commit }))

  return (
    <Field className="min-w-0 gap-2" data-invalid={!!message}>
      <FieldLabel htmlFor={id} className="text-[11px] font-semibold">Website domains</FieldLabel>
      <Input id={id} ref={node => { input.current = node; inputRef(node) }} value={text}
        placeholder="Type a URL or domain" autoComplete="off" spellCheck={false}
        aria-invalid={!!message} aria-describedby={`${id}-help${message ? ` ${id}-error` : ''}`}
        onBlur={onBlur} onChange={event => {
          const next = event.target.value
          setText(next); setInputError('')
          onPendingChange(!!next.trim() && (editing === null || next !== domains[editing]))
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); commit() }
          if (event.key === 'Escape' && (text || editing !== null)) {
            event.preventDefault(); setText(''); setEditing(null); setInputError(''); onPendingChange(false)
          }
        }} />
      <FieldDescription id={`${id}-help`} className="text-[11px]">Enter to add. Click a domain to edit.</FieldDescription>
      {domains.length > 0 && <ul className="flex flex-col" aria-label="Website domains">
        {domains.map((domain, index) => <li key={`${index}-${domain}`} className="flex min-w-0 items-center justify-between gap-3 py-0.5">
          <Button variant="domain" size="inline" className="-ml-1.5 min-w-0 justify-start" type="button" aria-label={`Edit domain ${domain}`}
            aria-pressed={editing === index} onClick={() => {
              setEditing(index); setText(domain); setInputError(''); onPendingChange(false)
              input.current?.focus()
              // Select after React has placed the chosen domain in the input.
              requestAnimationFrame(() => input.current?.select())
            }}>{domain}</Button>
          <Button variant="ghost-muted" size="icon-sm" type="button" aria-label={`Remove domain ${domain}`} onClick={() => {
            onChange(normalizeWebsiteScope(domains.filter((_, position) => position !== index)))
            if (editing === index) { setEditing(null); setText(''); onPendingChange(false) }
            else if (editing !== null && index < editing) setEditing(editing - 1)
            setInputError('')
          }}><Icon icon={X} /></Button>
        </li>)}
      </ul>}
      {message && <FieldError id={`${id}-error`} className="text-[11px]">{message}</FieldError>}
    </Field>
  )
}
