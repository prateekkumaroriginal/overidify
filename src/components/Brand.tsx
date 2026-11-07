import { iconAssets } from '../lib/icon-assets'
import { buildIdentity } from '../lib/build-identity'

export function BuildLabel() {
  return buildIdentity.worktree ? (
    <span className="block truncate text-xs font-normal tracking-normal text-muted-foreground" title={buildIdentity.name}>
      Dev · {buildIdentity.worktree} · {buildIdentity.id}
    </span>
  ) : null
}

export function BrandIcon({ size = 32 }: { size?: 24 | 32 }) {
  return (
    <span className="inline-flex shrink-0">
      <img src={iconAssets.light[128]} width={size} height={size} className="dark:hidden" alt="" />
      <img src={iconAssets.dark[128]} width={size} height={size} className="hidden dark:block" alt="" />
    </span>
  )
}

export function Brand({ href = '#/all', openInTab = false }: { href?: string; openInTab?: boolean }) {
  return (
    <a className="inline-flex min-w-0 items-center gap-2.5 text-[23px] font-bold tracking-[-1.1px] no-underline mobile:text-[21px]" href={href} target={openInTab ? '_blank' : undefined} rel={openInTab ? 'noreferrer' : undefined} aria-label={`${buildIdentity.name} home`}>
      <BrandIcon />
      <span className="min-w-0">
        overidify<span className="text-primary">.</span>
        <BuildLabel />
      </span>
    </a>
  )
}
