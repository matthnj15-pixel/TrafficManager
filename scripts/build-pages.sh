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
  local ref=$1 branch candidate successful
  if [[ ${PAGES_TESTED_ONLY:-0} != 1 ]]; then
    git rev-parse --verify "$ref^{commit}"
    return
  fi
  branch=${ref#refs/remotes/origin/}
  successful=$(gh api --method GET "repos/$GITHUB_REPOSITORY/actions/workflows/test.yml/runs" \
    -f branch="$branch" -F per_page=30 \
    --jq '.workflow_runs[] | select(.event == "push" and .conclusion == "success") | .head_sha')
  while IFS= read -r candidate; do
    if [[ -n $candidate ]] && git merge-base --is-ancestor "$candidate" "$ref"; then
      printf '%s\n' "$candidate"
      return
    fi
  done <<< "$successful"
}

sumo_artifact() {
  local branch=$1 revision=$2
  gh api --method GET "repos/$GITHUB_REPOSITORY/actions/workflows/test.yml/runs" \
    -f branch="$branch" -f head_sha="$revision" -F per_page=30 \
    --jq '.workflow_runs[] | select(.event == "push" and .conclusion == "success") | .id' |
    sed -n '1p'
}

publish() {
  local revision=$1 directory=$2 branch=$3 asset run
  mkdir -p -- "$directory"
  if git cat-file -e "$revision:sumo-worker.mjs" 2>/dev/null; then
    if [[ ${PAGES_TESTED_ONLY:-0} == 1 ]]; then
      run=$(sumo_artifact "$branch" "$revision")
      if [[ -z $run ]] || ! gh run download "$run" --repo "$GITHUB_REPOSITORY" \
        --name sumo-wasm --dir "$directory/sumo-wasm"; then
        echo "Skipping $branch because its tested SUMO assets are unavailable."
        if [[ $branch == main ]]; then return 1; fi
        return 0
      fi
    else
      mkdir -p "$directory/sumo-wasm"
      cp -R "${PAGES_SUMO_WASM_DIR:-sumo-wasm}/." "$directory/sumo-wasm"
    fi
    for asset in netconvert.mjs netconvert.wasm sumo.mjs sumo.wasm; do
      test -s "$directory/sumo-wasm/$asset"
    done
    for asset in sumo-network.mjs sumo-worker.mjs; do
      git show "$revision:$asset" > "$directory/$asset"
    done
  fi
  for asset in "${assets[@]}"; do
    git show "$revision:$asset" > "$directory/$asset"
  done
  # Older published branches predate the SUMO import/export module.
  if git cat-file -e "$revision:sumo-export.mjs" 2>/dev/null; then
    git show "$revision:sumo-export.mjs" > "$directory/sumo-export.mjs"
  fi
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
publish "$stable" "$output" main
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
  publish "$revision" "$output/previews/$branch" "$branch"
done < <(git for-each-ref --format='%(refname)' refs/remotes/origin/develop refs/remotes/origin/playtest)
