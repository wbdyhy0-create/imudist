// Publishes a build so that the programs that are already installed offer it as an update.
//
//   node scripts/publish-update.mjs --channel regular [--notes "what is new"]
//   node scripts/publish-update.mjs --channel trial [--days 180] [--notes "..."]
//
// The installer (signed when it was built, see build-release.mjs / build-trial.mjs) is uploaded to a release of the releases repository
// (`wbdyhy0-create/imudist-releases`: public, with no code in it), and the list the programs read (`latest.json` for the ordinary
// builds, `trial.json` for the builds for testing) is changed to point at it. It needs the GitHub CLI (`gh`, logged in) and git.
//
// By default it takes the Windows installer this machine just built. The Macs are built by GitHub (.github/workflows/build-mac.yml),
// which gives the file explicitly:  --platform darwin-aarch64 --file <Imudist.app.tar.gz> --sig <its .sig> --asset-name <name>
//
// The programs offer a build only when its version is higher than theirs: raise it (package.json, tauri.conf.json, Cargo.toml) first.
// Options: --repo owner/name  --clone <folder of the releases repository>  --dry-run (shows what it would do and changes nothing)
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { assetUrl, currentPlatform, manifestFileName, releaseTag, withPlatform } from './update-manifest.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : fallback
}
const dryRun = args.includes('--dry-run')

const channel = option('channel', '')
if (!['regular', 'trial'].includes(channel)) throw new Error('--channel regular or --channel trial is needed')
const repo = option('repo', 'wbdyhy0-create/imudist-releases')
const clone = option('clone', process.platform === 'win32' ? 'D:/Imudist-releases' : join(process.env.HOME ?? '.', 'imudist-releases'))
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const platform = args.includes('--platform') ? option('platform', '') : currentPlatform()

// the installer and its signature
let file = option('file', '')
if (!file) {
  if (platform !== 'windows-x86_64') throw new Error('--file is needed for ' + platform)
  const days = option('days', '180')
  file = channel === 'trial'
    ? join('D:/Imudist-trial', `${version}-trial-${days}d`, `Imudist_${version}-trial-${days}d_x64-setup.exe`)
    : join(root, 'src-tauri/target/release/bundle/nsis', `Imudist_${version}_x64-setup.exe`)
}
const sigFile = option('sig', file + '.sig')
const assetName = option('asset-name', basename(file))
if (!existsSync(file)) throw new Error(`the installer is not there: ${file}`)
if (!existsSync(sigFile)) throw new Error(`the signature is not there: ${sigFile} (the build has to be made with the signing key)`)
const signature = readFileSync(sigFile, 'utf8')
const tag = releaseTag(version, channel)
const notes = option('notes', undefined)

const run = (command, commandArgs, options = {}) => {
  console.log(`> ${command} ${commandArgs.join(' ')}`)
  if (dryRun) return { status: 0, stdout: '' }
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', shell: false, ...options })
  if (result.error?.code === 'ENOENT') throw new Error(`${command} is not installed (for gh: winget install GitHub.cli, then gh auth login)`)
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`)
  return result
}

console.log(`${dryRun ? '[dry run] ' : ''}${channel} ${version} for ${platform}: ${assetName} -> ${repo} (${tag})`)

// the releases repository on this machine, up to date
if (!existsSync(clone)) run('gh', ['repo', 'clone', repo, clone])
else run('git', ['-C', clone, 'pull', '--rebase'])

// the release that holds the installers of this version, and the installer in it
const exists = !dryRun && run('gh', ['release', 'view', tag, '--repo', repo], { allowFailure: true }).status === 0
if (!exists) run('gh', ['release', 'create', tag, '--repo', repo, '--title', `Imudist ${version}${channel === 'trial' ? ' (trial)' : ''}`, '--notes', notes ?? `Imudist ${version}`])
let upload = file
if (assetName !== basename(file)) {
  // the name of the file is the name of the download: a copy under the name that was asked for
  const folder = mkdtempSync(join(tmpdir(), 'imudist-asset-'))
  upload = join(folder, assetName)
  if (!dryRun) copyFileSync(file, upload)
}
run('gh', ['release', 'upload', tag, upload, '--repo', repo, '--clobber'])

// the list the programs read. Several machines publish into it (Windows and the Macs, at about the same time): when the push is
// refused because another one got in first, the list is taken as it is now and this installer is put into it again.
const manifestPath = join(clone, manifestFileName(channel))
let published = dryRun
for (let attempt = 1; attempt <= 5 && !published; attempt++) {
  if (attempt > 1) {
    run('git', ['-C', clone, 'fetch', 'origin'])
    run('git', ['-C', clone, 'reset', '--hard', '@{u}'])
  }
  const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null
  const manifest = withPlatform(existing, { version, platform, url: assetUrl(repo, tag, assetName), signature, notes })
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  run('git', ['-C', clone, 'add', manifestFileName(channel)])
  run('git', ['-C', clone, 'commit', '-m', `${channel} ${version} for ${platform}`], { allowFailure: true })
  published = run('git', ['-C', clone, 'push'], { allowFailure: true }).status === 0
  if (published) console.log(JSON.stringify(manifest, null, 2))
}
if (dryRun) {
  const preview = withPlatform(existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null, { version, platform, url: assetUrl(repo, tag, assetName), signature, notes })
  console.log(JSON.stringify(preview, null, 2))
}
if (!published) throw new Error('the list could not be published (the push was refused five times)')
console.log(dryRun ? 'Nothing was changed.' : 'Published: the programs that ask will be offered it.')
