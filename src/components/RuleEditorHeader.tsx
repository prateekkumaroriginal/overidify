import { Button } from './ui/button'
import { Icon } from './Icon'

type RuleEditorHeaderProps = {
  kind: 'header' | 'switch' | 'network'
  editing: boolean
  busy: boolean
  titleId?: string
  onDelete?: () => void
}

export function RuleEditorHeader({ kind, editing, busy, titleId = 'editor-title', onDelete }: RuleEditorHeaderProps) {
  const backLabel = `Back to ${kind} rules`

  return (
    <div className="mb-7 flex items-center gap-3">
      <Button variant="ghost" size="icon" className="size-9 shrink-0" asChild>
        <a href={`#/${kind}-rules`} aria-label={backLabel} title={backLabel}>
          <Icon name="back" />
        </a>
      </Button>
      <h1 id={titleId} className="min-w-0 flex-1 text-xl font-semibold">{editing ? 'Edit' : 'New'} {kind} rule</h1>
      {onDelete && (
        <Button variant="destructive-outline" size="sm" type="button" className="shrink-0" disabled={busy} aria-label={`Delete ${kind} rule`} onClick={onDelete}>
          <Icon name="trash" data-icon="inline-start" />
          Delete rule
        </Button>
      )}
    </div>
  )
}
