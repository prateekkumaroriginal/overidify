import { TriangleAlert } from 'lucide-react'
import type { RuleCheck } from '../lib/rule-resolution'
import { Badge } from './ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Icon } from './Icon'

/** Marks a rule that can't run with the current variables. Lists problems by field, never values. */
export function RuleProblemBadge({ check }: { check?: RuleCheck }) {
  if (!check?.problems.length) return null
  const summary = check.problems.map(problem => `${problem.field}: ${problem.message}`).join(' ')
  return <Tooltip>
    <TooltipTrigger asChild>
      <Badge variant="outline" tabIndex={0} className="pointer-events-auto relative z-10 shrink-0 cursor-help gap-1 border-destructive/50 bg-destructive/10 text-[11px] text-destructive"
        aria-label={`Variable problem. ${summary}`}>
        <Icon icon={TriangleAlert} size={12} />Variable problem
      </Badge>
    </TooltipTrigger>
    <TooltipContent className="max-w-80">
      <p className="mb-1 font-semibold">Turned off until these are fixed:</p>
      <ul className="flex flex-col gap-1 text-left">
        {check.problems.map((problem, index) => <li key={index}><span className="font-semibold">{problem.field}:</span> {problem.message}</li>)}
      </ul>
    </TooltipContent>
  </Tooltip>
}
