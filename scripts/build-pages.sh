#!/usr/bin/env bash
set -euo pipefail

output=${1:?Pass an empty output directory}
mkdir -p -- "$output"
if [[ -n $(find "$output" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
  echo "Pages output must be empty: $output" >&2
  exit 1
fi

assets=(index.html styles.css app.mjs model.mjs manifest.webmanifest icon.svg sw.js)

tested_revision() {
  local ref=$1 branch candidate
  if [[ ${PAGES_TESTED_ONLY:-0} != 1 ]]; then
    git rev-parse --verify "$ref^{commit}"
    return
  fi
  branch=${ref#refs/remotes/origin/}
  local successful
  successful=$(gh api --method GET "repos/$GITHUB_REPOSITORY/actions/workflows/test.yml/runs" \
    -f branch="$branch" -f event=push -f status=success -F per_page=30 \
    --jq '.workflow_runs[].head_sha')
  while IFS= read -r candidate; do
    if [[ -n $candidate ]] && git merge-base --is-ancestor "$candidate" "$ref"; then
      printf '%s\n' "$candidate"
      return
    fi
  done <<< "$successful"
}

publish() {
  local revision=$1 directory=$2 asset
  mkdir -p -- "$directory"
  for asset in "${assets[@]}"; do
    git show "$revision:$asset" > "$directory/$asset"
  done
  # A revision change must also change the service worker, even if sw.js
  # itself was untouched, so an installed app caches the next release.
  sed -i "s|/\* Pages revision \*/ \"local-2\"|/* Pages revision */ \"$revision\"|" "$directory/sw.js"
  if ! grep -Fq "const revision = /* Pages revision */ \"$revision\"" "$directory/sw.js"; then
    echo "Service worker is missing its Pages revision marker: $revision" >&2
    exit 1
  fi
}

stable=$(tested_revision refs/remotes/origin/main)
if [[ -z $stable ]] || ! git show "$stable:sw.js" | grep 'Pages revision' >/dev/null; then
  echo "No Pages-ready tested revision is available on main." >&2
  exit 1
fi
publish "$stable" "$output"
while IFS= read -r ref; do
  branch=${ref#refs/remotes/origin/}
  if [[ $branch != develop && ! $branch =~ ^playtest/[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then
    echo "Skipping unsupported preview branch: $branch" >&2
    continue
  fi
  revision=$(tested_revision "$ref")
  if [[ -z $revision ]] || ! git show "$revision:sw.js" | grep 'Pages revision' >/dev/null; then
    echo "Skipping $branch until a Pages-ready revision passes its tests."
    continue
  fi
  publish "$revision" "$output/previews/$branch"
done < <(git for-each-ref --format='%(refname)' refs/remotes/origin/develop refs/remotes/origin/playtest)
