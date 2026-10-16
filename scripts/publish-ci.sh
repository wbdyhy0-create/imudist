#!/usr/bin/env bash
# Publishes the builds that the workflow "Build macOS and Windows" made (downloaded into ./artifacts) as updates, in both channels:
# Windows and the two kinds of Mac. Run by .github/workflows/build-mac.yml and publish-update.yml, with GH_TOKEN set (a token that can
# write to the releases repository) and TRIAL_DAYS (the length of the trial builds).
set -euo pipefail

gh auth setup-git
git config --global user.name "Imudist releases"
git config --global user.email "releases@imudist.invalid"

version=$(node -p "require('./package.json').version")
days="${TRIAL_DAYS:-180}"
clone="${RUNNER_TEMP:-/tmp}/releases"

publish() { node scripts/publish-update.mjs --clone "$clone" "$@"; }

# Windows
win_full="artifacts/imudist-win-full"
win_trial="artifacts/imudist-win-trial-${days}d"
publish --channel regular --platform windows-x86_64 --file "$win_full/Imudist_${version}_x64-setup.exe" --sig "$win_full/Imudist_${version}_x64-setup.exe.sig"
publish --channel trial --platform windows-x86_64 --file "$win_trial/Imudist_${version}_x64-setup.exe" --sig "$win_trial/Imudist_${version}_x64-setup.exe.sig" --asset-name "Imudist_${version}-trial-${days}d_x64-setup.exe"

# the Macs
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  case $target in
    aarch64-apple-darwin) platform=darwin-aarch64; arch=aarch64 ;;
    *) platform=darwin-x86_64; arch=x86_64 ;;
  esac
  full="artifacts/imudist-mac-full-$target"
  trial="artifacts/imudist-mac-trial-${days}d-$target"
  publish --channel regular --platform "$platform" --file "$full/macos/Imudist.app.tar.gz" --sig "$full/macos/Imudist.app.tar.gz.sig" --asset-name "Imudist_${version}_${arch}.app.tar.gz"
  publish --channel trial --platform "$platform" --file "$trial/macos/Imudist.app.tar.gz" --sig "$trial/macos/Imudist.app.tar.gz.sig" --asset-name "Imudist_${version}-trial-${days}d_${arch}.app.tar.gz"
done
