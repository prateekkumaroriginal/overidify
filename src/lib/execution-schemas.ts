import * as z from 'zod/mini'
import { HeaderPairSchema, WebsiteScopeSchema } from './schema-fields.ts'

export const ExecutionRuleSchema = z.object({
  id: z.string(), kind: z.enum(['header-rule', 'switch-rule', 'network-rule']), name: z.string(), url: WebsiteScopeSchema,
  headers: z.array(HeaderPairSchema), option: z.optional(z.string()), requestUrl: z.optional(z.string()),
  method: z.optional(z.string()), mode: z.optional(z.string()), status: z.optional(z.number()),
  body: z.optional(z.string()), bodyOmitted: z.optional(z.string()),
})
export const ExecutionRecordSchema = z.object({
  id: z.string(), time: z.number(), startedAt: z.number(), source: z.enum(['chrome', 'interceptor']), result: z.enum(['Matched', 'Mocked', 'Failed']),
  rule: ExecutionRuleSchema,
  request: z.optional(z.object({ url: z.string(), method: z.string(), type: z.optional(z.string()), frameId: z.optional(z.number()) })),
  response: z.optional(z.object({ status: z.number(), headers: z.array(HeaderPairSchema), body: z.optional(z.string()), bodyOmitted: z.optional(z.string()) })),
  error: z.optional(z.string()),
})
export const HeaderLedgerSchema = z.object({ next: z.int(), entries: z.array(z.object({
  id: z.int(), tabId: z.int(), signature: z.string(), rule: ExecutionRuleSchema, retiredAt: z.optional(z.number()),
})) })
