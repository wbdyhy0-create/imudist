// The list the program reads to learn whether a newer version exists (Tauri's static update format), kept in the releases repository
// as `latest.json` (the ordinary builds) and `trial.json` (the builds for testing). One list holds every platform, and each machine that
// builds one adds its own: Windows here, the Macs through the workflow in .github/workflows/build-mac.yml.

/** The platform names the updater looks for. */
export const PLATFORMS = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64']

/** The name of the list for a channel: "regular" or "trial". */
export const manifestFileName = (channel) => {
  if (channel === 'regular') return 'latest.json'
  if (channel === 'trial') return 'trial.json'
  throw new Error(`unknown channel "${channel}" (regular or trial)`)
}

/** The tag of the release that holds the installers of a version in a channel. */
export const releaseTag = (version, channel) => (channel === 'trial' ? `v${version}-trial` : `v${version}`)

/** Where an installer of a release can be downloaded from. */
export const assetUrl = (repo, tag, assetName) => `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`

/** The platform this machine builds for, as the updater names it. */
export function currentPlatform(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'windows-x86_64'
  if (platform === 'darwin') return arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64'
  throw new Error(`no updater platform for ${platform}/${arch}`)
}

/**
 * The list with one platform's installer put in it. A list of another version starts again (the platforms of an older version are not
 * offered with the new one); a list of the same version keeps the platforms the other machines already added.
 * `existing` is the list as it was (or null), `signature` the text of the `.sig` file that was made with the installer.
 */
export function withPlatform(existing, { version, platform, url, signature, notes, now = new Date() }) {
  if (!PLATFORMS.includes(platform)) throw new Error(`unknown platform "${platform}"`)
  if (!version) throw new Error('a version is needed')
  if (!url || !signature || !signature.trim()) throw new Error('an address and a signature are needed')
  const same = existing && existing.version === version
  return {
    version,
    notes: notes ?? (same ? existing.notes ?? '' : ''),
    pub_date: now.toISOString(),
    platforms: { ...(same ? existing.platforms : {}), [platform]: { signature: signature.trim(), url } },
  }
}

/** Whether version `a` is newer than `b` (numbers separated by dots, as in 0.0.36): what the program compares when it asks. */
export function isNewer(a, b) {
  const parts = (text) => String(text).split('-')[0].split('.').map((part) => Number.parseInt(part, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}
