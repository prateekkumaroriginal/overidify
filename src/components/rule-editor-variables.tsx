import { CircleAlert } from 'lucide-react'
import { Icon } from './Icon'
import { INACTIVE_STATUS } from './rule-editor-issues'

export function FieldIssue({ message, id }: { message?: string; id?: string }) {
  if (!message) return null
  return <p id={id} className="flex items-center gap-1 text-[11px] font-normal text-destructive"><Icon icon={CircleAlert} size={12} />{message}</p>
}

export function VariableStatus({ show }: { show: boolean }) {
  if (!show) return null
  return <p className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="status">
    <Icon icon={CircleAlert} size={16} />{INACTIVE_STATUS}
  </p>
}
