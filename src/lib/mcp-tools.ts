import * as z from 'zod/mini'
import { getDomainPatterns, normalizeWebsiteScope } from './pattern.ts'
import { createRuleId, normalizeRequestHeaderRules, sanitizeHeaders } from './request-header-rules.ts'
import { HeaderRuleDraftSchema, SwitchRuleDraftSchema } from './request-header-schemas.ts'
import { cleanResponseHeaders, normalizeNetworkRules } from './network-rules.ts'
import type { NetworkRule } from './network-rules.ts'
import { NETWORK_METHODS, NetworkRuleDraftSchema } from './network-schemas.ts'
import { ruleType } from './rule-transfer.ts'
import type { RuleCollection, TransferRule } from './rule-transfer.ts'
import type { TransferActivation } from './rule-transfer-storage.ts'
import type { HeaderPair, HeaderRule, RequestHeaderRule, SwitchRule } from './types.ts'
import type { McpToolDefinition, McpToolResult } from './mcp-protocol.ts'
import { checkRule, mapRuleTemplates, ruleTemplateFields } from './rule-resolution.ts'
import { displayText, fromSegments, isValidVariableName, templateTokens, trimTemplate } from './templates.ts'
import type { TemplateSegment, TemplateText } from './templates.ts'
import { findVariable, indexVariables, nameKey, sortVariables, tokenName } from './variables.ts'
import type { Variable, VariableIndex } from './variables.ts'
import type { VariablesSaveResult } from './variables-page-storage.ts'

export type McpToolDeps = {
  readRules: () => Promise<RuleCollection>
  readVariables: () => Promise<Variable[]>
  /** Saves the updated rules and returns them as saved, after rules that can't run are turned off. */
  updateRules: <T>(update: (rules: RuleCollection, variables: Variable[]) => { rules: RuleCollection; result: T }) => Promise<{ result: T; rules: RuleCollection; variables: Variable[] }>
  activate: () => Promise<TransferActivation>
  /** The Variables page's save: rules the change turns off are saved in the same write, only once confirmed. Does not activate. */
  writeVariables: (input: { draft: (stored: Variable[], rules: RuleCollection) => Variable[]; confirmedTurnOff?: string[] }) => Promise<VariablesSaveResult>
}

export const MCP_INSTRUCTIONS = `Overidify is a Chrome extension that changes requests made by matching websites.
- Header Rules add or replace request headers.
- Switch Rules hold named header options; only the selected option applies.
- Network Rules return a mock response for one API request URL and method.
Every rule has a website domain list (for example localhost:4200, app.example.com, *.example.com, or * for all websites). A rule applies to requests made from browser tabs whose address-bar URL matches any listed domain, including requests to other API hosts. When several enabled rules set the same header or mock the same request, the later rule wins.
Text fields can use variables, managed with the variable tools. A variable appears in rules as {{NAME}}. Secret variables' values are never shown to agents. Writing {{NAME}} for a saved variable's name uses that variable; any other text stays literal. Secret variables can stay in rules that already use them but can't be added to others. A rule that can't run with the saved variables is turned off and lists its problems.
Changes are saved and applied immediately in the browser.`

const text = (description: string) => z.string().check(z.describe(description))
const HeaderInput = z.strictObject({
  name: text('Header name, such as Authorization.'),
  value: text('Header value.'),
})
const Websites = z.array(z.string()).check(z.describe(
  'Website domains whose tabs the rule applies to, such as ["localhost:4200", "*.example.com"]. Use ["*"] for all websites. Full URLs are reduced to their host and port.'))
const RuleId = text('Rule ID returned by list_rules or a create tool.')
const SwitchOptionInput = z.strictObject({
  name: text('Option name, unique within the rule, such as "Admin account".'),
  headers: z.array(HeaderInput).check(z.describe('Request headers this option applies when selected.')),
})
const Method = z.enum(NETWORK_METHODS).check(z.describe('HTTP method to match. ANY matches every method.'))
const Mode = z.enum(['bypass', 'call-server']).check(z.describe(
  'bypass returns the mock without calling the server. call-server makes the real request, then replaces its response with the mock.'))
const RequestUrl = text('Complete http(s) API request URL to mock. Query parameter order is ignored; names, values, and path are matched exactly.')
const Status = z.number().check(z.describe('Mock HTTP status code from 200 to 599.'))
const Body = text('Mock response body text, such as a JSON document.')
const ResponseHeaders = z.array(HeaderInput).check(z.describe('Mock response headers. Set-Cookie is not allowed.'))
const Enabled = z.boolean().check(z.describe('Whether the rule is active.'))
const Name = text('Rule name shown in Overidify.')

const ListInput = z.strictObject({
  type: z.optional(z.enum(['header', 'switch', 'network']).check(z.describe('Only list rules of this type.'))),
})
const GetInput = z.strictObject({ id: RuleId })
const CreateHeaderInput = z.strictObject({
  name: Name, websites: Websites,
  headers: z.array(HeaderInput).check(z.describe('Request headers to add or replace.')),
  enabled: z._default(Enabled, true),
})
const CreateSwitchInput = z.strictObject({
  name: Name, websites: Websites,
  options: z.array(SwitchOptionInput).check(z.describe('Named header sets to switch between. At least one.')),
  selectedOption: z.optional(text('Name of the option to apply. Defaults to the first option.')),
  enabled: z._default(Enabled, true),
})
const CreateNetworkInput = z.strictObject({
  name: Name, websites: Websites, requestUrl: RequestUrl,
  method: z._default(Method, 'GET'),
  status: z._default(Status, 200),
  body: z._default(Body, ''),
  headers: z._default(ResponseHeaders, [{ name: 'Content-Type', value: 'application/json' }]),
  mode: z._default(Mode, 'bypass'),
  enabled: z._default(Enabled, true),
})
const UpdateInput = z.strictObject({
  id: RuleId,
  name: z.optional(Name), websites: z.optional(Websites), enabled: z.optional(Enabled),
  headers: z.optional(z.array(HeaderInput).check(z.describe('Header Rule: replaces its request headers. Network Rule: replaces its mock response headers.'))),
  options: z.optional(z.array(SwitchOptionInput).check(z.describe('Switch Rule only: replaces all options. Options keep their identity when their name is unchanged.'))),
  selectedOption: z.optional(text('Switch Rule only: name of the option to apply.')),
  requestUrl: z.optional(RequestUrl), method: z.optional(Method), status: z.optional(Status),
  body: z.optional(Body), mode: z.optional(Mode),
})
const DeleteInput = z.strictObject({ ids: z.array(RuleId).check(z.describe('IDs of the rules to delete permanently.')) })

const VariableName = text('Variable name, such as STAGE_AUTH_TOKEN: letters, numbers, and _, starting with a letter or _. Names are unique ignoring case.')
const VariableValue = text('Value filled in wherever the variable is used. Inserted exactly, without trimming.')
const TurnOffRules = z.optional(z.array(z.string()).check(z.describe(
  'IDs of the rules the user agreed to turn off, as listed by a refused call. A change that would turn off any other rule is refused again. Ask the user before passing it.')))
const ListVariablesInput = z.strictObject({})
const CreateVariableInput = z.strictObject({
  name: VariableName, value: VariableValue,
  secret: z._default(z.boolean().check(z.describe('Masks the value in Overidify and hides it from agents. Agents cannot add secret variables to rules or turn Secret off.')), false),
})
const UpdateVariableInput = z.strictObject({
  name: text('Current name of the variable.'),
  newName: z.optional(VariableName.check(z.describe('New name. Rules that use the variable follow the rename.'))),
  value: z.optional(VariableValue),
  secret: z.optional(z.boolean().check(z.describe('true hides the value. Agents cannot turn Secret off.'))),
  turnOffRules: TurnOffRules,
})
const DeleteVariablesInput = z.strictObject({
  names: z.array(text('Variable name.')).check(z.describe('Names of the variables to delete permanently.')),
  turnOffRules: TurnOffRules,
})

const RUN = {
  list_rules: { input: ListInput, run: listRules },
  get_rule: { input: GetInput, run: getRule },
  create_header_rule: { input: CreateHeaderInput, run: createHeaderRule },
  create_switch_rule: { input: CreateSwitchInput, run: createSwitchRule },
  create_network_rule: { input: CreateNetworkInput, run: createNetworkRule },
  update_rule: { input: UpdateInput, run: updateRule },
  delete_rules: { input: DeleteInput, run: deleteRules },
  list_variables: { input: ListVariablesInput, run: listVariables },
  create_variable: { input: CreateVariableInput, run: createVariable },
  update_variable: { input: UpdateVariableInput, run: updateVariable },
  delete_variables: { input: DeleteVariablesInput, run: deleteVariables },
} as const
type ToolName = keyof typeof RUN

const DESCRIPTIONS: Record<ToolName, Omit<McpToolDefinition, 'name' | 'inputSchema'>> = {
  list_rules: { title: 'List rules', annotations: { readOnlyHint: true },
    description: 'List saved Header, Switch, and Network Rules in priority order. Network Rule bodies are omitted; use get_rule to read one.' },
  get_rule: { title: 'Get rule', annotations: { readOnlyHint: true },
    description: 'Read one saved rule, including a Network Rule\'s full response body.' },
  create_header_rule: { title: 'Create Header Rule', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    description: 'Create a Header Rule that adds or replaces request headers for requests made by matching websites.' },
  create_switch_rule: { title: 'Create Switch Rule', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    description: 'Create a Switch Rule with named header options, such as different test accounts. Only the selected option applies.' },
  create_network_rule: { title: 'Create Network Rule', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    description: 'Create a Network Rule that returns a mock response for an API request URL and method made by matching websites. Covers page fetch and XHR calls.' },
  update_rule: { title: 'Update rule', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Change fields of a saved rule. Omitted fields keep their saved values. Use enabled to turn a rule on or off and selectedOption to switch a Switch Rule.' },
  delete_rules: { title: 'Delete rules', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Permanently delete saved rules by ID.' },
  list_variables: { title: 'List variables', annotations: { readOnlyHint: true },
    description: 'List saved variables with the rules that use them. Secret values are omitted.' },
  create_variable: { title: 'Create variable', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    description: 'Save a variable that rule fields can use as {{NAME}}.' },
  update_variable: { title: 'Update variable', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Rename a variable, change its value, or mark it secret. Rules that use it update immediately.' },
  delete_variables: { title: 'Delete variables', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    description: 'Permanently delete variables by name. Rules that need them to run are turned off, once the user confirms.' },
}

export const MCP_TOOLS: McpToolDefinition[] = (Object.keys(RUN) as ToolName[]).map(name => {
  const inputSchema = z.toJSONSchema(RUN[name].input, { io: 'input' }) as Record<string, unknown>
  delete inputSchema.$schema
  return { name, ...DESCRIPTIONS[name], inputSchema }
})

class ToolError extends Error {}
// zod/mini omits default messages. Agents need them to correct their arguments.
const ARGUMENT_ERRORS = z.locales.en().localeError

export async function callMcpTool(name: string, args: unknown, deps: McpToolDeps): Promise<McpToolResult> {
  try {
    if (!Object.hasOwn(RUN, name)) throw new ToolError(`Unknown tool: ${name}.`)
    const tool = RUN[name as ToolName]
    const parsed = tool.input.safeParse(args ?? {}, { error: ARGUMENT_ERRORS })
    if (!parsed.success) throw new ToolError(`Invalid arguments. ${formatIssues(parsed.error.issues)}`)
    const result = await (tool.run as (input: unknown, deps: McpToolDeps) => Promise<Record<string, unknown>>)(parsed.data, deps)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result }
  } catch (error) {
    const message = error instanceof ToolError ? error.message : `Overidify could not complete this request. ${error instanceof Error ? error.message : String(error)}`
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

type RuleView = Record<string, unknown>
const TYPE_LABEL = { 'header-rule': 'header', 'switch-rule': 'switch', 'network-rule': 'network' } as const
const toHeaders = (headers: HeaderPair[]) => headers.map(({ key, value }) => ({ name: key as string, value: value as string }))
const fromHeaders = (headers: { name: string; value: string }[], link: Link): HeaderPair[] =>
  headers.map(({ name, value }) => ({ key: fromAgentText(name, link), value: fromAgentText(value, link) }))
const fromWebsites = (websites: string[], link: Link) => websites.map(website => fromAgentText(website, link))

// Agents read and write variables as {{NAME}} text, never their values.
const VARIABLE_TEXT = /\{\{([^{}]*)\}\}/g
function toAgentText<Rule extends TransferRule>(rule: Rule, index: VariableIndex): Rule {
  return mapRuleTemplates(rule, value => displayText(value, token => tokenName(token, index)))
}
/** Only text the agent sends is read this way, so saved literal text is never relinked. */
/**
 * Agents may keep a rule's existing secret variables but not add new ones: a mock or header can hand
 * the value to any website the rule matches. `keepSecrets` holds the secret variable IDs the rule
 * already uses.
 */
type Link = { index: VariableIndex; keepSecrets: ReadonlySet<string> }
function linkFor(index: VariableIndex, current?: TransferRule): Link {
  const used = current ? ruleTemplateFields(current).flatMap(templateTokens).map(token => findVariable(token, index)) : []
  return { index, keepSecrets: new Set(used.flatMap(variable => variable?.secret ? [variable.id] : [])) }
}
function fromAgentText(value: string, { index, keepSecrets }: Link): TemplateText {
  const segments: TemplateSegment[] = []
  let last = 0
  for (const match of value.matchAll(VARIABLE_TEXT)) {
    const variable = isValidVariableName(match[1]) ? index.byName.get(nameKey(match[1])) : undefined
    if (!variable) continue
    if (variable.secret && !keepSecrets.has(variable.id)) {
      throw new ToolError(`${variable.name} is a secret variable. Agents can't add secret variables to rules; add it in Overidify Settings instead.`)
    }
    segments.push(value.slice(last, match.index), { variableId: variable.id, name: variable.name })
    last = match.index + match[0].length
  }
  return fromSegments([...segments, value.slice(last)])
}

function viewRule(saved: TransferRule, includeBody: boolean, index: VariableIndex): RuleView {
  const rule = toAgentText(saved, index)
  const problems = checkRule(saved, index).problems.map(problem => problem.message)
  const base = {
    id: rule.id, type: TYPE_LABEL[ruleType(rule)], name: rule.name, enabled: rule.enabled,
    websites: getDomainPatterns(rule.url) as string[], ...problems.length ? { problems } : {},
  }
  if (!('kind' in rule)) {
    const { requestUrl, method, mode, status } = rule
    const body = rule.body as string
    return { ...base, requestUrl, method, mode, status, headers: toHeaders(rule.headers), ...includeBody ? { body } : { bodyLength: body.length } }
  }
  if (rule.kind === 'header-rule') return { ...base, headers: toHeaders(rule.headers) }
  return {
    ...base,
    selectedOption: rule.options.find(option => option.id === rule.selectedOptionId)?.name,
    options: rule.options.map(option => ({ name: option.name, headers: toHeaders(option.headers) })),
  }
}

function allRules(rules: RuleCollection): TransferRule[] {
  return [...rules.requestHeaderRules, ...rules.networkRules]
}

function findRule(rules: RuleCollection, id: string): TransferRule {
  const rule = allRules(rules).find(rule => rule.id.toLowerCase() === id.trim().toLowerCase())
  if (!rule) throw new ToolError(`No rule has ID ${id}. Use list_rules to find current IDs.`)
  return rule
}

const FIELD_NAMES: Record<string, string> = { url: 'websites', key: 'name' }
function formatIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return issues.map(issue => {
    const path = issue.path.map(part => typeof part === 'string' ? FIELD_NAMES[part] ?? part : String(part)).join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  }).join(' ')
}

function validate<T>(schema: z.ZodMiniType<unknown, T>, draft: T): void {
  const result = schema.safeParse(draft)
  if (!result.success) throw new ToolError(formatIssues(result.error.issues))
}

async function listRules({ type }: z.infer<typeof ListInput>, deps: McpToolDeps) {
  const [saved, variables] = await Promise.all([deps.readRules(), deps.readVariables()])
  const index = indexVariables(variables)
  const rules = allRules(saved).filter(rule => !type || TYPE_LABEL[ruleType(rule)] === type)
  return { rules: rules.map(rule => viewRule(rule, false, index)) }
}

async function getRule({ id }: z.infer<typeof GetInput>, deps: McpToolDeps) {
  const [saved, variables] = await Promise.all([deps.readRules(), deps.readVariables()])
  return { rule: viewRule(findRule(saved, id), true, indexVariables(variables)) }
}

function buildSwitchOptions(input: z.infer<typeof SwitchOptionInput>[], link: Link, existing: SwitchRule['options'] = []): SwitchRule['options'] {
  const previous = new Map(existing.map(option => [option.name.trim().toLowerCase(), option.id]))
  return input.map(option => ({
    id: previous.get(option.name.trim().toLowerCase()) ?? createRuleId(),
    name: option.name, headers: fromHeaders(option.headers, link),
  }))
}

function selectOption(options: SwitchRule['options'], name: string | undefined, current?: string): string {
  if (name === undefined) return options.find(option => option.id === current)?.id ?? options[0]?.id ?? createRuleId()
  const match = options.find(option => option.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (!match) throw new ToolError(`selectedOption: No option is named "${name}". Options: ${options.map(option => `"${option.name}"`).join(', ')}.`)
  return match.id
}

function buildRequestHeaderRule(draft: Omit<HeaderRule, 'order'> | Omit<SwitchRule, 'order'>, order: number): RequestHeaderRule {
  if (draft.kind === 'header-rule') {
    validate(HeaderRuleDraftSchema, draft)
    return { ...draft, name: draft.name.trim(), url: normalizeWebsiteScope(draft.url), headers: sanitizeHeaders(draft.headers), order }
  }
  validate(SwitchRuleDraftSchema, draft)
  return {
    ...draft, name: draft.name.trim(), url: normalizeWebsiteScope(draft.url), order,
    options: draft.options.map(option => ({ ...option, name: option.name.trim(), headers: sanitizeHeaders(option.headers) })),
  }
}

function buildNetworkRule(draft: Omit<NetworkRule, 'order'>, order: number): NetworkRule {
  validate(NetworkRuleDraftSchema, draft)
  return {
    ...draft, name: draft.name.trim(), url: normalizeWebsiteScope(draft.url), requestUrl: trimTemplate(draft.requestUrl),
    headers: cleanResponseHeaders(draft.headers), order,
  }
}

async function save(deps: McpToolDeps, update: (rules: RuleCollection, index: VariableIndex) => { rules: RuleCollection; rule?: TransferRule; result?: Record<string, unknown> }) {
  const saved = await deps.updateRules((rules, variables) => {
    const next = update(rules, indexVariables(variables))
    return {
      rules: {
        requestHeaderRules: normalizeRequestHeaderRules(next.rules.requestHeaderRules),
        networkRules: normalizeNetworkRules(next.rules.networkRules),
      },
      result: { rule: next.rule, result: next.result },
    }
  })
  const index = indexVariables(saved.variables)
  const id = saved.result.rule?.id
  const rule = id === undefined ? undefined : allRules(saved.rules).find(rule => rule.id === id)
  return {
    ...rule ? { rule: viewRule(rule, true, index) } : {},
    ...saved.result.result,
    activation: await activate(deps),
  }
}

async function activate(deps: McpToolDeps) {
  const activation = await deps.activate().catch((error: unknown) => ({
    ok: false, reloadTabIds: [], error: error instanceof Error ? error.message : String(error),
  }))
  return activation.ok
    ? activation.reloadTabIds.length
      ? { applied: true, note: `Saved. Reload ${activation.reloadTabIds.length} matching website tab(s) to apply the latest Network Rules.` }
      : { applied: true }
    : { applied: false, note: `Saved, but Overidify did not confirm the change is active. ${activation.error ?? ''}`.trim() }
}

function createRequestHeaderRule(deps: McpToolDeps, draft: (index: VariableIndex) => Omit<HeaderRule, 'order'> | Omit<SwitchRule, 'order'>) {
  return save(deps, (rules, index) => {
    const rule = buildRequestHeaderRule(draft(index), rules.requestHeaderRules.length)
    return { rules: { ...rules, requestHeaderRules: [...rules.requestHeaderRules, rule] }, rule }
  })
}

async function createHeaderRule(input: z.infer<typeof CreateHeaderInput>, deps: McpToolDeps) {
  return createRequestHeaderRule(deps, index => ({
    kind: 'header-rule', id: createRuleId(), name: input.name, url: fromWebsites(input.websites, linkFor(index)), enabled: input.enabled,
    headers: fromHeaders(input.headers, linkFor(index)),
  }))
}

async function createSwitchRule(input: z.infer<typeof CreateSwitchInput>, deps: McpToolDeps) {
  return createRequestHeaderRule(deps, index => {
    const link = linkFor(index)
    const options = buildSwitchOptions(input.options, link)
    return {
      kind: 'switch-rule', id: createRuleId(), name: input.name, url: fromWebsites(input.websites, link), enabled: input.enabled,
      options, selectedOptionId: selectOption(options, input.selectedOption),
    }
  })
}

async function createNetworkRule(input: z.infer<typeof CreateNetworkInput>, deps: McpToolDeps) {
  return save(deps, (rules, index) => {
    const link = linkFor(index)
    const rule = buildNetworkRule({
      id: createRuleId(), name: input.name, url: fromWebsites(input.websites, link), enabled: input.enabled,
      requestUrl: fromAgentText(input.requestUrl, link), method: input.method, mode: input.mode, status: input.status,
      body: fromAgentText(input.body, link), headers: fromHeaders(input.headers, link),
    }, rules.networkRules.length)
    return { rules: { ...rules, networkRules: [...rules.networkRules, rule] }, rule }
  })
}

const FIELDS_BY_TYPE = {
  'header-rule': ['headers'],
  'switch-rule': ['options', 'selectedOption'],
  'network-rule': ['requestUrl', 'method', 'status', 'body', 'headers', 'mode'],
} as const
const RULE_NAMES = { 'header-rule': 'Header Rule', 'switch-rule': 'Switch Rule', 'network-rule': 'Network Rule' } as const

async function updateRule(input: z.infer<typeof UpdateInput>, deps: McpToolDeps) {
  return save(deps, (rules, index) => {
    const current = findRule(rules, input.id)
    const link = linkFor(index, current)
    const type = ruleType(current)
    const allowed: readonly string[] = FIELDS_BY_TYPE[type]
    const misplaced = Object.keys(input).filter(key => !['id', 'name', 'websites', 'enabled', ...allowed].includes(key))
    if (misplaced.length) throw new ToolError(`${misplaced.join(', ')} cannot be changed on a ${RULE_NAMES[type]}.`)
    const common = { id: current.id, name: input.name ?? current.name, url: input.websites ? fromWebsites(input.websites, link) : current.url, enabled: input.enabled ?? current.enabled }

    if (!('kind' in current)) {
      const rule = buildNetworkRule({
        ...current, ...common,
        requestUrl: input.requestUrl === undefined ? current.requestUrl : fromAgentText(input.requestUrl, link), method: input.method ?? current.method, mode: input.mode ?? current.mode,
        status: input.status ?? current.status, body: input.body === undefined ? current.body : fromAgentText(input.body, link),
        headers: input.headers ? fromHeaders(input.headers, link) : current.headers,
      }, current.order)
      return { rules: { ...rules, networkRules: rules.networkRules.map(item => item.id === current.id ? rule : item) }, rule }
    }
    let rule: RequestHeaderRule
    if (current.kind === 'header-rule') {
      rule = buildRequestHeaderRule({ ...current, ...common, headers: input.headers ? fromHeaders(input.headers, link) : current.headers }, current.order)
    } else {
      const options = input.options ? buildSwitchOptions(input.options, link, current.options) : current.options
      rule = buildRequestHeaderRule({
        ...current, ...common, options, selectedOptionId: selectOption(options, input.selectedOption, current.selectedOptionId),
      }, current.order)
    }
    return { rules: { ...rules, requestHeaderRules: rules.requestHeaderRules.map(item => item.id === current.id ? rule : item) }, rule }
  })
}

async function deleteRules({ ids }: z.infer<typeof DeleteInput>, deps: McpToolDeps) {
  const wanted = new Set(ids.map(id => id.trim().toLowerCase()))
  if (!wanted.size) throw new ToolError('ids: List at least one rule ID.')
  const existing = allRules(await deps.readRules())
  const found = existing.filter(rule => wanted.has(rule.id.toLowerCase()))
  const notFound = [...wanted].filter(id => !found.some(rule => rule.id.toLowerCase() === id))
  if (!found.length) throw new ToolError(`No rules have these IDs: ${notFound.join(', ')}. Use list_rules to find current IDs.`)
  return save(deps, rules => {
    const remove = (rule: TransferRule) => wanted.has(rule.id.toLowerCase())
    const deleted = allRules(rules).filter(remove).map(rule => ({ id: rule.id, name: rule.name, type: TYPE_LABEL[ruleType(rule)] }))
    return {
      rules: { requestHeaderRules: rules.requestHeaderRules.filter(rule => !remove(rule)), networkRules: rules.networkRules.filter(rule => !remove(rule)) },
      result: { deleted, ...notFound.length ? { notFound } : {} },
    }
  })
}

type RuleRef = { id: string; name: string; type: string }
const ruleRef = (rule: TransferRule): RuleRef => ({ id: rule.id, name: rule.name, type: TYPE_LABEL[ruleType(rule)] })

function viewVariable(variable: Variable, rules: RuleCollection, index: VariableIndex) {
  const usedBy = allRules(rules).filter(rule => ruleTemplateFields(rule).flatMap(templateTokens)
    .some(token => findVariable(token, index)?.id === variable.id)).map(ruleRef)
  return { name: variable.name, secret: variable.secret, ...variable.secret ? {} : { value: variable.value }, usedBy }
}

function findVariableByName(variables: Variable[], name: string): Variable {
  const variable = variables.find(variable => nameKey(variable.name) === nameKey(name.trim()))
  if (!variable) throw new ToolError(`No variable is named ${name}. Use list_variables to find current names.`)
  return variable
}

/**
 * Rules whose references would newly resolve to a secret. A rename or a new secret can take a name
 * that a rule references but can't resolve, which would add the secret to that rule.
 */
function newSecretLinks(rules: RuleCollection, before: Variable[], after: Variable[]): string[] {
  const [was, now] = [indexVariables(before), indexVariables(after)]
  return allRules(rules).flatMap(rule => ruleTemplateFields(rule).flatMap(templateTokens).flatMap(token => {
    const variable = findVariable(token, now)
    return variable?.secret && findVariable(token, was)?.id !== variable.id ? [`"${rule.name}" would use ${variable.name}`] : []
  }))
}

async function listVariables(_input: z.infer<typeof ListVariablesInput>, deps: McpToolDeps) {
  const [rules, variables] = await Promise.all([deps.readRules(), deps.readVariables()])
  const index = indexVariables(variables)
  return { variables: sortVariables(variables).map(variable => viewVariable(variable, rules, index)) }
}

/**
 * Applies `change` to the saved list through the Variables page's save, then reports the saved variable and turned-off rules.
 * `change` runs inside the storage locks on the current variables, so its Secret checks can't act on a stale copy.
 */
async function changeVariables(deps: McpToolDeps, change: (variables: Variable[]) => { draft: Variable[]; id?: string }, turnOffRules: string[] = []) {
  let id: string | undefined
  const draft = (stored: Variable[], rules: RuleCollection) => {
    const next = change(stored)
    const links = [...new Set(newSecretLinks(rules, stored, next.draft))]
    if (links.length) throw new ToolError(`Nothing was saved. Agents can't add secret variables to rules: ${links.join(', ')}.`)
    id = next.id
    return next.draft
  }
  const saved = await deps.writeVariables({ draft, confirmedTurnOff: turnOffRules })
  if (saved.status === 'invalid') throw new ToolError(`name: ${[...new Set(Object.values(saved.errors))].join(' ')}`)
  if (saved.status === 'confirm') {
    const rules = saved.turnedOff.map(rule => `"${rule.name}" (${TYPE_LABEL[rule.type]}, ${rule.id})`).join(', ')
    throw new ToolError(`Nothing was saved. This change would turn off ${saved.turnedOff.length} rule(s) that could no longer run: ${rules}. Ask the user, then repeat the call with turnOffRules: ${JSON.stringify(saved.turnedOff.map(rule => rule.id))}.`)
  }
  const variable = id === undefined ? undefined : saved.variables.find(variable => variable.id === id)
  return {
    ...variable ? { variable: viewVariable(variable, saved.rules, indexVariables(saved.variables)) } : {},
    ...saved.turnedOff.length ? { turnedOff: saved.turnedOff.map(rule => ({ id: rule.id, name: rule.name, type: TYPE_LABEL[rule.type] })) } : {},
    activation: await activate(deps),
  }
}

async function createVariable(input: z.infer<typeof CreateVariableInput>, deps: McpToolDeps) {
  const id = createRuleId()
  return changeVariables(deps, variables => ({ draft: [...variables, { id, name: input.name.trim(), value: input.value, secret: input.secret }], id }))
}

async function updateVariable(input: z.infer<typeof UpdateVariableInput>, deps: McpToolDeps) {
  return changeVariables(deps, variables => {
    const current = findVariableByName(variables, input.name)
    if (current.secret && input.secret === false) throw new ToolError(`secret: Agents can't turn Secret off. Ask the user to change ${current.name} in Overidify Settings.`)
    const next = { ...current, name: input.newName?.trim() ?? current.name, value: input.value ?? current.value, secret: input.secret ?? current.secret }
    return { draft: variables.map(variable => variable.id === current.id ? next : variable), id: current.id }
  }, input.turnOffRules)
}

async function deleteVariables({ names, turnOffRules }: z.infer<typeof DeleteVariablesInput>, deps: McpToolDeps) {
  if (!names.length) throw new ToolError('names: List at least one variable name.')
  let deleted: string[] = []
  const result = await changeVariables(deps, variables => {
    const remove = new Set(names.map(name => findVariableByName(variables, name).id))
    deleted = variables.filter(variable => remove.has(variable.id)).map(variable => variable.name)
    return { draft: variables.filter(variable => !remove.has(variable.id)) }
  }, turnOffRules)
  return { deleted, ...result }
}
