import * as z from 'zod/mini'
import { NetworkOverrideSchema } from './network-schemas.ts'

const entries = z.array(NetworkOverrideSchema)
const id = z.int().check(z.minimum(0))
export const NetworkSettingsResponseSchema = z.object({ entries })
export const ActivationResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), reloadTabIds: z.optional(z.array(id)) }),
  z.object({ ok: z.literal(false), error: z.optional(z.string()) }),
])
export const NetworkRuntimeMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('get-network-overrides') }),
  z.object({ type: z.literal('sync-network-overrides') }),
  z.object({ type: z.literal('update-network-overrides'), entries }),
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
