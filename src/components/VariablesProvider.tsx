import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getVariables, subscribeToVariables } from '../lib/variables-storage'
import type { Variable } from '../lib/variables'
import { VariablesContext } from './variables-context'

/** Extension pages follow the saved variables live. */
export function VariablesProvider({ children }: { children: ReactNode }) {
  const [variables, setVariables] = useState<Variable[] | null>(null)
  useEffect(() => {
    let alive = true, changed = false
    void getVariables().then(next => { if (alive && !changed) setVariables(next) }).catch(() => { if (alive && !changed) setVariables([]) })
    const unsubscribe = subscribeToVariables(next => { changed = true; if (alive) setVariables(next) })
    return () => { alive = false; unsubscribe() }
  }, [])
  return <VariablesContext.Provider value={variables}>{children}</VariablesContext.Provider>
}
