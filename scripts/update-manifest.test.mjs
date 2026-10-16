import { describe, expect, it } from 'vitest'
import { assetUrl, currentPlatform, isNewer, manifestFileName, releaseTag, withPlatform } from './update-manifest.mjs'

const now = new Date('2026-10-16T12:00:00Z')

describe('the update list', () => {
  it('names the list and the release of a channel', () => {
    expect(manifestFileName('regular')).toBe('latest.json')
    expect(manifestFileName('trial')).toBe('trial.json')
    expect(() => manifestFileName('beta')).toThrow()
    expect(releaseTag('0.0.37', 'regular')).toBe('v0.0.37')
    expect(releaseTag('0.0.37', 'trial')).toBe('v0.0.37-trial')
    expect(assetUrl('me/releases', 'v0.0.37', 'Imudist_0.0.37_x64-setup.exe')).toBe('https://github.com/me/releases/releases/download/v0.0.37/Imudist_0.0.37_x64-setup.exe')
  })

  it('knows the platform of the machine', () => {
    expect(currentPlatform('win32', 'x64')).toBe('windows-x86_64')
    expect(currentPlatform('darwin', 'arm64')).toBe('darwin-aarch64')
    expect(currentPlatform('darwin', 'x64')).toBe('darwin-x86_64')
    expect(() => currentPlatform('linux', 'x64')).toThrow()
  })

  it('starts a list for a version, and each machine adds its own platform to it', () => {
    const windows = withPlatform(null, { version: '0.0.37', platform: 'windows-x86_64', url: 'https://x/a.exe', signature: 'SIG-A\n', notes: 'what is new', now })
    expect(windows).toEqual({ version: '0.0.37', notes: 'what is new', pub_date: '2026-10-16T12:00:00.000Z', platforms: { 'windows-x86_64': { signature: 'SIG-A', url: 'https://x/a.exe' } } })
    const both = withPlatform(windows, { version: '0.0.37', platform: 'darwin-aarch64', url: 'https://x/b.tar.gz', signature: 'SIG-B', now })
    expect(Object.keys(both.platforms)).toEqual(['windows-x86_64', 'darwin-aarch64'])
    expect(both.notes).toBe('what is new') // kept when no new text is given
    // the same platform again (an installer built a second time): replaced
    const again = withPlatform(both, { version: '0.0.37', platform: 'windows-x86_64', url: 'https://x/a2.exe', signature: 'SIG-A2', now })
    expect(again.platforms['windows-x86_64']).toEqual({ signature: 'SIG-A2', url: 'https://x/a2.exe' })
    expect(again.platforms['darwin-aarch64'].signature).toBe('SIG-B')
  })

  it('does not offer the platforms of an older version with a newer one', () => {
    const old = withPlatform(null, { version: '0.0.36', platform: 'darwin-aarch64', url: 'https://x/old.tar.gz', signature: 'OLD', now })
    const next = withPlatform(old, { version: '0.0.37', platform: 'windows-x86_64', url: 'https://x/new.exe', signature: 'NEW', now })
    expect(Object.keys(next.platforms)).toEqual(['windows-x86_64'])
    expect(next.notes).toBe('')
  })

  it('refuses what is missing', () => {
    expect(() => withPlatform(null, { version: '0.0.37', platform: 'linux', url: 'u', signature: 's' })).toThrow()
    expect(() => withPlatform(null, { version: '0.0.37', platform: 'windows-x86_64', url: 'u', signature: ' ' })).toThrow()
    expect(() => withPlatform(null, { version: '', platform: 'windows-x86_64', url: 'u', signature: 's' })).toThrow()
  })

  it('compares versions the way the program does', () => {
    expect(isNewer('0.0.37', '0.0.36')).toBe(true)
    expect(isNewer('0.0.36', '0.0.36')).toBe(false)
    expect(isNewer('0.1.0', '0.0.99')).toBe(true)
    expect(isNewer('0.0.9', '0.0.10')).toBe(false)
    expect(isNewer('1.0.0', '0.9.9')).toBe(true)
  })
})
