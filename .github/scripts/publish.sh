#!/usr/bin/env bash
# Puts a built file on the "pitlanehq-latest" release (one page with every
# download) and moves its tag to this commit.
set -euo pipefail
file="$1"
tag=pitlanehq-latest
git tag -f "$tag" "$GITHUB_SHA"
git push -f "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "refs/tags/$tag" || true
if ! gh release view "$tag" >/dev/null 2>&1; then
  gh release create "$tag" --title "Pitlane HQ — latest build" --notes-file .github/release-notes.md --verify-tag || true
fi
gh release edit "$tag" --title "Pitlane HQ — latest build" --notes-file .github/release-notes.md --latest || true
for i in 1 2 3; do
  gh release upload "$tag" "$file" --clobber && exit 0
  sleep 5
done
exit 1
