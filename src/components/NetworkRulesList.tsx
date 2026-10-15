import type { NetworkOverride } from '../lib/network-rules'
import { ToggleSwitch } from './ToggleSwitch'

export function NetworkRulesList({ overrides, disabled, onToggle }: {
  overrides: NetworkOverride[]
  disabled: boolean
  onToggle: (override: NetworkOverride, enabled: boolean) => void
}) {
  return <ul className="m-0 list-none p-0">{overrides.map(override => <li key={override.id} className="flex min-h-20 items-center gap-4 border-b px-6 last:border-b-0 hover:bg-accent focus-within:bg-accent mobile:gap-3 mobile:px-[15px]">
    <ToggleSwitch checked={override.enabled} label={`Enable ${override.name}`} disabled={disabled} onChange={enabled => onToggle(override, enabled)} />
    <a className="grid min-w-0 flex-1 gap-1.5 py-5 no-underline" href={`#/network-overrides/${encodeURIComponent(override.id)}`}>
      <span className="text-xs font-semibold wrap-anywhere">{override.name}</span>
      <span className="font-mono text-[11px] text-muted-foreground wrap-anywhere">{override.method === 'ANY' ? 'Any' : override.method} {override.requestUrl}</span>
      <span className="text-[11px] text-muted-foreground wrap-anywhere">{override.url} · {override.mode === 'bypass' ? 'Bypass server' : 'Call server'} · {override.status}</span>
    </a>
  </li>)}</ul>
}
