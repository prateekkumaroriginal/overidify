import { Checkbox } from './ui/checkbox'

export type RuleSelection = { selected: ReadonlySet<string>; onChange: (id: string, checked: boolean) => void }

export function RuleSelectionCheckbox({ id, name, selection, className }: {
  id: string; name: string; selection?: RuleSelection; className?: string
}) {
  if (!selection) return null
  return <Checkbox className={className} aria-label={`Select ${name}`} checked={selection.selected.has(id)}
    onCheckedChange={checked => selection.onChange(id, checked === true)} />
}
