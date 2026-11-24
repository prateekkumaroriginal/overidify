// Registers the Overidify MCP helper as a Chrome native messaging host.
// Overidify settings downloads this installer with the helper and extension ID embedded:
//   node overidify-mcp-setup.mjs [--browser-dir <dir>]... [--uninstall]
// The copy in the extension folder needs the extension ID instead:
//   node mcp/install.mjs <extension-id>... [--browser-dir <dir>]... [--uninstall]
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MCP_HOST_NAME, readMcpEmbeddedSetup } from '../src/lib/mcp-protocol.ts'

export type InstallOptions = {
  extensionIds: string[]
  /** Extra browser user-data directories, such as one passed with --user-data-dir. */
  browserDirs?: string[]
  platform?: NodeJS.Platform
  home?: string
  env?: NodeJS.ProcessEnv
  hostSource?: string
  /** Helper source code, used instead of hostSource by the downloaded setup file. */
  hostCode?: string
  nodePath?: string
  /** Windows registry writer; null removes the key. */
  registry?: (key: string, value: string | null) => void
}

const LINUX_BROWSERS = ['google-chrome', 'google-chrome-beta', 'google-chrome-unstable', 'chromium', 'BraveSoftware/Brave-Browser', 'microsoft-edge', 'microsoft-edge-beta', 'microsoft-edge-dev', 'vivaldi']
const MAC_BROWSERS = ['Google/Chrome', 'Google/Chrome Beta', 'Google/Chrome Dev', 'Google/Chrome Canary', 'Chromium', 'BraveSoftware/Brave-Browser', 'Microsoft Edge', 'Vivaldi']
const WINDOWS_KEYS = ['Google\\Chrome', 'Chromium', 'Microsoft\\Edge', 'BraveSoftware\\Brave-Browser']
  .map(browser => `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${MCP_HOST_NAME}`)

function context(options: Omit<InstallOptions, 'extensionIds'>) {
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const env = options.env ?? process.env
  const installDir = platform === 'win32' ? join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Overidify', 'MCP')
    : platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Overidify MCP')
      : join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'overidify-mcp')
  const browserRoot = platform === 'darwin' ? join(home, 'Library', 'Application Support') : env.XDG_CONFIG_HOME ?? join(home, '.config')
  const browserDirs = platform === 'win32' ? [] : (platform === 'darwin' ? MAC_BROWSERS : LINUX_BROWSERS).map(browser => join(browserRoot, browser))
  const userDirs = (options.browserDirs ?? []).map(dir => resolve(dir))
  const registry = options.registry ?? windowsRegistry
  return { platform, installDir, browserDirs, userDirs, registry }
}

const manifestIn = (browserDir: string) => join(browserDir, 'NativeMessagingHosts', `${MCP_HOST_NAME}.json`)

export function installMcpHost(options: InstallOptions) {
  const ids = [...new Set(options.extensionIds.map(id => id.trim().toLowerCase()))]
  const invalid = ids.filter(id => !/^[a-p]{32}$/.test(id))
  if (!ids.length || invalid.length) throw new Error(`Pass the extension ID shown in Overidify settings${invalid.length ? `. Invalid: ${invalid.join(', ')}` : ''}.`)
  const { platform, installDir, browserDirs, userDirs, registry } = context(options)
  const hostSource = options.hostSource ?? join(dirname(fileURLToPath(import.meta.url)), 'host.mjs')
  if (options.hostCode === undefined && !existsSync(hostSource)) throw new Error('The MCP helper was not found. Download the setup file from Overidify settings > Agents and run that instead.')

  const targets = platform === 'win32' ? [join(installDir, `${MCP_HOST_NAME}.json`)]
    : [...browserDirs.filter(dir => existsSync(dir)), ...userDirs].map(manifestIn)
  if (!targets.length) throw new Error('No Chrome, Chromium, Edge, Brave, or Vivaldi profile folder was found. Pass the browser\'s user data folder with --browser-dir.')

  // Copy the helper so it keeps working when the extension folder moves.
  mkdirSync(installDir, { recursive: true })
  const host = join(installDir, 'host.mjs')
  if (options.hostCode === undefined) copyFileSync(hostSource, host)
  else writeFileSync(host, options.hostCode)
  const node = options.nodePath ?? process.execPath
  const wrapper = join(installDir, platform === 'win32' ? 'overidify-mcp-host.bat' : 'overidify-mcp-host')
  if (platform === 'win32') writeFileSync(wrapper, `@echo off\r\n"${node}" "${host}" %*\r\n`)
  else {
    const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
    writeFileSync(wrapper, `#!/bin/sh\nexec ${quote(node)} ${quote(host)} "$@"\n`)
    chmodSync(wrapper, 0o755)
  }

  for (const target of targets) {
    const origins = new Set(ids.map(id => `chrome-extension://${id}/`))
    try {
      const existing = JSON.parse(readFileSync(target, 'utf8')) as { allowed_origins?: unknown }
      if (Array.isArray(existing.allowed_origins)) for (const origin of existing.allowed_origins) if (typeof origin === 'string') origins.add(origin)
    } catch { /* No previous registration. */ }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, `${JSON.stringify({
      name: MCP_HOST_NAME, description: 'Overidify MCP server', path: wrapper, type: 'stdio', allowed_origins: [...origins].sort(),
    }, null, 2)}\n`)
  }
  if (platform === 'win32') for (const key of WINDOWS_KEYS) registry(key, targets[0])
  return { installDir, wrapper, manifests: targets }
}

export function uninstallMcpHost(options: Omit<InstallOptions, 'extensionIds'> = {}) {
  const { platform, installDir, browserDirs, userDirs, registry } = context(options)
  const manifests = [...browserDirs, ...userDirs].map(manifestIn).filter(path => existsSync(path))
  for (const path of manifests) rmSync(path, { force: true })
  if (platform === 'win32') for (const key of WINDOWS_KEYS) registry(key, null)
  rmSync(installDir, { recursive: true, force: true })
  return { installDir, manifests }
}

function windowsRegistry(key: string, value: string | null) {
  const args = value === null ? ['delete', key, '/f'] : ['add', key, '/ve', '/t', 'REG_SZ', '/d', value, '/f']
  try { execFileSync('reg', args, { stdio: 'ignore' }) } catch (error) { if (value !== null) throw error }
}

function main(argv: string[]) {
  const ids: string[] = []
  const browserDirs: string[] = []
  let uninstall = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--uninstall') uninstall = true
    else if (arg === '--browser-dir') browserDirs.push(argv[++index] ?? '')
    else if (arg.startsWith('--browser-dir=')) browserDirs.push(arg.slice('--browser-dir='.length))
    else ids.push(arg)
  }
  if (uninstall) {
    const result = uninstallMcpHost({ browserDirs })
    console.log(`Removed the Overidify MCP helper from ${result.installDir}.`)
    return
  }
  const embedded = readMcpEmbeddedSetup(globalThis)
  const result = installMcpHost({ extensionIds: ids.length || !embedded ? ids : [embedded.extensionId], browserDirs, hostCode: embedded?.host })
  console.log(`Installed the Overidify MCP helper in ${result.installDir}.`)
  for (const manifest of result.manifests) console.log(`Registered ${manifest}`)
  console.log('Return to Overidify settings and click Retry.')
}

// Node loads the entry module from its real path, so compare real paths. A symlinked Downloads folder still runs setup.
const isEntry = (path: string | undefined) => {
  try { return !!path && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(path)) } catch { return false }
}
if (isEntry(process.argv[1])) {
  try { main(process.argv.slice(2)) } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
