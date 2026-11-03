import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { build } from 'vite'
import { favicon } from '../scripts/favicon.ts'

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'overidify-favicon-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'icons'))
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Favicon build fixture</title>')
  for (const size of [16, 32, 48, 128]) {
    await copyFile(new URL(`../icons/icon-${size}.png`, import.meta.url), join(root, 'icons', `icon-${size}.png`))
  }
  return root
}

async function buildFixture(root: string) {
  await build({ root, configFile: false, logLevel: 'silent', plugins: [favicon()] })
}

test('build replaces the root favicon and packages all four PNG sizes, including later icon updates', async t => {
  const root = await fixture(t)
  await writeFile(join(root, 'favicon.ico'), 'stale favicon')
  await buildFixture(root)
  const first = await readFile(join(root, 'favicon.ico'))
  assert.deepEqual(first.subarray(0, 6), Buffer.from([0, 0, 1, 0, 4, 0]))
  for (const [index, size] of [16, 32, 48, 128].entries()) {
    const entry = 6 + 16 * index
    assert.equal(first[entry], size)
    assert.equal(first[entry + 1], size)
    assert.equal(first.readUInt16LE(entry + 4), 1)
    assert.equal(first.readUInt16LE(entry + 6), 32)
    const start = first.readUInt32LE(entry + 12)
    const length = first.readUInt32LE(entry + 8)
    assert.deepEqual(first.subarray(start, start + length), await readFile(join(root, 'icons', `icon-${size}.png`)))
  }
  assert.deepEqual(await readFile(join(root, 'dist', 'favicon.ico')), first)

  const replacement = await readFile(new URL('../icons/dark/icon-32.png', import.meta.url))
  await writeFile(join(root, 'icons', 'icon-32.png'), replacement)
  await buildFixture(root)
  const updated = await readFile(join(root, 'favicon.ico'))
  assert.notDeepEqual(updated, first)
  const start = updated.readUInt32LE(34)
  assert.deepEqual(updated.subarray(start, start + updated.readUInt32LE(30)), replacement)
  assert.deepEqual(await readFile(join(root, 'dist', 'favicon.ico')), updated)
})

test('a missing source icon fails the build without overwriting the existing favicon', async t => {
  const root = await fixture(t)
  await writeFile(join(root, 'favicon.ico'), 'existing favicon')
  await rm(join(root, 'icons', 'icon-48.png'))
  await assert.rejects(buildFixture(root), /icon-48\.png/)
  assert.equal(await readFile(join(root, 'favicon.ico'), 'utf8'), 'existing favicon')
})
