import * as z from 'zod/mini'
import { NetworkRuleSchema } from './network-schemas.ts'

const entries = z.array(NetworkRuleSchema)
const id = z.int().check(z.minimum(0))
export const NetworkActiveTabsSchema = z.array(id)
export const NetworkBridgeFramesSchema = z.array(z.object({ tabId: id,
  frames: z.array(z.object({ frameId: id, documentId: z.string() })) }))
export const NetworkSettingsResponseSchema = z.object({ entries })
export const ActivationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), reloadTabIds: z.optional(z.array(id)) }),
  z.object({ ok: z.literal(false), error: z.optional(z.string()) }),
])
export const NetworkRuntimeMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('network-page-ready') }),
  z.object({ type: z.literal('get-network-rules') }),
  z.object({ type: z.literal('sync-network-rules') }),
  z.object({ type: z.literal('update-network-rules'), entries }),
])
export const NetworkBridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({ source: z.literal('overidify-network-bridge'), type: z.literal('hello') }),
  z.object({ source: z.literal('overidify-network-bridge'), type: z.literal('config'), id, entries }),
])
export const NetworkPageMessageSchema = z.discriminatedUnion('type', [
  z.object({ source: z.literal('overidify-network-page'), type: z.literal('ready') }),
  z.object({ source: z.literal('overidify-network-page'), type: z.literal('applied'), id, needsReload: z.boolean() }),
])
export const NetworkAppliedSchema = z.object({ ok: z.boolean(), needsReload: z.optional(z.boolean()) })
export type NetworkApplyResult = z.infer<typeof ActivationResultSchema>
export type NetworkApplied = z.infer<typeof NetworkAppliedSchema>
