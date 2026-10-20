import { ArrowLeft, Upload } from 'lucide-react'
import { Button } from './ui/button'
import { Icon } from './Icon'
import { DeleteRuleDialog } from './DeleteRuleDialog'

type RuleEditorHeaderProps = {
  kind: 'header' | 'switch' | 'network'
  editing: boolean
  ruleName: string | undefined
  busy: boolean
  titleId?: string
  onDelete?: () => void
  onExport?: () => void
  unsaved?: boolean
}

export function RuleEditorHeader({ kind, editing, ruleName, busy, titleId = 'editor-title', onDelete, onExport, unsaved }: RuleEditorHeaderProps) {
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
        {onDelete && ruleName !== undefined && <DeleteRuleDialog name={ruleName} busy={busy} onDelete={onDelete} />}
      </div>
    </div>
  )
}
