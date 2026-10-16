import logo from '../../icons/icon-128.png'

export function BrandIcon({ size = 32 }: { size?: 24 | 32 }) {
  return <img src={logo} width={size} height={size} className="shrink-0" alt="" />
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
