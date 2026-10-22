import type { ReactNode } from 'react'
import type { TransferRule } from '../lib/rule-transfer'
import { cn } from '../lib/utils'
import { ToggleSwitch } from './ToggleSwitch'
import { RuleSelectionCheckbox } from './RuleSelection'
import type { RuleSelection } from './RuleSelection'
import { RuleRowActions } from './RuleRowActions'
import type { RuleRowActionHandlers } from './RuleRowActions'
import { Badge } from './ui/badge'

type RuleCardProps = {
  rule: TransferRule
  href: string
  onToggle: (enabled: boolean) => void
  pending?: boolean
  openInTab?: boolean
  selection?: RuleSelection
  actions?: RuleRowActionHandlers
  websiteDetails?: string
  index: number
  children: ReactNode
}

export function RuleCard({ rule, href, onToggle, pending, openInTab, selection, actions, websiteDetails, index, children }: RuleCardProps) {
  return (
    <li
      className={cn(
        'rule-row group/card relative grid items-center gap-x-4 gap-y-0.5 rounded-lg border bg-card px-5 py-4 shadow-rule-card transition-[background-color,border-color] hover:bg-accent animate-[rise-in_350ms_both] mobile:gap-x-2 mobile:px-4',
        selection ? 'grid-cols-[16px_32px_minmax(0,1fr)]' : 'grid-cols-[32px_minmax(0,1fr)_auto]',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      {selection ? (
        <RuleSelectionCheckbox id={rule.id} name={rule.name} selection={selection}
          className="after:absolute after:inset-0 after:rounded-lg after:content-['']" />
      ) : (
        <a className="absolute inset-0 rounded-lg" href={href} aria-label={`Edit ${rule.name}`}
          target={openInTab ? '_blank' : undefined} rel={openInTab ? 'noreferrer' : undefined} />
      )}
      <div inert={!!selection} className={cn('flex items-center', selection ? 'pointer-events-none' : 'relative z-10')}>
        <ToggleSwitch checked={rule.enabled} label={`Enable ${rule.name}`} pending={pending} onChange={onToggle} />
      </div>
      <div className="pointer-events-none flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="min-w-0 text-xs font-semibold wrap-anywhere mobile:text-[11px]">{rule.name}</span>
        <Badge variant="domain">{rule.url}</Badge>
      </div>
      {!selection && <div className="pointer-events-none relative z-10 flex -translate-y-2 translate-x-2 items-center justify-self-end self-start">
        <RuleRowActions rule={rule} actions={actions} />
      </div>}
      {websiteDetails && <p className={cn('pointer-events-none min-w-0 text-[11px] text-muted-foreground wrap-anywhere', selection ? 'col-start-3' : 'col-span-2 col-start-2')}>
        {websiteDetails}
      </p>}
      <div inert={!!selection} className={cn('pointer-events-none min-w-0 text-[11px] text-muted-foreground wrap-anywhere', !selection && 'relative z-10 [&_button]:pointer-events-auto', selection ? 'col-start-3' : 'col-span-2 col-start-2')}>
        {children}
      </div>
    </li>
  )
}
