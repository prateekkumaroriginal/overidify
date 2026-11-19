import { getDomainPattern, getDomainPatterns, isValidDomainPattern, matchesPageDomain } from './pattern.ts'
import { isJsonResponse, requestUrlKey } from './network-rules.ts'
import type { NetworkRule, ResolvedNetworkRule } from './network-rules.ts'
import { responseHeaderProblem } from './network-schemas.ts'
import { getSelectedOption } from './request-header-rules.ts'
import { isBlank } from './schema-fields.ts'
import { displayText, hasReferences, resolveTemplate } from './templates.ts'
import type { TemplateText } from './templates.ts'
import type { ExecutionRule } from './execution-history.ts'
import type { HeaderPair, RequestHeaderRule, ResolvedHeaderPair, ResolvedRequestHeaderRule, ResolvedSwitchRuleOption } from './types.ts'

export type IssuePath = (string | number)[]
/** Messages name variables and fields, never values. */
export type RuleIssue = { field: string; path: IssuePath; message: string; missing: string[] }
export type RuleResolution = {
  id: string
  kind: 'header-rule' | 'switch-rule' | 'network-rule'
  enabled: boolean
  /** Enabled, with every applicable field resolved and valid. */
  active: boolean
  /** Problems that keep the rule inactive. For Switch Rules only the selected option counts. */
  issues: RuleIssue[]
  /** Every Switch option's problems, keyed by option ID, including unselected options. */
  optionIssues: Record<string, RuleIssue[]>
  /** Resolved website domains, or null when a domain with a reference cannot be resolved into a valid domain. */
  domains: string[] | null
}
export type ActiveRequestHeaderRule = ResolvedRequestHeaderRule & { execution: ExecutionRule }
export type NetworkTemplated = { requestUrl: boolean; responseHeaders: boolean; body: boolean }
export type ActiveNetworkRule = ResolvedNetworkRule & { execution: ExecutionRule; templated: NetworkTemplated }
export type RulesResolution = {
  requestHeaderRules: ActiveRequestHeaderRule[]
  networkRules: ActiveNetworkRule[]
  byId: Map<string, RuleResolution>
}
type Values = ReadonlyMap<string, string>

const AFTER = 'after variables are filled in.'
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~\w-]+$/

function missingMessage(names: string[]) {
  return names.length === 1 ? `Missing variable ${names[0]}` : `Missing variables ${names.join(', ')}`
}

class IssueCollector {
  issues: RuleIssue[] = []
  private values: Values
  constructor(values: Values) { this.values = values }
  /** Literal-only fields keep today's validation; only fields with references are checked here. */
  field(value: TemplateText, field: string, path: IssuePath, validate?: (resolved: string) => string): string | undefined {
    if (!hasReferences(value)) return displayText(value)
    const resolved = resolveTemplate(value, this.values)
    if (!resolved.ok) {
      this.issues.push({ field, path, message: missingMessage(resolved.missing), missing: resolved.missing })
      return undefined
    }
    const message = validate?.(resolved.value)
    if (message) { this.issues.push({ field, path, message, missing: [] }); return undefined }
    return resolved.value
  }
}

const nameCheck = (resolved: string) => resolved.trim() ? '' : `Name is empty ${AFTER}`

function resolveDomains(scope: RequestHeaderRule['url'], collector: IssueCollector): string[] | null {
  let valid = true
  const domains = getDomainPatterns(scope).map((domain, index) => {
    const resolved = collector.field(domain, 'Website domain', ['url', index], value => isValidDomainPattern(value) ? '' : `Website domain is not valid ${AFTER}`)
    if (resolved === undefined) { valid = false; return '' }
    return hasReferences(domain) ? getDomainPattern(resolved) : resolved
  })
  return valid ? domains : null
}

function resolveRequestHeaders(headers: HeaderPair[], collector: IssueCollector, path: IssuePath, prefix: string): ResolvedHeaderPair[] | null {
  let valid = true
  const resolved: ResolvedHeaderPair[] = []
  headers.forEach((header, index) => {
    if (isBlank(header.key) && isBlank(header.value)) return
    const key = collector.field(header.key, `${prefix}Header name`, [...path, index, 'key'], value => HEADER_TOKEN.test(value) ? '' : `Header name is not valid ${AFTER}`)
    const value = collector.field(header.value, `${prefix}Header value`, [...path, index, 'value'], value => value && !/[\r\n\0]/.test(value) ? '' : `Header value is empty or contains a line break ${AFTER}`)
    if (key === undefined || value === undefined) valid = false
    else resolved.push({ key, value })
  })
  return valid ? resolved : null
}

function resolveResponseHeaders(headers: HeaderPair[], collector: IssueCollector): ResolvedHeaderPair[] | null {
  let valid = true
  const resolved: ResolvedHeaderPair[] = []
  headers.forEach((header, index) => {
    if (isBlank(header.key) && isBlank(header.value)) return
    const key = collector.field(header.key, 'Response header name', ['headers', index, 'key'])
    const value = collector.field(header.value, 'Response header value', ['headers', index, 'value'])
    if (key === undefined || value === undefined) { valid = false; return }
    if (hasReferences(header.key) || hasReferences(header.value)) {
      const problem = responseHeaderProblem(key, value, false)
      if (problem) {
        collector.issues.push({ field: 'Response header', path: ['headers', index, 'key'], message: `${problem.replace(/\.$/, '')} ${AFTER}`, missing: [] })
        valid = false
        return
      }
      if (!key && !value) return
    }
    resolved.push({ key, value })
  })
  return valid ? resolved : null
}

const scopeOf = (domains: string[]) => domains.length === 1 ? domains[0] : domains

function headerExecution(rule: RequestHeaderRule): ExecutionRule {
  const headers = rule.kind === 'header-rule' ? rule.headers : getSelectedOption(rule).headers
  return { id: rule.id, kind: rule.kind, name: structuredClone(rule.name), url: structuredClone(rule.url), headers: structuredClone(headers),
    ...(rule.kind === 'switch-rule' ? { option: structuredClone(getSelectedOption(rule).name) } : {}) }
}

export function resolveRequestHeaderRule(rule: RequestHeaderRule, values: Values): { resolution: RuleResolution; active?: ActiveRequestHeaderRule } {
  const ruleIssues = new IssueCollector(values)
  ruleIssues.field(rule.name, 'Rule name', ['name'], nameCheck)
  const domains = resolveDomains(rule.url, ruleIssues)
  const base = { id: rule.id, kind: rule.kind, enabled: rule.enabled, domains }
  if (rule.kind === 'header-rule') {
    const headers = resolveRequestHeaders(rule.headers, ruleIssues, ['headers'], '')
    const issues = ruleIssues.issues
    const resolution: RuleResolution = { ...base, issues, optionIssues: {}, active: rule.enabled && !issues.length }
    if (!resolution.active || !headers || !domains) return { resolution }
    return { resolution, active: { ...rule, name: displayText(rule.name), url: scopeOf(domains), headers, execution: headerExecution(rule) } }
  }
  const optionIssues: Record<string, RuleIssue[]> = {}
  let selected: ResolvedSwitchRuleOption | undefined
  const selectedOption = getSelectedOption(rule)
  rule.options.forEach((option, index) => {
    const collector = new IssueCollector(values)
    const prefix = `Option "${displayText(option.name)}" · `
    collector.field(option.name, `${prefix}Option name`, ['options', index, 'name'], nameCheck)
    const headers = resolveRequestHeaders(option.headers, collector, ['options', index, 'headers'], prefix)
    optionIssues[option.id] = collector.issues
    if (option === selectedOption && headers) selected = { id: option.id, name: displayText(option.name), headers }
  })
  const issues = [...ruleIssues.issues, ...selectedOption ? optionIssues[selectedOption.id] : []]
  const resolution: RuleResolution = { ...base, issues, optionIssues, active: rule.enabled && !issues.length }
  if (!resolution.active || !selected || !domains) return { resolution }
  return { resolution, active: { ...rule, name: displayText(rule.name), url: scopeOf(domains), options: [selected], selectedOptionId: selected.id, execution: headerExecution(rule) } }
}

export function resolveNetworkRule(rule: NetworkRule, values: Values): { resolution: RuleResolution; active?: ActiveNetworkRule } {
  const collector = new IssueCollector(values)
  collector.field(rule.name, 'Rule name', ['name'], nameCheck)
  const domains = resolveDomains(rule.url, collector)
  const requestUrl = collector.field(rule.requestUrl, 'Request URL', ['requestUrl'], value => requestUrlKey(value) === null ? `Request URL is not a complete HTTP or HTTPS URL ${AFTER}` : '')
  const body = collector.field(rule.body, 'Response body', ['body'])
  const headers = resolveResponseHeaders(rule.headers, collector)
  const issues = collector.issues
  const resolution: RuleResolution = { id: rule.id, kind: 'network-rule', enabled: rule.enabled, domains, issues, optionIssues: {}, active: rule.enabled && !issues.length }
  if (!resolution.active || !domains || requestUrl === undefined || body === undefined || !headers) return { resolution }
  const templated = {
    requestUrl: hasReferences(rule.requestUrl), body: hasReferences(rule.body),
    responseHeaders: rule.headers.some(header => hasReferences(header.key) || hasReferences(header.value)),
  }
  const execution: ExecutionRule = { id: rule.id, kind: 'network-rule', name: structuredClone(rule.name), url: structuredClone(rule.url),
    headers: structuredClone(rule.headers), requestUrl: structuredClone(rule.requestUrl), method: rule.method, mode: rule.mode, status: rule.status, body: structuredClone(rule.body) }
  return { resolution, active: { ...rule, name: displayText(rule.name), url: scopeOf(domains), requestUrl, body, headers, execution, templated } }
}

/** The only path from saved templates to concrete rules, shared by every surface. */
export function resolveRules(rules: { requestHeaderRules: RequestHeaderRule[]; networkRules: NetworkRule[] }, values: Values): RulesResolution {
  const result: RulesResolution = { requestHeaderRules: [], networkRules: [], byId: new Map() }
  for (const rule of rules.requestHeaderRules) {
    const { resolution, active } = resolveRequestHeaderRule(rule, values)
    result.byId.set(rule.id, resolution)
    if (active) result.requestHeaderRules.push(active)
  }
  for (const rule of rules.networkRules) {
    const { resolution, active } = resolveNetworkRule(rule, values)
    result.byId.set(rule.id, resolution)
    if (active) result.networkRules.push(active)
  }
  return result
}

/** Website eligibility for any surface. A domain that cannot be resolved matches no page. */
export function matchesRuleWebsite(resolution: RuleResolution | undefined, pageUrl: string): boolean {
  return !!resolution?.domains && matchesPageDomain(resolution.domains, pageUrl)
}

export function hasVariableProblem(resolution: RuleResolution | undefined): boolean {
  return !!resolution && (resolution.issues.length > 0 || Object.values(resolution.optionIssues).some(issues => issues.length > 0))
}

/** A short reason such as "missing AUTH_TOKEN" for compact surfaces. */
export function problemSummary(issues: RuleIssue[]): string {
  const missing = [...new Set(issues.flatMap(issue => issue.missing))]
  if (missing.length) return `missing ${missing.join(', ')}`
  const first = issues[0]
  return first ? `${first.field}: ${first.message}` : ''
}

export const JSON_VARIABLE_WARNING = 'With current variable values, the body is not valid JSON. You can still save and return this text.'

/** Checks a body with references against current saved values without revealing them. */
export function templateJsonWarning(body: TemplateText, headers: HeaderPair[], values: Values): string | null {
  if (!hasReferences(body)) return null
  const resolvedBody = resolveTemplate(body, values)
  if (!resolvedBody.ok) return null
  const resolvedHeaders = headers.flatMap(header => {
    const key = resolveTemplate(header.key, values), value = resolveTemplate(header.value, values)
    return key.ok && value.ok ? [{ key: key.value, value: value.value }] : []
  })
  if (!isJsonResponse(resolvedHeaders)) return null
  try { JSON.parse(resolvedBody.value); return null } catch { return JSON_VARIABLE_WARNING }
}
