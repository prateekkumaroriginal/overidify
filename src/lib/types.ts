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

// Concrete shapes after variables are filled in. Only resolution creates them.
export type ResolvedHeaderPair = { key: string; value: string }
export type ResolvedHeaderRule = Omit<HeaderRule, 'name' | 'url' | 'headers'> & { name: string; url: string | string[]; headers: ResolvedHeaderPair[] }
export type ResolvedSwitchRuleOption = { id: string; name: string; headers: ResolvedHeaderPair[] }
export type ResolvedSwitchRule = Omit<SwitchRule, 'name' | 'url' | 'options'> & { name: string; url: string | string[]; options: ResolvedSwitchRuleOption[] }
export type ResolvedRequestHeaderRule = ResolvedHeaderRule | ResolvedSwitchRule
