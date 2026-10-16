import { existsSync } from 'node:fs'

/**
 * The environment a build is signed with (the key of the updater). `IMUDIST_UPDATER_KEY` is the file of the private key (by default
 * D:/Imudist-keys/updater.key), and `IMUDIST_UPDATER_KEY_PASSWORD` its password when it has one; a key that the caller has already put
 * in `TAURI_SIGNING_PRIVATE_KEY` (the content of the key, as GitHub's secrets give it) is used as it is.
 */
export function updaterSigningEnv(env = process.env) {
  if (env.TAURI_SIGNING_PRIVATE_KEY) return {}
  const key = env.IMUDIST_UPDATER_KEY ?? 'D:/Imudist-keys/updater.key'
  if (!existsSync(key)) {
    throw new Error(`The signing key of the updater is not at ${key}. Put it there, or name it in IMUDIST_UPDATER_KEY (see docs/UPDATES.md).`)
  }
  return { TAURI_SIGNING_PRIVATE_KEY: key, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: env.IMUDIST_UPDATER_KEY_PASSWORD ?? '' }
}
