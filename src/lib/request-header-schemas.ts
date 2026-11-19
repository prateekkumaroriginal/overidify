import * as z from 'zod/mini'
import { EntryShape, HeaderPairSchema, isBlank, requiredName, RuleIdSchema, WebsiteSchema } from './schema-fields.ts'
import { displayText, TemplateTextSchema, trimTemplateEdges } from './templates.ts'

export const HeaderRuleSchema = z.object({ ...EntryShape, kind: z.literal('header-rule'), headers: z.array(HeaderPairSchema) })
export const SwitchRuleOptionSchema = z.object({ id: RuleIdSchema, name: TemplateTextSchema, headers: z.array(HeaderPairSchema) })
export const SwitchRuleSchema = z.object({
  ...EntryShape, kind: z.literal('switch-rule'), options: z.array(SwitchRuleOptionSchema), selectedOptionId: RuleIdSchema,
})
export const RequestHeaderRuleSchema = z.discriminatedUnion('kind', [HeaderRuleSchema, SwitchRuleSchema])
// A reference counts as content, so a pair is empty only when both parts are empty.
const RequestHeadersSchema = z.array(HeaderPairSchema).check(
  z.refine(headers => headers.some(header => !isBlank(header.key) || !isBlank(header.value)), { message: 'Add at least one header pair.' }),
  z.superRefine((headers, context) => {
    headers.forEach((header, index) => {
      const key = !isBlank(header.key), value = !isBlank(header.value)
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
  name: requiredName('Switch rule name'), url: WebsiteSchema, enabled: z.boolean(), selectedOptionId: RuleIdSchema,
  options: z.array(z.object({ id: RuleIdSchema, name: requiredName('Option name'), headers: RequestHeadersSchema })).check(z.minLength(1)),
}).check(z.superRefine((draft, context) => {
  // Option names are unique by display text, so a reference stays distinct from other text.
  const names = new Set<string>()
  draft.options.forEach((option, index) => {
    const name = displayText(trimTemplateEdges(option.name)).toLowerCase()
    if (names.has(name)) context.addIssue({ code: 'custom', path: ['options', index, 'name'], message: 'Give each option a different name.' })
    names.add(name)
  })
}))
