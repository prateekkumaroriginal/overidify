import type { NetworkRule } from '../lib/network-rules'
import { ToggleSwitch } from './ToggleSwitch'

export function NetworkRulesList({ networkRules, pending, onToggle }: {
  networkRules: NetworkRule[]
  pending: boolean
  onToggle: (networkRule: NetworkRule, enabled: boolean) => void
}) {
  return <ul className="m-0 list-none p-0">{networkRules.map(networkRule => <li key={networkRule.id} className="flex min-h-20 items-center gap-4 border-b px-6 last:border-b-0 hover:bg-accent focus-within:bg-accent mobile:gap-3 mobile:px-[15px]">
    <ToggleSwitch checked={networkRule.enabled} label={`Enable ${networkRule.name}`} pending={pending} onChange={enabled => onToggle(networkRule, enabled)} />
    <a className="grid min-w-0 flex-1 gap-1.5 py-5 no-underline" href={`#/network-rules/${encodeURIComponent(networkRule.id)}`}>
      <span className="text-xs font-semibold wrap-anywhere">{networkRule.name}</span>
      <span className="font-sans text-[11px] text-muted-foreground wrap-anywhere">{networkRule.method === 'ANY' ? 'Any' : networkRule.method} {networkRule.requestUrl}</span>
      <span className="text-[11px] text-muted-foreground wrap-anywhere">{networkRule.url} · {networkRule.mode === 'bypass' ? 'Bypass server' : 'Call server'} · {networkRule.status}</span>
    </a>
  </li>)}</ul>
}
