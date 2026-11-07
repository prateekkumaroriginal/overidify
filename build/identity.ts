import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'

export function getBuildIdentity(mode: string, root: string) {
  if (mode !== 'dev') return { name: 'Overidify', worktree: null, id: null, iconRoot: 'icons' }

  const checkout = realpathSync(root)
  const worktree = basename(checkout)
  const id = createHash('sha256').update(checkout).digest('hex').slice(0, 8)
  return { name: `Overidify Dev · ${worktree} · ${id}`, worktree, id, iconRoot: 'icons/dev' }
}
