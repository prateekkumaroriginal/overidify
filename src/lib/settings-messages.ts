import * as z from 'zod/mini'
import { ModeSchema, NetworkMethodSchema } from './network-schemas.ts'
import { ExecutionRecordSchema, ExecutionRuleSchema } from './execution-schemas.ts'
import { RuleIdSchema } from './schema-fields.ts'

// Pages receive concrete settings for their own active rules, plus the template
// snapshot their execution records must use instead of resolved values.
export const ActiveNetworkRuleSchema = z.object({
  id: RuleIdSchema, name: z.string(), url: z.union([z.string(), z.array(z.string())]), enabled: z.boolean(), order: z.number(),
  requestUrl: z.string(), method: NetworkMethodSchema, mode: ModeSchema, body: z.string(), status: z.number(),
  headers: z.array(z.object({ key: z.string(), value: z.string() })),
  execution: ExecutionRuleSchema, templated: z.object({ requestUrl: z.boolean(), responseHeaders: z.boolean(), body: z.boolean() }),
})
const entries = z.array(ActiveNetworkRuleSchema)
const id = z.int().check(z.minimum(0))
export const NetworkActiveTabsSchema = z.array(id)
export const NetworkBridgeFramesSchema = z.array(z.object({ tabId: id,
  frames: z.array(z.object({ frameId: id, documentId: z.string(), protectsUrl: z.optional(z.boolean()) })) }))
export const NetworkSettingsResponseSchema = z.object({ entries, recordingToken: z.optional(z.nullable(z.string())) })
export const ActivationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), reloadTabIds: z.optional(z.array(id)) }),
  z.object({ ok: z.literal(false), error: z.optional(z.string()) }),
])
export const NetworkRuntimeMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('network-page-ready') }),
  z.object({ type: z.literal('get-network-rules') }),
  z.object({ type: z.literal('sync-network-rules') }),
  z.object({ type: z.literal('update-network-rules'), entries, recordingToken: z.optional(z.nullable(z.string())) }),
  z.object({ type: z.literal('record-network-executions'), token: z.nullable(z.string()) }),
])
export const NetworkBridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({ source: z.literal('overidify-network-bridge'), type: z.literal('hello') }),
  z.object({ source: z.literal('overidify-network-bridge'), type: z.literal('config'), id, entries }),
  z.object({ source: z.literal('overidify-network-bridge'), type: z.literal('recording'), token: z.nullable(z.string()) }),
])
export const NetworkPageMessageSchema = z.discriminatedUnion('type', [
  z.object({ source: z.literal('overidify-network-page'), type: z.literal('ready') }),
  z.object({ source: z.literal('overidify-network-page'), type: z.literal('applied'), id, needsReload: z.boolean() }),
  z.object({ source: z.literal('overidify-network-page'), type: z.literal('execution'), token: z.string(), record: ExecutionRecordSchema }),
])
export const NetworkAppliedSchema = z.object({ ok: z.boolean(), needsReload: z.optional(z.boolean()) })
export type NetworkApplyResult = z.infer<typeof ActivationResultSchema>
export type NetworkApplied = z.infer<typeof NetworkAppliedSchema>
