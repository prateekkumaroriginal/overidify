import * as z from 'zod/mini'

// Saved entries tolerate incomplete fields so users can edit their settings.
export const PersistedSwitchRuleOptionSchema = z.catch(z.object({
  id: z.catch(z.optional(z.string()), undefined), name: z.catch(z.string(), ''), headers: z.optional(z.unknown()),
}), { id: undefined, name: '', headers: undefined })
export const PersistedRequestHeaderRuleSchema = z.object({
  id: z.catch(z.optional(z.string()), undefined), name: z.catch(z.string(), ''),
  url: z.catch(z.string(), '*'), enabled: z.catch(z.boolean(), true),
  order: z.catch(z.optional(z.number()), undefined), kind: z.enum(['header-rule', 'switch-rule']),
  headers: z.optional(z.unknown()), options: z.catch(z.array(z.unknown()), []),
  selectedOptionId: z.optional(z.unknown()),
})
