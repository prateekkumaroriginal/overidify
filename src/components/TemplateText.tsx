import { TriangleAlert } from 'lucide-react'
import { templateParts } from '../lib/templates'
import type { TemplateText } from '../lib/templates'
import { cn } from '../lib/utils'
import { useVariableNames } from './variables-context'

export function ReferenceChip({ name, missing = false }: { name: string; missing?: boolean }) {
  const label = `${missing ? 'Missing variable' : 'Variable'} ${name}`
  return <span className="template-chip" data-missing={missing} role="img" aria-label={label} title={missing ? label : undefined}>
    {missing && <TriangleAlert size={11} strokeWidth={2.5} aria-hidden="true" />}{`{{${name}}}`}
  </span>
}

/** Read-only display: references are chips; literal text that reads {{NAME}} stays plain. Values never appear. */
export function TemplateTextView({ value, className, placeholder }: { value: TemplateText; className?: string; placeholder?: string }) {
  const names = useVariableNames()
  const parts = templateParts(value)
  if (!parts.length && placeholder) return <span className={className}>{placeholder}</span>
  return <span className={cn('template-text', className)}>
    {parts.map((part, index) => typeof part === 'string' ? <span key={index}>{part}</span>
      : <ReferenceChip key={index} name={part.variable} missing={names !== null && !names.includes(part.variable)} />)}
  </span>
}
