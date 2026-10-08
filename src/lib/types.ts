export type HeaderPair = {
  key: string
  value: string
}

type EntryBase = {
  id: string
  name: string
  url: string
  enabled: boolean
  order: number
}

export type HeaderRule = EntryBase & {
  kind: 'rule'
  headers: HeaderPair[]
}

export type SwitcherOption = {
  id: string
  name: string
  headers: HeaderPair[]
}

export type HeaderSwitcher = EntryBase & {
  kind: 'switcher'
  options: SwitcherOption[]
  selectedOptionId: string
}

export type HeaderEntry = HeaderRule | HeaderSwitcher

export type RuleDraft = Pick<HeaderRule, 'name' | 'url' | 'enabled' | 'headers'>
export type SwitcherDraft = Pick<HeaderSwitcher, 'name' | 'url' | 'enabled' | 'options' | 'selectedOptionId'>
