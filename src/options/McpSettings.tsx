import { ArrowLeft, Bot, Copy, Download, Maximize2, RefreshCw } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icon } from '../components/Icon'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { createMcpToken, getMcpSettings, getMcpStatus, isValidMcpPort, subscribeToMcp, updateMcpSettings } from '../lib/mcp-settings'
import type { McpSettings as Settings, McpStatus } from '../lib/mcp-settings'
import { createMcpSetupScript, MCP_SETUP_FILE } from '../lib/mcp-protocol'

const panel = 'mb-5 rounded-lg border bg-card shadow-panel px-7 py-6 mobile:px-[17px] [&_h2]:mb-2 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:tracking-[-0.2px]'

export function McpSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<McpStatus>({ state: 'off' })
  const [port, setPort] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [windows, setWindows] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([getMcpSettings(), getMcpStatus()]).then(([nextSettings, nextStatus]) => {
      if (!alive) return
      setSettings(nextSettings)
      setPort(String(nextSettings.port))
      setStatus(nextStatus)
    }).catch(() => { if (alive) setError('Could not load MCP settings. Reopen this page to try again.') })
    void chrome.runtime.getPlatformInfo().then(info => { if (alive) setWindows(info.os === 'win') })
    const unsubscribe = subscribeToMcp(next => { setSettings(next); setPort(String(next.port)) }, setStatus)
    return () => { alive = false; unsubscribe() }
  }, [])

  // While the helper is missing, keep checking so setup run in a terminal (or by an agent) connects without clicking Retry.
  const setupNeeded = status.state === 'error' && status.setupNeeded === true
  useEffect(() => {
    if (!setupNeeded) return
    const timer = setInterval(() => { void chrome.runtime.sendMessage({ type: 'mcp-reconnect', quiet: true }) }, 2000)
    return () => clearInterval(timer)
  }, [setupNeeded])

  async function update(change: Partial<Settings>) {
    setBusy(true)
    setError('')
    try { setSettings(await updateMcpSettings(change)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save MCP settings.') }
    finally { setBusy(false) }
  }

  function savePort(event: FormEvent) {
    event.preventDefault()
    const value = Number(port)
    if (!isValidMcpPort(value)) { setError('Use a port from 1024 to 65535.'); return }
    void update({ port: value })
  }

  const url = status.state === 'running' ? status.url : `http://127.0.0.1:${settings?.port ?? ''}/mcp`
  const token = settings?.token ?? ''
  const authorization = `Bearer ${token}`
  const agents = [
    { name: 'Claude Code', promptIntro: 'If you are Claude Code, run:', intro: 'Run this in a terminal. It adds Overidify for all your projects.',
      config: `claude mcp add --transport http --scope user overidify ${url} --header "Authorization: ${authorization}"` },
    { name: 'Codex', promptIntro: 'If you are Codex, add this to ~/.codex/config.toml:', intro: <>Add this to <code className="font-mono">~/.codex/config.toml</code>. The Codex CLI and IDE extension both read it.</>,
      config: `[mcp_servers.overidify]\nurl = "${url}"\nhttp_headers = { Authorization = "${authorization}" }` },
    { name: 'Cursor', promptIntro: 'If you are Cursor, merge this into ~/.cursor/mcp.json:', intro: <>Add this to <code className="font-mono">~/.cursor/mcp.json</code>. If the file already lists servers, add <code className="font-mono">overidify</code> next to them.</>,
      config: JSON.stringify({ mcpServers: { overidify: { url, headers: { Authorization: authorization } } } }, null, 2) },
    { name: 'Other', intro: 'Most clients that support Streamable HTTP servers accept this. Check your client\'s documentation for where it goes.',
      config: JSON.stringify({ mcpServers: { overidify: { type: 'http', url, headers: { Authorization: authorization } } } }, null, 2) },
  ]
  const running = status.state === 'running'
  const prompt = agentSetupPrompt({ url, authorization, install: !running, agents: agents.slice(0, 3) })
  const copyPromptLabel = running ? 'Copy prompt' : 'Copy prompt and download setup file'
  const setupCommand = windows ? `node "$HOME\\Downloads\\${MCP_SETUP_FILE}"` : `node ~/Downloads/${MCP_SETUP_FILE}`

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt) } catch {
      toast.error('Could not copy. Open View prompt, then select the text and copy it manually.')
      return
    }
    if (running) toast.success('Prompt copied. Paste it into your agent.')
    else if (await downloadSetup()) toast.success('Prompt copied and setup file downloaded. Paste the prompt into your agent.')
  }

  async function downloadSetup() {
    setError('')
    try {
      const [installer, host] = await Promise.all(['mcp/install.mjs', 'mcp/host.mjs'].map(async path => {
        const response = await fetch(chrome.runtime.getURL(path))
        if (!response.ok) throw new Error()
        return response.text()
      }))
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([createMcpSetupScript(installer, { extensionId: chrome.runtime.id, host })], { type: 'text/javascript' }))
      link.download = MCP_SETUP_FILE
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000)
      return true
    } catch {
      setError('This Overidify build does not include the MCP helper. Download a release ZIP or run pnpm build.')
      return false
    }
  }

  return (
    <section className="animate-[rise-in_550ms_80ms_both]" aria-labelledby="mcp-title">
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon-lg" className="shrink-0" asChild>
          <a href="#/all" aria-label="Back to all rules"><Icon icon={ArrowLeft} /></a>
        </Button>
        <h1 id="mcp-title" className="min-w-0 flex-1 text-xl font-semibold">Connect an AI agent</h1>
      </div>
      <p className="mb-5 max-w-[720px] text-xs text-muted-foreground">
        Let an AI agent, such as Claude Code, Codex, or Cursor, list, create, edit, and delete your rules. Changes apply immediately, just like edits made here.
      </p>
      {error && <p className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">{error}</p>}

      <div className={panel}>
        <div className="flex items-center justify-between gap-5">
          <h2 className="!mb-0">MCP server</h2>
          <ToggleSwitch checked={settings?.enabled ?? false} label="MCP server enabled" disabled={!settings} pending={busy}
            onChange={enabled => { void update({ enabled }) }} />
        </div>
        <StatusLine status={status} />
        <form className="mt-5 flex flex-wrap items-end gap-3 border-t pt-4" onSubmit={savePort}>
          <label className="grid gap-2 text-[11px] font-semibold">
            Port
            <Input className="w-[120px]" inputMode="numeric" value={port} disabled={!settings || busy} onChange={event => setPort(event.target.value)} />
          </label>
          <Button variant="outline" type="submit" disabled={!settings || busy || port === String(settings.port)}>Save port</Button>
        </form>
      </div>

      {settings?.enabled && <>
        <div className={panel}>
          <h2>Let your agent set it up</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {running
              ? 'Paste this prompt into Claude Code, Codex, or Cursor. The agent adds Overidify to its own configuration.'
              : 'Paste this prompt into Claude Code, Codex, or Cursor. The agent runs the downloaded setup file and adds Overidify to its own configuration. Keep this page open until it finishes. The setup file needs Node.js 20 or newer.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => { void copyPrompt() }}>
              <Icon icon={Bot} data-icon="inline-start" /> {copyPromptLabel}
            </Button>
            <Button variant="outline" onClick={() => setPromptOpen(true)}>
              <Icon icon={Maximize2} data-icon="inline-start" /> View prompt
            </Button>
          </div>
        </div>
        <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
          <DialogContent className="flex h-[calc(100dvh_-_4rem)] max-w-[1112px] flex-col mobile:h-[calc(100dvh_-_2rem)] mobile:p-4">
            <DialogHeader>
              <DialogTitle>Agent setup prompt</DialogTitle>
              <DialogDescription>Paste this into Claude Code, Codex, or Cursor.{running ? '' : ' It expects the setup file in your Downloads folder.'}</DialogDescription>
            </DialogHeader>
            <CodeBlock label="agent prompt" fill>{prompt}</CodeBlock>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
              <Button onClick={() => { void copyPrompt() }}>
                <Icon icon={Bot} data-icon="inline-start" /> {copyPromptLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <p className="mb-3 text-xs font-semibold text-muted-foreground">Or set it up yourself</p>
        <div className={panel}>
          <h2>1. Install the helper</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Chrome can only start programs registered with it, so this is a one-time setup. It needs Node.js 20 or newer. Download the setup file, then run it in a terminal. Run it again after updating Overidify.
          </p>
          <Button variant="outline" className="mb-4" onClick={() => { void downloadSetup() }}>
            <Icon icon={Download} data-icon="inline-start" /> Download setup file
          </Button>
          <CodeBlock label="setup command">{setupCommand}</CodeBlock>
          <p className="mt-3 text-xs text-muted-foreground">
            If your browser saved the file somewhere else, use that path. Overidify connects automatically while this page is open.
          </p>
        </div>
        <div className={panel}>
          <h2>2. Add Overidify to your agent</h2>
          <Tabs defaultValue="Claude Code" className="gap-3">
            <TabsList variant="underline" aria-label="Agent">
              {agents.map(agent => <TabsTrigger key={agent.name} value={agent.name}>{agent.name}</TabsTrigger>)}
            </TabsList>
            {agents.map(agent => (
              <TabsContent key={agent.name} value={agent.name}>
                <p className="mb-3 text-xs text-muted-foreground">{agent.intro}</p>
                <CodeBlock label={`${agent.name} configuration`}>{agent.config}</CodeBlock>
              </TabsContent>
            ))}
          </Tabs>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">The access token works only on this computer. Regenerating it disconnects agents using the old token.</p>
            <Button variant="outline" disabled={busy} onClick={() => { void update({ token: createMcpToken() }) }}>
              <Icon icon={RefreshCw} data-icon="inline-start" /> Regenerate token
            </Button>
          </div>
        </div>
      </>}
    </section>
  )
}

function StatusLine({ status }: { status: McpStatus }) {
  const [retrying, setRetrying] = useState(false)
  if (status.state === 'error') {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">
        <span className="min-w-0 flex-1">{status.message}</span>
        <Button variant="outline" size="sm" disabled={retrying} onClick={() => {
          setRetrying(true)
          void chrome.runtime.sendMessage({ type: 'mcp-reconnect' }).finally(() => setRetrying(false))
        }}>Retry</Button>
      </div>
    )
  }
  const text = status.state === 'running' ? <>Running at <code className="font-mono">{status.url}</code></>
    : status.state === 'starting' ? 'Starting…' : 'Off'
  return <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground" role="status">
    <span className={`size-[7px] rounded-full ${status.state === 'running' ? 'bg-primary' : 'bg-muted-foreground/40'}`} />{text}
  </p>
}

function CodeBlock({ label, children, fill = false }: { label: string; children: ReactNode; fill?: boolean }) {
  return (
    <div className={`relative ${fill ? 'min-h-0 flex-1' : ''}`}>
      <pre className={`${fill ? 'h-full overflow-y-auto text-xs leading-6' : 'text-[11px] leading-5'} overflow-x-auto rounded-md border bg-field py-3 pr-12 pl-3 font-mono whitespace-pre-wrap [overflow-wrap:anywhere]`}>{children}</pre>
      <Button variant="ghost-muted" size="icon-sm" className="absolute top-2 right-2" aria-label={`Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(String(children)).then(() => toast.success('Copied'), () => toast.error('Could not copy. Select the text and copy it manually.'))
        }}>
        <Icon icon={Copy} />
      </Button>
    </div>
  )
}

type PromptAgent = { promptIntro?: string; config: string }

function agentSetupPrompt({ url, authorization, install, agents }: { url: string; authorization: string; install: boolean; agents: PromptAgent[] }) {
  const steps = [
    ...install ? [
      `Install the Overidify MCP helper. I just downloaded its setup file, ${MCP_SETUP_FILE}, usually into my Downloads folder. If there are several copies, such as "overidify-mcp-setup (1).mjs", use the newest one. Run it with Node.js 20 or newer: node <path to the file>. If Node.js 20 or newer isn't installed, stop and tell me.`,
      `Wait up to a minute for the server. Overidify starts it automatically while its Agents settings page is open. It's ready when a POST request to ${url} without a token returns HTTP 401. If it doesn't, ask me to check the Overidify Agents page for an error.`,
    ] : [],
    `Add the server to your own MCP configuration so it's available in every project. Replace any existing "overidify" entry and keep the other servers.
   - Name: overidify
   - Transport: Streamable HTTP
   - URL: ${url}
   - Header: Authorization: ${authorization}
${agents.map(agent => `   ${agent.promptIntro}\n${agent.config.replace(/^/gm, '     ')}`).join('\n')}
   For any other client, use its own configuration format.`,
    'Tell me when it\'s done, and whether I need to restart you or start a new session before the Overidify tools appear.',
  ]
  return `Connect yourself to Overidify, a Chrome extension that changes request headers and mocks network responses, through its local MCP server. Do each step yourself, and only ask me if a step fails.\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`
}
