export function Brand({ href = '#/' }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label="Overidify home">
      <span>
        overidify<span className="brand-period">.</span>
      </span>
    </a>
  )
}
