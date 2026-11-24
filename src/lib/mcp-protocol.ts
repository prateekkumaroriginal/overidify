// Shared by the extension and the native MCP host. Keep this module free of
// browser and Node APIs so both builds can import it.

export const MCP_HOST_NAME = 'com.overidify.mcp'
// Bump when extension and host messages change incompatibly.
export const MCP_BRIDGE_PROTOCOL = 1
export const MCP_DEFAULT_PORT = 47821
export const MCP_SETUP_FILE = 'overidify-mcp-setup.mjs'
const MCP_SETUP_GLOBAL = '__overidifyMcpSetup'

export type McpEmbeddedSetup = { extensionId: string; host: string }

/** Builds the standalone setup script: the installer with the helper and extension ID embedded. */
export function createMcpSetupScript(installer: string, setup: McpEmbeddedSetup) {
  return `globalThis.${MCP_SETUP_GLOBAL} = ${JSON.stringify(setup)};\n${installer}`
}

export function readMcpEmbeddedSetup(scope: object): McpEmbeddedSetup | undefined {
  const value = (scope as Record<string, unknown>)[MCP_SETUP_GLOBAL] as Partial<McpEmbeddedSetup> | undefined
  return typeof value?.extensionId === 'string' && typeof value.host === 'string' ? { extensionId: value.extensionId, host: value.host } : undefined
}
// Chrome rejects host-to-extension messages over 1 MB. Split larger ones into
// chunks that stay below it even when every character needs 3 UTF-8 bytes.
const NATIVE_MESSAGE_LIMIT = 1024 * 1024 - 1024
export const NATIVE_CHUNK_SIZE = 256 * 1024

export type McpToolDefinition = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: Record<string, unknown>
}

export type McpToolResult = {
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export type ExtensionToHostMessage =
  | { type: 'start'; protocol: number; port: number; token: string; version: string; instructions: string; tools: McpToolDefinition[] }
  | { type: 'result'; id: number; result: McpToolResult }

export type HostToExtensionMessage =
  | { type: 'status'; protocol: number; state: 'listening'; url: string }
  | { type: 'status'; protocol: number; state: 'error'; message: string }
  | { type: 'call'; id: number; name: string; arguments: Record<string, unknown> }
  | { type: 'chunk'; id: number; index: number; total: number; data: string }

export function splitNativeMessage(message: HostToExtensionMessage, id: number, size = NATIVE_CHUNK_SIZE): HostToExtensionMessage[] {
  const text = JSON.stringify(message)
  if (new TextEncoder().encode(text).length <= NATIVE_MESSAGE_LIMIT) return [message]
  const total = Math.ceil(text.length / size)
  return Array.from({ length: total }, (_, index) => ({
    type: 'chunk' as const, id, index, total, data: text.slice(index * size, (index + 1) * size),
  }))
}

export function createChunkAssembler() {
  const pending = new Map<number, string[]>()
  return (chunk: Extract<HostToExtensionMessage, { type: 'chunk' }>): unknown => {
    const parts = pending.get(chunk.id) ?? []
    parts[chunk.index] = chunk.data
    pending.set(chunk.id, parts)
    if (parts.filter(part => part !== undefined).length < chunk.total) return undefined
    pending.delete(chunk.id)
    return JSON.parse(parts.join(''))
  }
}
