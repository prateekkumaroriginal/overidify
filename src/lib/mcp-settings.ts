import * as z from 'zod/mini'
import { MCP_DEFAULT_PORT } from './mcp-protocol.ts'

export const MCP_SETTINGS_KEY = 'mcpSettings'
export const MCP_STATUS_KEY = 'mcpStatus'

const PortSchema = z.int().check(z.minimum(1024), z.maximum(65535))
export const McpSettingsSchema = z.object({
  enabled: z.catch(z.boolean(), false),
  port: z.catch(PortSchema, MCP_DEFAULT_PORT),
  token: z.catch(z.string(), ''),
})
export type McpSettings = z.infer<typeof McpSettingsSchema>

export const McpStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('off') }),
  z.object({ state: z.literal('starting') }),
  z.object({ state: z.literal('running'), url: z.string() }),
  z.object({ state: z.literal('error'), message: z.string(), setupNeeded: z.optional(z.boolean()) }),
])
export type McpStatus = z.infer<typeof McpStatusSchema>

export function isValidMcpPort(value: number): boolean {
  return PortSchema.safeParse(value).success
}

export function createMcpToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function getMcpSettings(): Promise<McpSettings> {
  const stored = await chrome.storage.local.get(MCP_SETTINGS_KEY)
  return McpSettingsSchema.parse(stored[MCP_SETTINGS_KEY] ?? {})
}

// Enabling always leaves a token in place, so the endpoint is never unauthenticated.
export async function updateMcpSettings(update: Partial<McpSettings>): Promise<McpSettings> {
  return navigator.locks.request(MCP_SETTINGS_KEY, async () => {
    const next = { ...await getMcpSettings(), ...update }
    if (!isValidMcpPort(next.port)) throw new Error('Use a port from 1024 to 65535.')
    if (!next.token) next.token = createMcpToken()
    await chrome.storage.local.set({ [MCP_SETTINGS_KEY]: next })
    return next
  })
}

export async function getMcpStatus(): Promise<McpStatus> {
  const stored = await chrome.storage.session.get(MCP_STATUS_KEY)
  const parsed = McpStatusSchema.safeParse(stored[MCP_STATUS_KEY])
  return parsed.success ? parsed.data : { state: 'off' }
}

export function subscribeToMcp(onSettings: (settings: McpSettings) => void, onStatus: (status: McpStatus) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && MCP_SETTINGS_KEY in changes) onSettings(McpSettingsSchema.parse(changes[MCP_SETTINGS_KEY].newValue ?? {}))
    if (area === 'session' && MCP_STATUS_KEY in changes) {
      const parsed = McpStatusSchema.safeParse(changes[MCP_STATUS_KEY].newValue)
      onStatus(parsed.success ? parsed.data : { state: 'off' })
    }
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}
