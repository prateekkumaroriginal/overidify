import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Search, Settings, SquareArrowOutUpRight, Trash2 } from 'lucide-react'
import { devtoolsRequestLabel, observeDevtoolsRequests } from '../lib/devtools-requests'
import type { CapturedRequest } from '../lib/devtools-requests'
import { openCapturedNetworkRule } from '../lib/network-rule-drafts'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../components/ui/empty'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Spinner } from '../components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip'
import { Icon } from '../components/Icon'
import { Brand } from '../components/Brand'
import { cn } from '../lib/utils'

type DisplayPreferences = { rows: 'one' | 'two'; fullPath: boolean }
const preferenceKey = 'overidify:devtools-display:v1'

function readDisplayPreferences(): DisplayPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as Partial<DisplayPreferences> | null
    return { rows: value?.rows === 'one' ? 'one' : 'two', fullPath: value?.fullPath === true }
  } catch { return { rows: 'two', fullPath: false } }
}

export function DevtoolsApp() {
  const [requests, setRequests] = useState<CapturedRequest[]>([])
  const [search, setSearch] = useState('')
  const [display, setDisplay] = useState(readDisplayPreferences)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const opening = useRef(false)
  const capture = useRef<ReturnType<typeof observeDevtoolsRequests> | null>(null)

  useEffect(() => {
    const observer = observeDevtoolsRequests(chrome.devtools.network, setRequests, () => {})
    capture.current = observer
    const refresh = () => observer.refresh()
    window.addEventListener('overidify-devtools-shown', refresh)
    return () => { window.removeEventListener('overidify-devtools-shown', refresh); observer.dispose(); capture.current = null }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(preferenceKey, JSON.stringify(display)) }
    catch { /* Display controls still work when preferences cannot be stored. */ }
  }, [display])

  async function createRule(item: CapturedRequest) {
    if (opening.current) return
    opening.current = true
    setOpeningId(item.id)
    setError('')
    try {
      const tab = await chrome.tabs.get(chrome.devtools.inspectedWindow.tabId)
      await openCapturedNetworkRule(item.request, tab.url ?? '')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this response in options. Try again.')
    } finally { opening.current = false; setOpeningId(null) }
  }

  const query = search.trim().toLowerCase()
  const visible = requests.filter(({ request }) => `${request.request.method} ${request.request.url}`.toLowerCase().includes(query))

  return (
    <TooltipProvider delayDuration={350}>
      <main className="mx-auto flex h-dvh min-w-0 max-w-[1240px] flex-col gap-5 p-5 mobile:p-4">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
          <Brand href="options.html" openInTab />
          <Button variant="outline" onClick={() => { void chrome.runtime.openOptionsPage() }}><Icon icon={Settings} data-icon="inline-start" />Manage rules</Button>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Captured requests</h1>
          <div className="relative min-w-0 flex-1 basis-40 mobile:basis-full">
            <Icon icon={Search} size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-[30px] py-0 pl-9" aria-label="Filter requests" placeholder="Filter by URL or method" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => capture.current?.refresh()}><Icon icon={RefreshCw} data-icon="inline-start" />Refresh</Button>
            <Button variant="outline" onClick={() => { capture.current?.clear(); setError('') }}><Icon icon={Trash2} data-icon="inline-start" />Clear</Button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <Label htmlFor="request-rows" size="sm">Rows</Label>
            <Select value={display.rows} onValueChange={value => setDisplay(current => ({ ...current, rows: value === 'one' ? 'one' : 'two' }))}>
              <SelectTrigger id="request-rows" size="toolbar" className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="one">One line</SelectItem>
                <SelectItem value="two">Two lines</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="request-full-path" checked={display.fullPath} onCheckedChange={checked => setDisplay(current => ({ ...current, fullPath: checked === true }))} />
            <Label htmlFor="request-full-path" size="sm">Full path</Label>
          </div>
        </div>
        {error && <Alert variant="destructive" className="shrink-0"><AlertDescription>{error}</AlertDescription></Alert>}
        <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', visible.length && 'rounded-lg border bg-card shadow-rule-card')} aria-label="Captured requests">
          {visible.length ? <Table className="table-fixed" containerClassName="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <colgroup><col className="w-[88px] mobile:w-[80px]" /><col /><col className="w-[76px] mobile:w-[64px]" /><col className="w-[66px] mobile:w-[58px]" /></colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow interactive={false}>
                <TableHead className="px-5 text-center mobile:px-4">Method</TableHead>
                <TableHead className="px-5 mobile:px-4">Request</TableHead>
                <TableHead className="px-5 text-center mobile:px-4">Status</TableHead>
                <TableHead className="px-5 mobile:px-4"><span className="sr-only">Create rule</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(item => {
                const request = item.request
                const label = devtoolsRequestLabel(request.request.url, display.fullPath)
                return <TableRow key={item.id} className={cn('group/request cursor-default', display.rows === 'one' && '[&_td]:py-1')}>
                  <TableCell className="px-5 text-center mobile:px-4"><span className="text-[11px] text-muted-foreground">{request.request.method}</span></TableCell>
                  <TableCell className={cn('px-5 mobile:px-4', display.rows === 'two' ? 'py-3' : 'py-1')}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="flex w-full min-w-0 flex-col gap-0.5 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4">
                          <span className="w-full truncate font-semibold">{label.name}</span>
                          {display.rows === 'two' && <span className="w-full truncate text-[11px] text-muted-foreground">{label.host}</span>}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[min(560px,calc(100vw-24px))] wrap-anywhere">{request.request.url}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="px-5 text-center mobile:px-4"><span className={cn('text-[11px] tabular-nums text-muted-foreground', (!request.response.status || request.response.status >= 400) && 'text-destructive')}>{request.response.status || 'Failed'}</span></TableCell>
                  <TableCell className="px-5 mobile:px-4">
                    <div className="pointer-events-none flex items-center opacity-0 group-hover/request:pointer-events-auto group-hover/request:opacity-100 group-focus-within/request:pointer-events-auto group-focus-within/request:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost-muted" size="icon-action" disabled={openingId !== null} aria-busy={openingId === item.id} aria-label={`Create rule in options for ${request.request.method} ${label.name}`} onClick={() => { void createRule(item) }}>
                            {openingId === item.id ? <Spinner /> : <Icon icon={SquareArrowOutUpRight} />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Create rule in options</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              })}
            </TableBody>
          </Table> : <Empty className="border"><EmptyHeader><EmptyTitle>{query ? 'No matching requests' : 'Waiting for API requests'}</EmptyTitle>
            {query && <EmptyDescription>Try another URL or method.</EmptyDescription>}
          </EmptyHeader></Empty>}
        </section>
      </main>
    </TooltipProvider>
  )
}
