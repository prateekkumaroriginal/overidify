import * as z from 'zod/mini'
import { RuleIdSchema } from './schema-fields.ts'

// Saved entries tolerate incomplete fields so users can edit their settings.
export const PersistedSwitchRuleOptionSchema = z.object({
  id: RuleIdSchema, name: z.catch(z.string(), ''), headers: z.optional(z.unknown()),
})
export const PersistedRequestHeaderRuleSchema = z.object({
  id: RuleIdSchema, name: z.catch(z.string(), ''),
  url: z.catch(z.string(), '*'), enabled: z.catch(z.boolean(), true),
  order: z.catch(z.optional(z.number()), undefined), kind: z.enum(['header-rule', 'switch-rule']),
  headers: z.optional(z.unknown()), options: z.catch(z.array(z.unknown()), []),
  selectedOptionId: z.optional(z.unknown()),
})
