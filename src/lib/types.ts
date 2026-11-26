import type * as z from 'zod/mini'
import type { HeaderPairSchema, PlainHeaderPairSchema } from './schema-fields.ts'
import type { RequestHeaderRuleSchema, HeaderRuleSchema, SwitchRuleSchema, HeaderRuleDraftSchema, SwitchRuleDraftSchema, SwitchRuleOptionSchema } from './request-header-schemas.ts'
import type { PlainWebsiteScope } from './pattern.ts'

/** A header whose name and value may hold variable references. */
export type HeaderPair = z.infer<typeof HeaderPairSchema>
/** A header with variables filled in. */
export type PlainHeaderPair = z.infer<typeof PlainHeaderPairSchema>
export type HeaderRule = z.infer<typeof HeaderRuleSchema>
export type SwitchRule = z.infer<typeof SwitchRuleSchema>
export type SwitchRuleOption = z.infer<typeof SwitchRuleOptionSchema>
export type RequestHeaderRule = z.infer<typeof RequestHeaderRuleSchema>
export type HeaderRuleDraft = z.infer<typeof HeaderRuleDraftSchema>
export type SwitchRuleDraft = z.infer<typeof SwitchRuleDraftSchema>

/** What execution history shows: templates as `{{NAME}}` text, never variable values. */
export type RuleDisplay = { url: PlainWebsiteScope; headers: PlainHeaderPair[] }
/** A Header or Switch Rule with variables filled in. A Switch Rule keeps only its selected option. */
export type ResolvedRequestHeaderRule = {
  id: string; kind: 'header-rule' | 'switch-rule'; name: string; url: PlainWebsiteScope; enabled: boolean; order: number
  headers: PlainHeaderPair[]; option?: string; display: RuleDisplay
  /** Header Rules only: request domains, and their subdomains, that don't get the headers. */
  excludedRequestDomains?: string[]
}
