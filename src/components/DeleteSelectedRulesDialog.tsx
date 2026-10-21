import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from './ui/alert-dialog'
import { Icon } from './Icon'
import { activateImportedRules, deleteSavedRules } from '../lib/rule-transfer-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'

export function DeleteSelectedRulesDialog({ ids, disabled, onDeleted }: {
  ids: string[]
  disabled: boolean
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [activation, setActivation] = useState<TransferActivation | null>(null)
  const [deletedCount, setDeletedCount] = useState(0)
  const submitting = useRef(false)

  async function run() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      let result: TransferActivation
      let count = deletedCount
      if (activation) result = await activateImportedRules()
      else {
        const deleted = await deleteSavedRules(new Set(selectedIds))
        result = deleted.activation; count = deleted.deletedCount
        setDeletedCount(count)
        onDeleted()
      }
      if (result.ok) {
        setOpen(false)
        toast.success(`${count} ${count === 1 ? 'rule' : 'rules'} deleted`, {
          description: result.reloadTabIds.length ? 'Reload matching website tabs to apply the deletion.' : undefined,
          duration: result.reloadTabIds.length ? Infinity : 4000,
        })
      } else setActivation(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the selected rules. Try again.')
    } finally { submitting.current = false; setBusy(false) }
  }

  return <AlertDialog open={open} onOpenChange={next => {
    if (submitting.current) return
    if (next) { setSelectedIds([...ids]); setError(''); setActivation(null); setDeletedCount(0) }
    setOpen(next)
  }}>
    <AlertDialogTrigger asChild>
      <Button variant="destructive" disabled={disabled || !ids.length}
        aria-busy={disabled && ids.length > 0 ? true : undefined}
        className="aria-busy:cursor-wait aria-busy:opacity-100">
        <Icon icon={Trash2} data-icon="inline-start" />Delete
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent onKeyDown={event => event.stopPropagation()}
      className="max-h-[calc(100dvh_-_2rem)] overflow-y-auto data-[size=default]:sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>{activation ? 'Rules deleted; activation not confirmed' : `Delete ${selectedIds.length} selected ${selectedIds.length === 1 ? 'rule' : 'rules'}?`}</AlertDialogTitle>
        <AlertDialogDescription>{activation
          ? 'The deletion is saved. Retry activation or reload the extension and matching websites.'
          : 'All selected rules, including selections on other tabs, will be permanently deleted. This action cannot be undone.'}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertTitle>{activation ? 'Activation failed' : 'Deletion failed'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {activation && <Alert><AlertDescription>{activation.error}
        {activation.reloadTabIds.length > 0 && <p>Reload matching website tabs to apply the deletion.</p>}
      </AlertDescription></Alert>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{activation ? 'Close' : 'Cancel'}</AlertDialogCancel>
        <AlertDialogAction variant={activation ? 'default' : 'destructive'} disabled={busy || (!activation && disabled)}
          onClick={event => { event.preventDefault(); void run() }}>
          {busy ? activation ? 'Applying...' : 'Deleting...' : activation ? 'Retry activation' : 'Delete'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
