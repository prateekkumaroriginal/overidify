import { useState } from 'react'
import type { ReactNode } from 'react'
import { variableNameError } from '../lib/variables'
import { createVariable } from '../lib/variables-storage'
import type { CreateVariableRequest } from './template-editor-view'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Switch } from './ui/switch'

const secretByName = (name: string) => /TOKEN|KEY|SECRET|PASSWORD/i.test(name)

/** The dialog behind "Create NAME" in the suggestions. It saves the variable, then inserts it. */
export function useCreateVariableDialog(): { request: (request: CreateVariableRequest) => void; dialog: ReactNode } {
  const [current, setCurrent] = useState<CreateVariableRequest | null>(null)
  const [draft, setDraft] = useState({ name: '', value: '', secret: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Stable, so long-lived editors can keep calling it.
  const [request] = useState(() => (next: CreateVariableRequest) => {
    setCurrent(next)
    setDraft({ name: next.name, value: '', secret: secretByName(next.name) })
    setError('')
  })
  function close(created?: Parameters<CreateVariableRequest['insert']>[0]) {
    const pending = current
    setCurrent(null)
    // Return to the field after the dialog has released focus.
    requestAnimationFrame(() => { if (created) pending?.insert(created); else pending?.cancel() })
  }
  async function submit() {
    const nameError = variableNameError(draft.name)
    if (nameError) { setError(nameError); return }
    setBusy(true)
    try {
      const result = await createVariable(draft)
      if (result.ok) close(result.variable)
      else setError(result.error)
    } finally { setBusy(false) }
  }

  const dialog = <Dialog open={current !== null} onOpenChange={open => { if (!open && !busy) close() }}>
    <DialogContent className="max-w-md" onCloseAutoFocus={event => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>New variable</DialogTitle>
        <DialogDescription>It is added where you were typing.</DialogDescription>
      </DialogHeader>
      {/* The dialog renders inside a rule form, so its submit must not reach that form. */}
      <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); event.stopPropagation(); void submit() }}>
        <label className="grid gap-2 text-[11px] font-semibold">Name
          <Input className="font-mono text-[11px]" value={draft.name} spellCheck={false} autoComplete="off" disabled={busy} aria-invalid={!!error}
            onChange={event => { setDraft({ ...draft, name: event.target.value }); setError('') }} />
        </label>
        <label className="grid gap-2 text-[11px] font-semibold">Value
          <Input className="font-mono text-[11px]" type={draft.secret ? 'password' : 'text'} value={draft.value} spellCheck={false} autoComplete="off" disabled={busy} autoFocus
            onChange={event => setDraft({ ...draft, value: event.target.value })} />
        </label>
        <label className="flex items-center gap-2.5 text-[11px] font-semibold">
          <Switch checked={draft.secret} disabled={busy} onCheckedChange={secret => setDraft({ ...draft, secret })} aria-label="Secret" />
          Secret <span className="font-normal text-muted-foreground">Masks the value in Overidify</span>
        </label>
        {error && <p className="text-[11px] text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => close()}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create and insert'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
  return { request, dialog }
}
