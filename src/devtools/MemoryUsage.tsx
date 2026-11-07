import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '../components/ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '../components/ui/popover'
import { Progress } from '../components/ui/progress'

export function MemoryUsage({ bytes, budget, label, children }: { bytes: number; budget: number; label: string; children?: ReactNode }) {
  const [mode, setMode] = useState<'closed' | 'hover' | 'pinned'>('closed')
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoreFocus = useRef(false)
  const titleId = useId()
  const percent = bytes / budget * 100

  useEffect(() => () => {
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
  }, [])

  function cancelTimers() {
    if (openTimer.current !== null) clearTimeout(openTimer.current)
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }

  function showOnHover() {
    cancelTimers()
    if (mode === 'closed') {
      restoreFocus.current = false
      openTimer.current = setTimeout(() => {
        openTimer.current = null
        setMode(current => current === 'closed' ? 'hover' : current)
      }, 350)
    }
  }

  function scheduleClose() {
    cancelTimers()
    if (mode !== 'hover') return
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setMode(current => current === 'hover' ? 'closed' : current)
    }, 150)
  }

  function pin() {
    cancelTimers()
    restoreFocus.current = true
    setMode('pinned')
  }

  return <Popover open={mode !== 'closed'} onOpenChange={open => {
    if (open) pin()
    else { cancelTimers(); setMode('closed') }
  }}>
    <PopoverTrigger asChild>
      <Button variant="ghost-muted" size="icon" aria-label={`${label}: ${Math.round(percent)}% used`}
        onPointerEnter={event => { if (event.pointerType !== 'touch') showOnHover() }} onPointerLeave={scheduleClose}
        onClick={event => { event.preventDefault(); pin() }}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="-rotate-90">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
          {bytes > 0 && <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - percent} />}
        </svg>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={8} className="flex w-80 max-w-[calc(100vw-32px)] flex-col gap-3" aria-labelledby={titleId}
      onPointerEnter={event => { if (event.pointerType !== 'touch') showOnHover() }} onPointerLeave={scheduleClose}
      onClick={pin}
      onOpenAutoFocus={event => { if (!restoreFocus.current) event.preventDefault() }}
      onCloseAutoFocus={event => { if (!restoreFocus.current) event.preventDefault() }}>
      <PopoverHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PopoverTitle id={titleId}>{label}</PopoverTitle>
          <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(percent)}% · {(bytes / 1024 / 1024).toFixed(1)} / {budget / 1024 / 1024} MiB</span>
        </div>
      </PopoverHeader>
      <Progress className="h-1.5" aria-label={`${label} used`} value={percent} />
      {children}
    </PopoverContent>
  </Popover>
}
