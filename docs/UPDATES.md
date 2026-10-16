# Updates of the program

The installed program can ask whether there is a newer version, download it, check its signature and install it
(`Help > בדוק עדכונים…`, and by itself a few seconds after the start, at most every 12 hours). It is the Tauri updater plugin;
the program side is `src/updater.ts` and `src/components/UpdateDialog.tsx`.

## How it fits together

- **The releases repository** (public, no code in it): `wbdyhy0-create/imudist-releases`. It holds the installers (as release assets)
  and two lists on `main`: `latest.json` (ordinary builds) and `trial.json` (builds for testing, 180 days from the first start).
  The source repository can be private without any effect on updates: the programs only know the address of the lists.
- **The key**: updates are signed. The public half is written in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); the private
  half is `D:\Imudist-keys\updater.key` (outside the repository, never to be put in it). **Back it up.** Without it nobody who has the
  program installed can be updated. For the Mac builds the same key is the GitHub secret `TAURI_SIGNING_PRIVATE_KEY`.
- **Two channels.** An ordinary build reads `latest.json`; a build made with `scripts/build-trial.mjs` or the `trial` variant of the Mac
  workflow reads `trial.json` (`src-tauri/tauri.trial.conf.json`), so a trial never turns into an unrestricted build by updating.
- **Versions.** A program offers a build only when its version is higher than its own. Builds can be made again under the same
  number (nothing is offered); to publish an update, raise the version first (`package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`) and commit it as "Release 0.0.NN".
- A program that was installed before updates existed (0.0.36 and earlier) has to be installed by hand once.

## One-time setup

1. Create the public repository `imudist-releases` under `wbdyhy0-create` (empty, with a README so that `main` exists).
2. Install the GitHub CLI and log in: `winget install GitHub.cli`, then `gh auth login`.
3. For the builds on GitHub, in the **source** repository's Settings > Secrets and variables > Actions add:
   - `TAURI_SIGNING_PRIVATE_KEY`: the content of `D:\Imudist-keys\updater.key`
   - `RELEASES_REPO_TOKEN`: a personal access token that can write to `imudist-releases` (contents: read and write)

## Publishing an update (by GitHub: Windows and Mac)

Push a tag `v<version>` (or run the **Build macOS and Windows** workflow with `publish` ticked): GitHub builds the Windows and
Mac installers of both channels, signs them with the secrets above and publishes them. Nothing needs the GitHub CLI on this machine.

## Publishing an update from this machine (Windows)

```powershell
node scripts/build-release.mjs                         # signed installers in src-tauri/target/release/bundle
node scripts/publish-update.mjs --channel regular --notes "what is new"
node scripts/build-trial.mjs 180 --from-first-run      # the trial installers in D:/Imudist-trial/<version>-trial-180d
node scripts/publish-update.mjs --channel trial --notes "what is new"
```

`--dry-run` shows what would be done and changes nothing. The Mac builds: run the **Build macOS** workflow with `publish` ticked
(or push a `v*` tag); it publishes both channels for both Mac architectures into the same lists.

## Notes

- `src-tauri/Cargo.toml` takes the `zip` crate from its repository (`[patch.crates-io]`): every release of it that the updater plugin
  accepts was withdrawn from crates.io. The plugin only uses it for `.zip` update packages, which Imudist never publishes. Remove the
  patch when a newer plugin release depends on a version that exists.
- The check fails quietly when there is no internet or the lists are missing: the program just does not offer anything.
