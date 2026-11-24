import { callMcpTool, MCP_INSTRUCTIONS, MCP_TOOLS } from '../lib/mcp-tools'
import { createChunkAssembler, MCP_BRIDGE_PROTOCOL, MCP_HOST_NAME } from '../lib/mcp-protocol'
import type { ExtensionToHostMessage, HostToExtensionMessage } from '../lib/mcp-protocol'
import { getMcpSettings, MCP_SETTINGS_KEY, MCP_STATUS_KEY } from '../lib/mcp-settings'
import type { McpStatus } from '../lib/mcp-settings'
import { getSavedRules, updateSavedRules } from '../lib/rule-transfer-storage'
import { getVariables } from '../lib/variables-storage'
import type { TransferActivation } from '../lib/rule-transfer-storage'

const SETUP_HINT = 'Download and run the setup file shown on this page. Overidify connects automatically while this page is open.'

export function startMcpBridge(activate: () => Promise<TransferActivation>): void {
  let host: chrome.runtime.Port | null = null
  let queue: Promise<void> = Promise.resolve()
  const deps = { readRules: getSavedRules, readVariables: getVariables, updateRules: updateSavedRules, activate }

  const setStatus = (status: McpStatus) => chrome.storage.session.set({ [MCP_STATUS_KEY]: status })

  function stop() {
    const current = host
    host = null
    current?.disconnect()
  }

  // A quiet attempt keeps the current error visible instead of flashing Starting while the page polls for setup.
  async function connect(quiet = false) {
    stop()
    const settings = await getMcpSettings()
    if (!settings.enabled || !settings.token) return setStatus({ state: 'off' })
    if (!quiet) await setStatus({ state: 'starting' })
    let port: chrome.runtime.Port
    try {
      // The open native port also keeps this worker alive while MCP is enabled.
      port = chrome.runtime.connectNative(MCP_HOST_NAME)
    } catch (error) {
      return setStatus({ state: 'error', message: `${error instanceof Error ? error.message : String(error)} ${SETUP_HINT}`, setupNeeded: true })
    }
    host = port
    const assemble = createChunkAssembler()
    const post = (message: ExtensionToHostMessage) => { if (host === port) port.postMessage(message) }
    const fail = (status: Extract<McpStatus, { state: 'error' }>) => {
      if (host !== port) return
      stop()
      void setStatus(status)
    }

    port.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message ?? 'The MCP helper stopped.'
      const setupNeeded = /not found|forbidden/i.test(reason)
      fail({ state: 'error', message: setupNeeded ? `Chrome could not start the Overidify MCP helper (${reason}) ${SETUP_HINT}` : reason, setupNeeded })
    })
    port.onMessage.addListener((raw: HostToExtensionMessage) => {
      const message = (raw.type === 'chunk' ? assemble(raw) : raw) as HostToExtensionMessage | undefined
      if (!message) return
      if (message.type === 'status') {
        if (message.protocol !== MCP_BRIDGE_PROTOCOL) {
          fail({ state: 'error', message: `The installed MCP helper does not match this version of Overidify. ${SETUP_HINT}`, setupNeeded: true })
        } else if (message.state === 'error') fail({ state: 'error', message: message.message })
        else if (host === port) void setStatus({ state: 'running', url: message.url })
      } else if (message.type === 'call') {
        void callMcpTool(message.name, message.arguments, deps).then(result => post({ type: 'result', id: message.id, result }))
      }
    })
    post({
      type: 'start', protocol: MCP_BRIDGE_PROTOCOL, port: settings.port, token: settings.token,
      version: chrome.runtime.getManifest().version, instructions: MCP_INSTRUCTIONS, tools: MCP_TOOLS,
    })
  }

  const reconnect = (quiet = false) => {
    queue = queue.then(() => connect(quiet)).catch(error => {
      console.error('Failed to start the MCP helper.', error)
      return setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) })
    })
    return queue
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && MCP_SETTINGS_KEY in changes) void reconnect()
  })
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== 'mcp-reconnect') return
    void reconnect(message.quiet === true).then(() => respond({ ok: true }))
    return true
  })
  void reconnect()
}
