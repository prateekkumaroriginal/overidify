import * as z from 'zod/mini'
import { EntryShape, HeaderPairSchema, requiredName, WebsiteSchema } from './schema-fields.ts'

export const HeaderRuleSchema = z.object({ ...EntryShape, kind: z.literal('header-rule'), headers: z.array(HeaderPairSchema) })
export const SwitchRuleOptionSchema = z.object({ id: z.string(), name: z.string(), headers: z.array(HeaderPairSchema) })
export const SwitchRuleSchema = z.object({
  ...EntryShape, kind: z.literal('switch-rule'), options: z.array(SwitchRuleOptionSchema), selectedOptionId: z.string(),
})
export const RequestHeaderRuleSchema = z.discriminatedUnion('kind', [HeaderRuleSchema, SwitchRuleSchema])
const RequestHeadersSchema = z.array(HeaderPairSchema).check(
  z.refine(headers => headers.some(header => header.key.trim() || header.value.trim()), { message: 'Add at least one header pair.' }),
  z.superRefine((headers, context) => {
    headers.forEach((header, index) => {
      const key = header.key.trim(), value = header.value.trim()
      if ((key || value) && (!key || !value)) context.addIssue({
        code: 'custom', path: [index, key ? 'value' : 'key'], message: 'Each header pair needs a name and a value.',
      })
    })
  }),
)
export const HeaderRuleDraftSchema = z.object({
  name: requiredName('Header rule name'), url: WebsiteSchema, enabled: z.boolean(), headers: RequestHeadersSchema,
})
export const SwitchRuleDraftSchema = z.object({
  name: requiredName('Switch rule name'), url: WebsiteSchema, enabled: z.boolean(), selectedOptionId: z.string(),
  options: z.array(z.object({ id: z.string(), name: requiredName('Option name'), headers: RequestHeadersSchema })).check(z.minLength(1)),
}).check(z.superRefine((draft, context) => {
  const names = new Set<string>()
  draft.options.forEach((option, index) => {
    const name = option.name.trim().toLowerCase()
    if (names.has(name)) context.addIssue({ code: 'custom', path: ['options', index, 'name'], message: 'Give each option a different name.' })
    names.add(name)
  })
}))
