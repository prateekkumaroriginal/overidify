export type HeaderPair = {
  key: string
  value: string
}

export type HeaderRule = {
  id: string
  name: string
  url: string
  enabled: boolean
  headers: HeaderPair[]
  order: number
}

export type RuleDraft = {
  name: string
  url: string
  enabled: boolean
  headers: HeaderPair[]
}
