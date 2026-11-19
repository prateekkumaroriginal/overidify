import { useEffect } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

type WithEnabled = FieldValues & { enabled: boolean }

/**
 * Keeps an open editor's Enabled toggle on the stored state when another page changes it, such as
 * the Variables page turning the rule off. A toggle the user already changed is left alone.
 * Returns whether a draft's toggle differs from the stored state, so Save only changes it on purpose.
 */
export function useStoredEnabled<Values extends WithEnabled>(form: UseFormReturn<Values>, stored: boolean | undefined) {
  const field = 'enabled' as Path<Values>
  useEffect(() => {
    if (stored === undefined || form.getValues(field) !== form.formState.defaultValues?.enabled) return
    form.resetField(field, { defaultValue: stored as PathValue<Values, Path<Values>> })
  }, [stored, form, field])
  return (draft: Values) => draft.enabled !== form.formState.defaultValues?.enabled
}
