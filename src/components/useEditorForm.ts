import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { useForm } from 'react-hook-form'
import type { DefaultValues, FieldErrors, FieldValues } from 'react-hook-form'
import type { $ZodType } from 'zod/v4/core'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEditorShortcuts } from './useEditorShortcuts'

function firstError(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  if ('message' in value && typeof value.message === 'string') return value.message
  for (const [key, child] of Object.entries(value)) {
    if (key === 'ref') continue
    const message = firstError(child)
    if (message) return message
  }
  return ''
}

export function useEditorForm<Values extends FieldValues>({ schema, initial, pending, returnRoute, onSave, successMessage = '', onInvalid }: {
  schema: $ZodType<Values, Values>
  initial: () => Values
  pending: boolean
  returnRoute: string
  onSave: (values: Values) => Promise<Values | void>
  successMessage?: string
  onInvalid?: (errors: FieldErrors<Values>) => void
}) {
  const [defaults] = useState(initial)
  const [success, setSuccess] = useState('')
  const form = useForm<Values>({
    defaultValues: defaults as DefaultValues<Values>,
    resolver: zodResolver(schema, undefined, { mode: 'sync' }),
  })
  const busy = pending || form.formState.isSubmitting
  const formRef = useEditorShortcuts(returnRoute, busy)
  function clearStatus() { setSuccess(''); form.clearErrors('root') }
  const submit = form.handleSubmit(async values => {
    if (pending) return
    clearStatus()
    try {
      const saved = await onSave(values)
      if (saved) form.reset(saved)
      setSuccess(successMessage)
    } catch (error) {
      form.setError('root.server', { message: error instanceof Error ? error.message : 'Could not save. Try again.' })
    }
  }, errors => { setSuccess(''); onInvalid?.(errors) })
  return { form, formRef, busy, success, error: firstError(form.formState.errors), clearStatus,
    onSubmit: (event: SubmitEvent<HTMLFormElement>) => { void submit(event) } }
}
