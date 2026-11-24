import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { McpToolDefinition, McpToolResult } from '../src/lib/mcp-protocol.ts'

export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BODY_BYTES = 32 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

export type McpServerOptions = {
  token: string
  version: string
  instructions: string
  tools: McpToolDefinition[]
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult>
}

type JsonRpcId = string | number | null
type JsonRpcResponse = { jsonrpc: '2.0'; id: JsonRpcId; result?: unknown; error?: { code: number; message: string } }

export function createMcpHttpServer(options: McpServerOptions): Server {
  return createServer((request, response) => {
    handleRequest(request, response, options).catch(error => {
      console.error('Overidify MCP request failed.', error)
      if (!response.headersSent) sendText(response, 500, 'Internal server error.')
      else response.destroy()
    })
  })
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, options: McpServerOptions) {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  if (path !== '/mcp') return sendText(response, 404, 'Not found. The MCP endpoint is /mcp.')
  // Reject DNS-rebound names and browser pages. Agents connect without an Origin.
  const hostname = (request.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()
  if (!LOOPBACK_HOSTS.has(hostname)) return sendText(response, 403, 'Forbidden host.')
  if (request.headers.origin !== undefined) return sendText(response, 403, 'Browser requests are not allowed.')
  if (!isAuthorized(request.headers.authorization, options.token)) {
    response.setHeader('WWW-Authenticate', 'Bearer realm="overidify"')
    return sendText(response, 401, 'Missing or invalid bearer token. Copy the connection settings from Overidify.')
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendText(response, 405, 'Method not allowed.')
  }
  const protocolVersion = request.headers['mcp-protocol-version']
  if (typeof protocolVersion === 'string' && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
    return sendText(response, 400, `Unsupported MCP protocol version: ${protocolVersion}.`)
  }
  if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) return sendText(response, 415, 'Send JSON-RPC as application/json.')

  const body = await readBody(request)
  if (body === null) return sendText(response, 413, 'Request body is too large.')
  let input: unknown
  try { input = JSON.parse(body) } catch {
    return sendJson(response, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error.' } })
  }
  const batch = Array.isArray(input)
  const messages: unknown[] = Array.isArray(input) ? input : [input]
  const replies = (await Promise.all(messages.map(message => handleMessage(message, options))))
    .filter((reply): reply is JsonRpcResponse => reply !== null)
  if (!replies.length) {
    response.writeHead(202).end()
    return
  }
  sendJson(response, 200, batch ? replies : replies[0])
}

async function handleMessage(message: unknown, options: McpServerOptions): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request.' } }
  }
  // Notifications and responses to server requests need no reply.
  if (typeof message.method !== 'string' || !('id' in message)) return null
  const id = message.id as JsonRpcId
  const params = isRecord(message.params) ? message.params : {}
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })
  const fail = (code: number, text: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message: text } })

  switch (message.method) {
    case 'initialize': {
      const requested = params.protocolVersion
      return ok({
        protocolVersion: typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'overidify', title: 'Overidify', version: options.version },
        instructions: options.instructions,
      })
    }
    case 'ping':
      return ok({})
    case 'tools/list':
      return ok({ tools: options.tools })
    case 'tools/call': {
      const name = params.name
      if (typeof name !== 'string' || !options.tools.some(tool => tool.name === name)) return fail(-32602, `Unknown tool: ${String(name)}.`)
      if (params.arguments !== undefined && !isRecord(params.arguments)) return fail(-32602, 'Tool arguments must be an object.')
      return ok(await options.callTool(name, params.arguments ?? {}))
    }
    default:
      return fail(-32601, `Method not found: ${message.method}.`)
  }
}

function isAuthorized(header: string | undefined, token: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return Boolean(token) && timingSafeEqual(digest(header ?? ''), digest(`Bearer ${token}`))
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    request.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
}

function sendText(response: ServerResponse, status: number, text: string) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(text)
}
