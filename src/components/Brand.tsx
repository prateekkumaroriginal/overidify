import { iconAssets } from '../lib/icon-assets'

export function BrandIcon({ size = 32 }: { size?: 24 | 32 }) {
  return (
    <span className="inline-flex shrink-0">
      <img src={iconAssets.light[128]} width={size} height={size} className="dark:hidden" alt="" />
      <img src={iconAssets.dark[128]} width={size} height={size} className="hidden dark:block" alt="" />
    </span>
  )
}

export function Brand({ href = '#/header-rules' }: { href?: string }) {
  return (
    <a className="inline-flex items-center gap-2.5 text-[23px] font-bold tracking-[-1.1px] no-underline mobile:text-[21px]" href={href} aria-label="Overidify home">
      <BrandIcon />
      <span>
        overidify<span className="text-primary">.</span>
      </span>
    </a>
  )
}
