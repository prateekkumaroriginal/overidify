import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { sortVariables, variableValues } from '../lib/variables'
import type { Variable } from '../lib/variables'

// Null until loaded, so references are not marked missing while loading.
export const VariablesContext = createContext<Variable[] | null>(null)

export function useVariables() {
  return useContext(VariablesContext)
}

export function useVariableValues(): Map<string, string> {
  const variables = useVariables()
  return useMemo(() => variableValues(variables ?? []), [variables])
}

/** Valid saved names, sorted, for suggestions and missing markers. */
export function useVariableNames(): string[] | null {
  const variables = useVariables()
  return useMemo(() => variables && sortVariables(variables).flatMap(variable => variableValues([variable]).size ? [variable.name] : []), [variables])
}

/** Reports renames saved elsewhere, detected by variable ID, so open drafts can remap their references. */
export function useVariableRenames(onRename: (mapping: Map<string, string>) => void) {
  const variables = useVariables()
  const previous = useRef<Variable[] | null>(null)
  const callback = useRef(onRename)
  useEffect(() => { callback.current = onRename })
  useEffect(() => {
    const before = previous.current
    previous.current = variables
    if (!before || !variables) return
    const names = new Map(before.map(variable => [variable.id, variable.name]))
    const mapping = new Map<string, string>()
    for (const variable of variables) {
      const old = names.get(variable.id)
      if (old !== undefined && old !== variable.name) mapping.set(old, variable.name)
    }
    if (mapping.size) callback.current(mapping)
  }, [variables])
}
