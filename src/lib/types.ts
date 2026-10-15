import type * as z from 'zod/mini'
import type { HeaderPairSchema } from './schema-fields.ts'
import type { RequestHeaderRuleSchema, HeaderRuleSchema, SwitchRuleSchema, HeaderRuleDraftSchema, SwitchRuleDraftSchema, SwitchRuleOptionSchema } from './request-header-schemas.ts'

export type HeaderPair = z.infer<typeof HeaderPairSchema>
export type HeaderRule = z.infer<typeof HeaderRuleSchema>
export type SwitchRule = z.infer<typeof SwitchRuleSchema>
export type SwitchRuleOption = z.infer<typeof SwitchRuleOptionSchema>
export type RequestHeaderRule = z.infer<typeof RequestHeaderRuleSchema>
export type HeaderRuleDraft = z.infer<typeof HeaderRuleDraftSchema>
export type SwitchRuleDraft = z.infer<typeof SwitchRuleDraftSchema>
