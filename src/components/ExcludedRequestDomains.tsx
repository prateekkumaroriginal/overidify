import { useId, useState } from 'react'
import type { Ref } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from './ui/field'
import { Input } from './ui/input'

const splitDomains = (text: string) => text.split(/[\s,]+/).filter(Boolean)
type FieldIssue = { message?: string }
/** The list's own error, or the first error on one of its domains. */
const errorMessage = (error: FieldIssue | (FieldIssue | undefined)[] | undefined) =>
  Array.isArray(error) ? error.find(item => item?.message)?.message : error?.message

/** Request domains a Header Rule skips, typed as a comma- or space-separated list. */
export function ExcludedRequestDomains({ value, onChange, onBlur, inputRef, error, disabled = false }: {
  value: string[]
  onChange: (value: string[]) => void
  onBlur: () => void
  inputRef: Ref<HTMLInputElement>
  error?: FieldIssue | (FieldIssue | undefined)[]
  disabled?: boolean
}) {
  const id = useId()
  const message = errorMessage(error)
  // Keep the typed separators while the parsed list stays in the form.
  const [text, setText] = useState(() => value.join(', '))
  const shown = splitDomains(text).join('\n') === value.join('\n') ? text : value.join(', ')
  return (
    <Field className="min-w-0 gap-2" data-invalid={!!message} data-disabled={disabled}>
      <FieldLabel htmlFor={id} className="text-[11px] font-semibold">Excluded request domains</FieldLabel>
      <Input id={id} ref={inputRef} value={shown} disabled={disabled} placeholder="e.g. cdn.example.com, analytics.example.net"
        aria-invalid={!!message} aria-describedby={`${id}-description${message ? ` ${id}-error` : ''}`}
        onBlur={onBlur} onChange={event => { setText(event.target.value); onChange(splitDomains(event.target.value)) }} />
      <FieldDescription id={`${id}-description`} className="text-[11px]">
        Requests to these domains and their subdomains don't get this rule's headers.
      </FieldDescription>
      {message && <FieldError id={`${id}-error`} className="text-[11px]">{message}</FieldError>}
    </Field>
  )
}
