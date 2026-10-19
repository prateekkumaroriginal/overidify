import { ArrowLeft, Upload, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Icon } from './Icon'

type RuleEditorHeaderProps = {
  kind: 'header' | 'switch' | 'network'
  editing: boolean
  busy: boolean
  titleId?: string
  onDelete?: () => void
  onExport?: () => void
  unsaved?: boolean
}

export function RuleEditorHeader({ kind, editing, busy, titleId = 'editor-title', onDelete, onExport, unsaved }: RuleEditorHeaderProps) {
  const backLabel = `Back to ${kind} rules`

  return (
    <div className="mb-7 flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="icon" className="size-9 shrink-0" asChild>
        <a href={`#/${kind}-rules`} aria-label={backLabel} title={backLabel}>
          <Icon icon={ArrowLeft} />
        </a>
      </Button>
      <h1 id={titleId} className="min-w-0 flex-1 text-xl font-semibold">{editing ? 'Edit' : 'New'} {kind} rule</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" type="button" disabled={busy || !editing || unsaved} onClick={onExport}>
          <Icon icon={Upload} data-icon="inline-start" /> Export
        </Button>
      {onDelete && (
        <Button variant="destructive-outline" size="sm" type="button" className="shrink-0" disabled={busy} onClick={onDelete}>
          <Icon icon={Trash2} data-icon="inline-start" />
          Delete rule
        </Button>
      )}
      </div>
    </div>
  )
}
