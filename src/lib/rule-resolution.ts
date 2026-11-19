import { getDomainPattern, getDomainPatterns, isValidDomainPattern } from './pattern.ts'
import type { PlainWebsiteScope, WebsiteScope } from './pattern.ts'
import { requestUrlKey } from './network-matching.ts'
import type { NetworkRule, ResolvedNetworkRule } from './network-rules.ts'
import { responseHeaderProblem } from './network-schemas.ts'
import { getSelectedOption } from './request-header-rules.ts'
import { displayText, hasTokens, mapTokens } from './templates.ts'
import type { TemplateText } from './templates.ts'
import { findVariable, indexVariables, resolveTemplate, tokenName } from './variables.ts'
import type { Variable, VariableIndex } from './variables.ts'
import type { HeaderPair, PlainHeaderPair, RequestHeaderRule, ResolvedRequestHeaderRule } from './types.ts'

/** A field that cannot run with the current variables. Messages name variables, never values. */
export type RuleProblem = { field: string; path: (string | number)[]; message: string }
export type RuleCheck = {
  /** Problems that keep the rule from running. A Switch Rule counts only its selected option. */
  problems: RuleProblem[]
  /** Problems in every Switch option, keyed by option ID. */
  optionProblems: Record<string, RuleProblem[]>
  /** Website domains with variables filled in, or null when one of them cannot be filled in. */
  domains: string[] | null
}
const TOKEN_HEADER_NAME = /^[!#$%&'*+.^_`|~\w-]+$/
const AFTER = 'after variables are filled in.'

function missingMessage(names: string[]) {
  return names.length === 1 ? `Missing variable ${names[0]}.` : `Missing variables ${names.join(', ')}.`
}

class FieldResolver {
  problems: RuleProblem[] = []
  readonly index: VariableIndex
  constructor(index: VariableIndex) { this.index = index }
  /** Literal fields keep their saved validation. Only fields with variables are checked here. */
  text(value: TemplateText, field: string, path: RuleProblem['path'], check?: (resolved: string) => boolean): string | undefined {
    if (!hasTokens(value)) return value as string
    const resolved = resolveTemplate(value, this.index)
    if (!resolved.ok) { this.problems.push({ field, path, message: missingMessage(resolved.missing) }); return undefined }
    if (check && !check(resolved.value)) { this.problems.push({ field, path, message: `${field} is not valid ${AFTER}` }); return undefined }
    return resolved.value
  }
  display(value: TemplateText) { return displayText(value, token => tokenName(token, this.index)) }
}

function resolveDomains(scope: WebsiteScope, resolver: FieldResolver): string[] | null {
  let valid = true
  const domains = getDomainPatterns(scope).map((domain, index) => {
    const resolved = resolver.text(domain, 'Website domain', ['url', index], isValidDomainPattern)
    if (resolved === undefined) valid = false
    return resolved === undefined ? '' : hasTokens(domain) ? getDomainPattern(resolved) : resolved
  })
  return valid ? domains : null
}

function resolveRequestHeaders(headers: HeaderPair[], resolver: FieldResolver, path: RuleProblem['path']): PlainHeaderPair[] | null {
  let valid = true
  const resolved = headers.flatMap((header, index) => {
    const key = resolver.text(header.key, 'Header name', [...path, index, 'key'], value => TOKEN_HEADER_NAME.test(value))
    const value = resolver.text(header.value, 'Header value', [...path, index, 'value'], value => !!value && !/[\r\n\0]/.test(value))
    if (key === undefined || value === undefined) { valid = false; return [] }
    return [{ key, value }]
  })
  return valid ? resolved : null
}

function displayHeaders(headers: HeaderPair[], resolver: FieldResolver): PlainHeaderPair[] {
  return headers.map(header => ({ key: resolver.display(header.key), value: resolver.display(header.value) }))
}

const plainScope = (domains: string[]): PlainWebsiteScope => domains.length === 1 ? domains[0] : domains

export function resolveRequestHeaderRule(rule: RequestHeaderRule, index: VariableIndex): RuleCheck & { resolved?: ResolvedRequestHeaderRule } {
  const resolver = new FieldResolver(index)
  const domains = resolveDomains(rule.url, resolver)
  const display = { url: plainScope(getDomainPatterns(rule.url).map(domain => resolver.display(domain))) }
  if (rule.kind === 'header-rule') {
    const headers = resolveRequestHeaders(rule.headers, resolver, ['headers'])
    const check = { problems: resolver.problems, optionProblems: {}, domains }
    if (!headers || !domains || check.problems.length) return check
    return { ...check, resolved: { id: rule.id, kind: rule.kind, name: rule.name, url: plainScope(domains), enabled: rule.enabled, order: rule.order,
      headers, display: { ...display, headers: displayHeaders(rule.headers, resolver) } } }
  }
  const selected = getSelectedOption(rule)
  const optionProblems: Record<string, RuleProblem[]> = {}
  const selection: { headers: PlainHeaderPair[] | null } = { headers: null }
  rule.options.forEach((option, optionIndex) => {
    const optionResolver = new FieldResolver(index)
    const headers = resolveRequestHeaders(option.headers, optionResolver, ['options', optionIndex, 'headers'])
    optionProblems[option.id] = optionResolver.problems
    if (option === selected) selection.headers = headers
  })
  const selectedHeaders = selection.headers
  const problems = [...resolver.problems, ...optionProblems[selected.id] ?? []]
  const check = { problems, optionProblems, domains }
  if (!selectedHeaders || !domains || problems.length) return check
  return { ...check, resolved: { id: rule.id, kind: rule.kind, name: rule.name, url: plainScope(domains), enabled: rule.enabled, order: rule.order,
    headers: selectedHeaders, option: selected.name, display: { ...display, headers: displayHeaders(selected.headers, resolver) } } }
}

export function resolveNetworkRule(rule: NetworkRule, index: VariableIndex): RuleCheck & { resolved?: ResolvedNetworkRule } {
  const resolver = new FieldResolver(index)
  const domains = resolveDomains(rule.url, resolver)
  const requestUrl = resolver.text(rule.requestUrl, 'Request URL', ['requestUrl'], value => requestUrlKey(value) !== null)
  const body = resolver.text(rule.body, 'Response body', ['body'])
  let headersValid = true
  const headers = rule.headers.flatMap((header, headerIndex) => {
    const key = resolver.text(header.key, 'Response header name', ['headers', headerIndex, 'key'])
    const value = resolver.text(header.value, 'Response header value', ['headers', headerIndex, 'value'])
    if (key === undefined || value === undefined) { headersValid = false; return [] }
    if ((hasTokens(header.key) || hasTokens(header.value)) && responseHeaderProblem(key, value)) {
      resolver.problems.push({ field: 'Response header', path: ['headers', headerIndex, 'key'], message: `Response header is not valid ${AFTER}` })
      headersValid = false
      return []
    }
    return [{ key, value }]
  })
  const check = { problems: resolver.problems, optionProblems: {}, domains }
  if (!domains || requestUrl === undefined || body === undefined || !headersValid || check.problems.length) return check
  return { ...check, resolved: { id: rule.id, name: rule.name, url: plainScope(domains), enabled: rule.enabled, order: rule.order,
    requestUrl, method: rule.method, mode: rule.mode, body, status: rule.status, headers,
    display: { url: plainScope(getDomainPatterns(rule.url).map(domain => resolver.display(domain))), requestUrl: resolver.display(rule.requestUrl),
      body: resolver.display(rule.body), headers: displayHeaders(rule.headers, resolver) } } }
}

export function checkRule(rule: RequestHeaderRule | NetworkRule, index: VariableIndex): RuleCheck {
  return 'kind' in rule ? resolveRequestHeaderRule(rule, index) : resolveNetworkRule(rule, index)
}

export type ResolvedRules = {
  /** Enabled rules that can run, with variables filled in. */
  requestHeaderRules: ResolvedRequestHeaderRule[]
  networkRules: ResolvedNetworkRule[]
  checks: Map<string, RuleCheck>
}

/** The single path from saved rules to the concrete rules that run and match websites. */
export function resolveRules(rules: { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }, variables: readonly Variable[]): ResolvedRules {
  const index = indexVariables(variables)
  const result: ResolvedRules = { requestHeaderRules: [], networkRules: [], checks: new Map() }
  for (const rule of rules.requestHeaderRules) {
    const { resolved, ...check } = resolveRequestHeaderRule(rule, index)
    result.checks.set(rule.id, check)
    if (resolved?.enabled) result.requestHeaderRules.push(resolved)
  }
  for (const rule of rules.networkRules) {
    const { resolved, ...check } = resolveNetworkRule(rule, index)
    result.checks.set(rule.id, check)
    if (resolved?.enabled) result.networkRules.push(resolved)
  }
  return result
}

/** Rewrites every field of a rule that can hold variables. */
export function mapRuleTemplates<Rule extends RequestHeaderRule | NetworkRule>(rule: Rule, map: (value: TemplateText) => TemplateText): Rule {
  const url = Array.isArray(rule.url) ? rule.url.map(map) : map(rule.url)
  const pairs = (headers: HeaderPair[]) => headers.map(header => ({ key: map(header.key), value: map(header.value) }))
  if (!('kind' in rule)) return { ...rule, url, requestUrl: map(rule.requestUrl), body: map(rule.body), headers: pairs(rule.headers) }
  if (rule.kind === 'header-rule') return { ...rule, url, headers: pairs(rule.headers) }
  return { ...rule, url, options: rule.options.map(option => ({ ...option, headers: pairs(option.headers) })) }
}

/**
 * Prepares rules for storage with the saved variables:
 * - Tokens take their variable's current ID and name, so exports name them correctly and a variable
 *   recreated under a deleted name stays linked.
 * - A rule that can't run because of its variables is turned off. Every rule write applies this,
 *   so no rule stays on while it can't run. Fixing the variable does not turn the rule back on.
 */
export function prepareRulesForSave<Rule extends RequestHeaderRule | NetworkRule>(rules: Rule[], variables: readonly Variable[]): { rules: Rule[]; turnedOff: Rule[]; changed: boolean } {
  const index = indexVariables(variables)
  const turnedOff: Rule[] = []
  let changed = false
  const next = rules.map(input => {
    let rule = mapRuleTemplates(input, value => mapTokens(value, token => {
      const variable = findVariable(token, index)
      if (!variable || (variable.id === token.variableId && variable.name === token.name)) return token
      changed = true
      return { variableId: variable.id, name: variable.name }
    }))
    if (rule.enabled && checkRule(rule, index).problems.length) {
      turnedOff.push(rule)
      rule = { ...rule, enabled: false }
      changed = true
    }
    return rule
  })
  return { rules: changed ? next : rules, turnedOff, changed }
}

/** Every text field of a rule that can hold variables, for usage counts. */
export function ruleTemplateFields(rule: RequestHeaderRule | NetworkRule): TemplateText[] {
  const pairs = (headers: HeaderPair[]) => headers.flatMap(header => [header.key, header.value])
  const fields = [...getDomainPatterns(rule.url)]
  if (!('kind' in rule)) return [...fields, rule.requestUrl, rule.body, ...pairs(rule.headers)]
  if (rule.kind === 'header-rule') return [...fields, ...pairs(rule.headers)]
  return [...fields, ...rule.options.flatMap(option => pairs(option.headers))]
}

export const hasProblems = (check: RuleCheck | undefined) => !!check?.problems.length
