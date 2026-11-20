import { templateSegments } from '../lib/templates'
import type { TemplateText } from '../lib/templates'
import { cn } from '../lib/utils'
import { tokenPresentation } from './template-editor-view'
import { useVariables } from './variables-context'

/** Read-only text with variables shown as `{{NAME}}` in color. Literal text that reads `{{NAME}}` stays plain. */
export function TemplateDisplay({ value, className }: { value: TemplateText; className?: string }) {
  const variables = useVariables()
  return <span className={cn('template-display', className)}>
    {templateSegments(value).map((segment, index) => {
      if (typeof segment === 'string') return <span key={index}>{segment}</span>
      const { name, missing, title } = tokenPresentation(segment, variables)
      return <span key={index} className="variable-token" data-missing={missing} title={title} role="img"
        aria-label={missing ? `Missing variable ${name}` : `Variable ${name}`}>
        <span className="variable-brace">{'{{'}</span>{name}<span className="variable-brace">{'}}'}</span>
      </span>
    })}
  </span>
}
