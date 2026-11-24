import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { installMcpHost, uninstallMcpHost } from '../mcp-host/install.ts'

const STABLE = 'a'.repeat(32)
const DEV = 'b'.repeat(32)

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'overidify-install-'))
  const hostSource = join(home, 'host.mjs')
  writeFileSync(hostSource, 'console.log("host")\n')
  mkdirSync(join(home, '.config', 'google-chrome'), { recursive: true })
  const custom = join(home, 'custom-profile')
  const options = { home, env: {}, platform: 'linux' as const, hostSource, nodePath: "/opt/node's/bin/node" }
  return { home, custom, options, cleanup: () => rmSync(home, { recursive: true, force: true }) }
}

test('install registers detected and requested browser profiles and merges extension IDs across runs', () => {
  const { home, custom, options, cleanup } = setup()
  try {
    const first = installMcpHost({ ...options, extensionIds: [STABLE] })
    const chromeManifest = join(home, '.config', 'google-chrome', 'NativeMessagingHosts', 'com.overidify.mcp.json')
    assert.deepEqual(first.manifests, [chromeManifest])
    assert.equal(existsSync(join(home, '.config', 'chromium')), false)

    installMcpHost({ ...options, extensionIds: [DEV.toUpperCase()], browserDirs: [custom] })
    const manifest = JSON.parse(readFileSync(chromeManifest, 'utf8'))
    assert.deepEqual(manifest, {
      name: 'com.overidify.mcp', description: 'Overidify MCP server', type: 'stdio',
      path: join(home, '.local', 'share', 'overidify-mcp', 'overidify-mcp-host'),
      allowed_origins: [`chrome-extension://${STABLE}/`, `chrome-extension://${DEV}/`],
    })
    assert.deepEqual(JSON.parse(readFileSync(join(custom, 'NativeMessagingHosts', 'com.overidify.mcp.json'), 'utf8')).allowed_origins, [`chrome-extension://${DEV}/`])

    // The wrapper survives paths with quotes and does not depend on PATH.
    assert.equal(readFileSync(manifest.path, 'utf8'), `#!/bin/sh\nexec '/opt/node'\\''s/bin/node' '${join(home, '.local', 'share', 'overidify-mcp', 'host.mjs')}' "$@"\n`)
    assert.equal(statSync(manifest.path).mode & 0o111, 0o111)
    assert.equal(readFileSync(join(home, '.local', 'share', 'overidify-mcp', 'host.mjs'), 'utf8'), 'console.log("host")\n')

    const removed = uninstallMcpHost({ ...options, browserDirs: [custom] })
    assert.equal(removed.manifests.length, 2)
    assert.equal(existsSync(chromeManifest), false)
    assert.equal(existsSync(join(home, '.local', 'share', 'overidify-mcp')), false)
  } finally { cleanup() }
})

test('install rejects invalid extension IDs and missing browser profiles without writing files', () => {
  const { home, options, cleanup } = setup()
  try {
    assert.throws(() => installMcpHost({ ...options, extensionIds: ['not-an-id'] }), /Invalid: not-an-id/)
    assert.throws(() => installMcpHost({ ...options, extensionIds: [] }), /extension ID/)
    rmSync(join(home, '.config'), { recursive: true })
    assert.throws(() => installMcpHost({ ...options, extensionIds: [STABLE] }), /--browser-dir/)
    assert.equal(existsSync(join(home, '.local')), false)
  } finally { cleanup() }
})

test('Windows install registers the manifest path for each supported browser', () => {
  const { home, options, cleanup } = setup()
  try {
    const registry: [string, string | null][] = []
    const result = installMcpHost({ ...options, platform: 'win32', env: { LOCALAPPDATA: join(home, 'Local') }, extensionIds: [STABLE],
      registry: (key, value) => registry.push([key, value]) })
    assert.deepEqual(result.manifests, [join(home, 'Local', 'Overidify', 'MCP', 'com.overidify.mcp.json')])
    assert.deepEqual(registry.map(([key]) => key), [
      'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.overidify.mcp',
      'HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.overidify.mcp',
      'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.overidify.mcp',
      'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.overidify.mcp',
    ])
    assert.ok(registry.every(([, value]) => value === result.manifests[0]))
    assert.match(readFileSync(result.wrapper, 'utf8'), /^@echo off\r\n"\/opt\/node's\/bin\/node" ".*host\.mjs" %\*\r\n$/)
  } finally { cleanup() }
})

test('setup runs when started through a symlinked folder', { skip: process.platform === 'win32' }, () => {
  const { home, cleanup } = setup()
  try {
    const link = join(home, 'Downloads')
    symlinkSync(resolve('mcp-host'), link)
    const output = execFileSync(process.execPath, ['--experimental-strip-types', join(link, 'install.ts'), '--uninstall'],
      { env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    assert.match(output, /Removed the Overidify MCP helper/)
  } finally { cleanup() }
})
