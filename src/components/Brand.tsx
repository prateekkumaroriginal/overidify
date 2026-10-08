export function Brand({ href = '#/' }: { href?: string }) {
  return (
    <a className="inline-flex items-center gap-2.5 text-[23px] font-bold tracking-[-1.1px] no-underline mobile:text-[21px]" href={href} aria-label="Overidify home">
      <span>
        overidify<span className="text-primary">.</span>
      </span>
    </a>
  )
}
