import { Copy, Trash2, Upload } from 'lucide-react'
import type { TransferRule } from '../lib/rule-transfer'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Icon } from './Icon'

export type RuleRowActionHandlers = {
  busy: boolean
  exportingId: string | null
  onDuplicate: (rule: TransferRule) => void
  onExport: (rule: TransferRule) => void
  onDelete: (rule: TransferRule) => void
}

export function RuleRowActions({ rule, actions }: { rule: TransferRule; actions?: RuleRowActionHandlers }) {
  if (!actions) return null
  return <div className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100" role="group" aria-label={`Actions for ${rule.name}`} aria-busy={actions.busy || undefined}>
    {[
      { label: 'Duplicate', icon: Copy, onClick: actions.onDuplicate, disabled: actions.busy },
      { label: 'Export', icon: Upload, onClick: actions.onExport, disabled: actions.exportingId === rule.id },
      { label: 'Delete', icon: Trash2, onClick: actions.onDelete, disabled: actions.busy },
    ].map(action => <Tooltip key={action.label}>
      <TooltipTrigger asChild>
        <Button variant={action.label === 'Delete' ? 'destructive-ghost' : 'ghost-muted'} size="icon-action" type="button"
          aria-label={`${action.label} ${rule.name}`} aria-disabled={action.disabled || undefined} aria-busy={action.disabled || undefined}
          onClick={() => { if (!action.disabled) action.onClick(rule) }}>
          <Icon icon={action.icon} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{action.label}</TooltipContent>
    </Tooltip>)}
  </div>
}
