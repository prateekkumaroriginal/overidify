import { TriangleAlert } from 'lucide-react'
import type { RuleResolution } from '../lib/resolve-rules'
import { Badge } from './ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Icon } from './Icon'

/** "Inactive" for an enabled rule, "Variable problem" for a disabled one. Lists issues by field, never values. */
export function RuleProblemBadge({ resolution }: { resolution?: RuleResolution }) {
  if (!resolution?.issues.length) return null
  const label = resolution.enabled ? 'Inactive' : 'Variable problem'
  return <Tooltip>
    <TooltipTrigger asChild>
      <Badge variant="outline" tabIndex={0} className="pointer-events-auto relative z-10 shrink-0 cursor-help gap-1 border-destructive/50 bg-destructive/10 text-[11px] text-destructive"
        aria-label={`${label}: ${resolution.issues.map(issue => `${issue.field}: ${issue.message}`).join('; ')}`}>
        <Icon icon={TriangleAlert} size={12} />{label}
      </Badge>
    </TooltipTrigger>
    <TooltipContent className="max-w-80">
      <ul className="flex flex-col gap-1 text-left">
        {resolution.issues.map((issue, index) => <li key={index}><span className="font-semibold">{issue.field}:</span> {issue.message}</li>)}
      </ul>
    </TooltipContent>
  </Tooltip>
}
