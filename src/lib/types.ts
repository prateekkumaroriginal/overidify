import type * as z from 'zod/mini'
import type { HeaderPairSchema } from './schema-fields.ts'
import type { HeaderEntrySchema, HeaderRuleSchema, HeaderSwitcherSchema, RuleDraftSchema, SwitcherDraftSchema, SwitcherOptionSchema } from './header-schemas.ts'

export type HeaderPair = z.infer<typeof HeaderPairSchema>
export type HeaderRule = z.infer<typeof HeaderRuleSchema>
export type HeaderSwitcher = z.infer<typeof HeaderSwitcherSchema>
export type SwitcherOption = z.infer<typeof SwitcherOptionSchema>
export type HeaderEntry = z.infer<typeof HeaderEntrySchema>
export type RuleDraft = z.infer<typeof RuleDraftSchema>
export type SwitcherDraft = z.infer<typeof SwitcherDraftSchema>
