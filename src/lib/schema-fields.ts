import * as z from 'zod/mini'
import { isValidDomainPattern } from './pattern.ts'

export const HeaderPairSchema = z.object({ key: z.string(), value: z.string() })
export const RuleIdSchema = z.pipe(z.uuid(), z.transform(value => value.toLowerCase()))
export const EntryShape = {
  id: RuleIdSchema, name: z.string(), url: z.string(), enabled: z.boolean(), order: z.number(),
}
export const WebsiteSchema = z.string().check(z.refine(isValidDomainPattern, {
  message: 'Use a website domain like localhost:4200, *.example.com, or *.',
}))
export const requiredName = (label: string) => z.string().check(z.refine(value => Boolean(value.trim()), {
  message: `${label} is required.`,
}))
