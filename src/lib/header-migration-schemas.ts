import * as z from 'zod/mini'

// Migration inputs tolerate missing fields; save and activation validation is
// separate so old data remains editable.
export const LegacyOptionSchema = z.catch(z.object({
  id: z.catch(z.optional(z.string()), undefined), name: z.catch(z.string(), ''), headers: z.optional(z.unknown()),
}), { id: undefined, name: '', headers: undefined })
export const LegacyEntrySchema = z.catch(z.object({
  id: z.catch(z.optional(z.string()), undefined), name: z.catch(z.string(), ''),
  url: z.catch(z.string(), '*'), enabled: z.catch(z.boolean(), true),
  order: z.catch(z.optional(z.number()), undefined), kind: z.optional(z.unknown()),
  headers: z.optional(z.unknown()), options: z.catch(z.array(z.unknown()), []),
  selectedOptionId: z.optional(z.unknown()),
}), { id: undefined, name: '', url: '*', enabled: true, order: undefined, options: [] })
