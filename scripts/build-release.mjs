// The ordinary Windows installers (NSIS and MSI), signed for the updater:
//
//   node scripts/build-release.mjs
//
// They come out in src-tauri/target/release/bundle (each installer with a `.sig` file next to it). The signing key is the private half
// of the key whose public half is in tauri.conf.json; it is kept outside the repository (IMUDIST_UPDATER_KEY, by default
// D:/Imudist-keys/updater.key) and must never be put in it. Without it the build cannot finish, since it is asked to make updater files.
// (The build is made with the optimisation of the program's own code off: the model is built into it and the compiler runs out of memory.)
import { spawnSync } from 'node:child_process'
import { updaterSigningEnv } from './signing.mjs'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const run = spawnSync('npx', ['tauri', 'build', '--', '--config', 'profile.release.package.imudist.opt-level=0'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...updaterSigningEnv() },
})
if (run.status !== 0) {
  console.error('The build failed.')
  process.exit(run.status ?? 1)
}
console.log('Done.')
