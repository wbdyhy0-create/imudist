#!/usr/bin/env bash
# Publishes the builds that the workflow "Build macOS and Windows" made (downloaded into ./artifacts) as updates, in both channels:
# Windows and the two kinds of Mac. Run by .github/workflows/build-mac.yml and publish-update.yml, with GH_TOKEN set (a token that can
# write to the releases repository) and TRIAL_DAYS (the length of the trial builds). What was not downloaded is left out: the
# workflow can be asked for only some of the builds (a Windows build to try an update on one machine, for instance).
set -euo pipefail

gh auth setup-git
git config --global user.name "Imudist releases"
git config --global user.email "releases@imudist.invalid"

version=$(node -p "require('./package.json').version")
days="${TRIAL_DAYS:-180}"
clone="${RUNNER_TEMP:-/tmp}/releases"

# publish_built <installer> <arguments of publish-update.mjs>: the installer and its .sig go in; skipped when it was not built
published=0
publish_built() {
  local file="$1"; shift
  # one artifact asked for by name is put directly in ./artifacts, several are put each in a folder of its own
  [ -f "$file" ] || { [ -f "artifacts/$(basename "$file")" ] && file="artifacts/$(basename "$file")"; }
  if [ -f "$file" ]; then
    node scripts/publish-update.mjs --clone "$clone" --file "$file" --sig "$file.sig" "$@"
    published=$((published + 1))
  else
    echo "left out (not in this run): $file"
  fi
}

# the installers that people are sent for the first installation by hand (the Macs' dmg): put in the release as they are, so that
# each has an address to download from. Not offered as updates, so a failure here does not stop the publishing.
upload_downloads() {
  local tag="$1"; shift
  for file in "$@"; do
    [ -f "$file" ] || continue
    gh release upload "$tag" "$file" --repo "${RELEASES_REPO:-wbdyhy0-create/imudist-releases}" --clobber || echo "could not upload $file"
  done
}

# The same installers again under names that never change, in two releases that are always the newest build ("latest" for the ordinary
# builds, "latest-trial" for the builds for testing): one address to send, whatever the version is. The page of downloads in the
# releases repository (its README) points at these.
repo="${RELEASES_REPO:-wbdyhy0-create/imudist-releases}"
keep_latest() {
  local tag="$1" file="$2" name="$3"
  [ -f "$file" ] || return 0
  gh release view "$tag" --repo "$repo" > /dev/null 2>&1 || gh release create "$tag" --repo "$repo" --latest=false     --title "Imudist: the newest build" --notes "The newest installers, under names that never change (the version is in the file's properties)."
  local copy
  copy="$(mktemp -d)/$name"
  cp "$file" "$copy"
  gh release upload "$tag" "$copy" --repo "$repo" --clobber || echo "could not upload $name"
  rm -f "$copy"
}

# Windows
win_full="artifacts/imudist-win-full"
win_trial="artifacts/imudist-win-trial-${days}d"
publish_built "$win_full/Imudist_${version}_x64-setup.exe" --channel regular --platform windows-x86_64
publish_built "$win_trial/Imudist_${version}_x64-setup.exe" --channel trial --platform windows-x86_64 --asset-name "Imudist_${version}-trial-${days}d_x64-setup.exe"
keep_latest latest "$win_full/Imudist_${version}_x64-setup.exe" "Imudist-Windows.exe"
keep_latest latest-trial "$win_trial/Imudist_${version}_x64-setup.exe" "Imudist-Trial-Windows.exe"

# the Macs
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  case $target in
    aarch64-apple-darwin) platform=darwin-aarch64; arch=aarch64 ;;
    *) platform=darwin-x86_64; arch=x86_64 ;;
  esac
  full="artifacts/imudist-mac-full-$target"
  trial="artifacts/imudist-mac-trial-${days}d-$target"
  publish_built "$full/macos/Imudist.app.tar.gz" --channel regular --platform "$platform" --asset-name "Imudist_${version}_${arch}.app.tar.gz"
  publish_built "$trial/macos/Imudist.app.tar.gz" --channel trial --platform "$platform" --asset-name "Imudist_${version}-trial-${days}d_${arch}.app.tar.gz"
  case $arch in aarch64) mac_name="AppleSilicon" ;; *) mac_name="Intel" ;; esac
  for dmg in "$full"/dmg/*.dmg; do keep_latest latest "$dmg" "Imudist-Mac-${mac_name}.dmg"; done
  for dmg in "$trial"/dmg/*.dmg; do keep_latest latest-trial "$dmg" "Imudist-Trial-Mac-${mac_name}.dmg"; done
  upload_downloads "v${version}" "$full"/dmg/*.dmg
  upload_downloads "v${version}-trial" "$trial"/dmg/*.dmg
done

if [ "$published" -eq 0 ]; then
  echo "Nothing was published: none of the builds is in ./artifacts" >&2
  exit 1
fi
echo "Published $published build(s)."
