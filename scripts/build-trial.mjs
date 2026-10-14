// A build for testing, to send to somebody: it asks for the agreement at the start and stops working after N days (14 by default).
//
//   node scripts/build-trial.mjs [days] [--from-first-run]
//
// The end date is written into the build (VITE_TRIAL_EXPIRES); an ordinary build has none. The installers come out in
// D:/Imudist-trial/<version>-until-<date>/ and the ordinary installers of the same version, which the build would write over,
// are put back where they were.
//
// With --from-first-run the days are counted from the first start on the computer of whoever installs it (VITE_TRIAL_DAYS, as in the
// trial builds of the Mac), not from today: the installers come out in D:/Imudist-trial/<version>-trial-<days>d/.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const fromFirstRun = process.argv.includes('--from-first-run')
const days = Number(process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? 14)
if (!Number.isFinite(days) || days < 1) throw new Error('days must be a positive number')

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
const stamp = fromFirstRun ? `${days}d` : expiresAt.toISOString().slice(0, 10)
const folderName = fromFirstRun ? `${version}-trial-${days}d` : `${version}-until-${stamp}`
const trialEnv = fromFirstRun ? { VITE_TRIAL_DAYS: String(days) } : { VITE_TRIAL_EXPIRES: expiresAt.toISOString() }

const bundle = join(root, 'src-tauri/target/release/bundle')
const kinds = ['nsis', 'msi']
const isInstaller = (name) => name.includes(`_${version}_`) && /\.(exe|msi)$/.test(name)

// the ordinary installers of this version, kept aside
const aside = join(root, 'src-tauri/target/trial-aside')
rmSync(aside, { recursive: true, force: true })
for (const kind of kinds) {
  const dir = join(bundle, kind)
  if (!existsSync(dir)) continue
  mkdirSync(join(aside, kind), { recursive: true })
  for (const name of readdirSync(dir).filter(isInstaller)) cpSync(join(dir, name), join(aside, kind, name))
}

console.log(fromFirstRun ? `Building ${version} for testing, ${days} days from the first start ...` : `Building ${version} for testing, until ${expiresAt.toISOString()} ...`)
const run = spawnSync('npx', ['tauri', 'build', '--', '--config', 'profile.release.package.imudist.opt-level=0'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...trialEnv },
})
if (run.status !== 0) {
  console.error('The build failed.')
  process.exit(run.status ?? 1)
}

const out = join('D:/Imudist-trial', folderName)
mkdirSync(out, { recursive: true })
for (const kind of kinds) {
  const dir = join(bundle, kind)
  if (!existsSync(dir)) continue
  for (const name of readdirSync(dir).filter(isInstaller)) {
    const target = name.replace(`_${version}_`, `_${version}-trial-${stamp}_`)
    cpSync(join(dir, name), join(out, target))
    console.log('  ' + join(out, target))
  }
}
// the ordinary installers back
for (const kind of kinds) {
  const dir = join(aside, kind)
  if (!existsSync(dir)) continue
  for (const name of readdirSync(dir)) cpSync(join(dir, name), join(bundle, kind, name))
}
rmSync(aside, { recursive: true, force: true })
console.log('Done. The ordinary installers of this version were put back.')
