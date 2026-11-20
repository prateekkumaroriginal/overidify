import { CircleAlert } from 'lucide-react'
import type { RuleProblem } from '../lib/rule-resolution'
import { Icon } from './Icon'
import { TURNED_OFF_NOTE } from './rule-problems'

/** Explains why the Enabled switch is off and locked, and lists each field that needs a fix. */
export function RuleProblemsNote({ problems }: { problems: RuleProblem[] }) {
  if (!problems.length) return null
  return <div className="mb-5 flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="status">
    <Icon icon={CircleAlert} size={16} className="mt-px shrink-0" />
    <div className="flex flex-col gap-1">
      <p>{TURNED_OFF_NOTE}</p>
      <ul className="list-disc pl-4">{problems.map((problem, index) => <li key={index}><span className="font-semibold">{problem.field}:</span> {problem.message}</li>)}</ul>
    </div>
  </div>
}
