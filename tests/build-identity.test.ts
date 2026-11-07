import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { getBuildIdentity } from '../build/identity.ts'
import { createManifest } from '../manifest.config.ts'

test('only explicit dev mode changes the standard product identity', () => {
  for (const mode of ['production', 'development', 'release']) {
    assert.deepEqual(getBuildIdentity(mode, 'unused-checkout'), {
      name: 'Overidify', worktree: null, id: null, iconRoot: 'icons',
    })
    assert.equal(createManifest(getBuildIdentity(mode, 'unused-checkout')).name, 'Overidify')
  }
})

test('dev identity distinguishes equal checkout names and stays stable for the same checkout', async t => {
  const root = await mkdtemp(join(tmpdir(), 'overidify-identity-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const firstPath = join(root, 'first', 'feature-test')
  const secondPath = join(root, 'second', 'feature-test')
  await Promise.all([mkdir(firstPath, { recursive: true }), mkdir(secondPath, { recursive: true })])
  const first = getBuildIdentity('dev', firstPath)
  const second = getBuildIdentity('dev', secondPath)
  assert.equal(first.worktree, 'feature-test')
  assert.equal(second.worktree, 'feature-test')
  assert.match(first.id!, /^[a-f0-9]{8}$/)
  assert.notEqual(first.id, second.id)
  assert.equal(first.name, `Overidify Dev · feature-test · ${first.id}`)
  const manifest = createManifest(first)
  assert.equal(manifest.name, 'Overidify Dev')
  assert.equal(manifest.action?.default_title, first.name)
  assert.equal(first.iconRoot, 'icons/dev')
  assert.deepEqual(getBuildIdentity('dev', join(firstPath, '..', 'feature-test')), first)
})
