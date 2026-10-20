import { Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from './ui/alert-dialog'
import { Icon } from './Icon'

export function DeleteRuleDialog({ name, busy, onDelete }: {
  name: string
  busy: boolean
  onDelete: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive-outline" size="sm" type="button" className="shrink-0" disabled={busy}>
          <Icon icon={Trash2} data-icon="inline-start" />
          Delete rule
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onKeyDown={event => event.stopPropagation()}
        className="max-h-[calc(100dvh_-_2rem)] overflow-y-auto data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete rule?</AlertDialogTitle>
          <AlertDialogDescription className="[overflow-wrap:anywhere]">
            &quot;{name}&quot; will be permanently deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" type="button" disabled={busy} onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
