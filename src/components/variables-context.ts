import { createContext, useContext } from 'react'
import type { Variable } from '../lib/variables'

// Null until loaded, so tokens are not marked missing while loading.
export const VariablesContext = createContext<Variable[] | null>(null)

export function useVariables(): Variable[] | null {
  return useContext(VariablesContext)
}
