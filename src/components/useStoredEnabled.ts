import { useEffect, useRef } from 'react'
import type { FieldValues, Path, PathValue, UseFormReturn } from 'react-hook-form'

type WithEnabled = FieldValues & { enabled: boolean }

/**
 * Keeps an open editor's Enabled toggle on the stored state when another page changes it, such as
 * the Variables page turning the rule off. Once the user clicks the toggle, their choice wins and is saved.
 */
export function useStoredEnabled<Values extends WithEnabled>(form: UseFormReturn<Values>, stored: boolean | undefined) {
  const field = 'enabled' as Path<Values>
  // The user's last click on the toggle, kept apart from form dirtiness so a stored update cannot hide it.
  const chosen = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (stored === undefined) return
    form.resetField(field, { defaultValue: stored as PathValue<Values, Path<Values>> })
    if (chosen.current !== undefined && chosen.current !== stored) form.setValue(field, chosen.current as PathValue<Values, Path<Values>>, { shouldDirty: true })
  }, [stored, form, field])
  return {
    choose: (enabled: boolean) => { chosen.current = enabled },
    /** Whether Save should write the draft's toggle instead of keeping the stored state. */
    enabledChanged: () => chosen.current !== undefined,
  }
}
