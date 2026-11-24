// Chrome starts this process through native messaging when MCP is enabled in
// Overidify. It serves MCP over HTTP and relays tool calls to the extension.
import type { Server } from 'node:http'
import { MCP_BRIDGE_PROTOCOL, splitNativeMessage } from '../src/lib/mcp-protocol.ts'
import type { ExtensionToHostMessage, HostToExtensionMessage, McpToolResult } from '../src/lib/mcp-protocol.ts'
import { encodeNativeMessage, readNativeMessages } from './native-messaging.ts'
import { createMcpHttpServer } from './server.ts'

const CALL_TIMEOUT_MS = 60_000
const pending = new Map<number, (result: McpToolResult) => void>()
let nextId = 1
let server: Server | null = null

function send(message: HostToExtensionMessage) {
  for (const part of splitNativeMessage(message, nextId++)) process.stdout.write(encodeNativeMessage(part))
}

function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  return new Promise(resolve => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ isError: true, content: [{ type: 'text', text: 'Overidify did not respond in time. Check that the browser is running, then try again.' }] })
    }, CALL_TIMEOUT_MS)
    pending.set(id, result => { pending.delete(id); clearTimeout(timer); resolve(result) })
    send({ type: 'call', id, name, arguments: args })
  })
}

function start(message: Extract<ExtensionToHostMessage, { type: 'start' }>) {
  if (message.protocol !== MCP_BRIDGE_PROTOCOL) {
    send({ type: 'status', protocol: MCP_BRIDGE_PROTOCOL, state: 'error', message: 'The installed MCP helper does not match this version of Overidify. Run the setup command again.' })
    return
  }
  if (server) return
  const { port } = message
  server = createMcpHttpServer({ ...message, callTool })
  server.on('error', (error: NodeJS.ErrnoException) => {
    send({
      type: 'status', protocol: MCP_BRIDGE_PROTOCOL, state: 'error',
      message: error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Choose another port.` : `The MCP server could not start: ${error.message}`,
    })
  })
  server.listen(port, '127.0.0.1', () => {
    send({ type: 'status', protocol: MCP_BRIDGE_PROTOCOL, state: 'listening', url: `http://127.0.0.1:${port}/mcp` })
  })
}

readNativeMessages(process.stdin, raw => {
  const message = raw as ExtensionToHostMessage
  if (message.type === 'start') start(message)
  else if (message.type === 'result') pending.get(message.id)?.(message.result)
})
// Chrome closes stdin when the extension disconnects or the browser exits.
process.stdin.on('end', () => process.exit(0))
