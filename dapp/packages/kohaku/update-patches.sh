#!/usr/bin/env bash
# Regenerate patches/ from a Kohaku clone you edited. Usage: ./update-patches.sh [clone dir]
# Lockfiles, the reader copy, .env and the extension key stay out of the patches.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/pins.sh"
DIR="$(cd "${1:-$HERE/kohaku-extension}" && pwd)"

# Diffs base..working tree, new files included, through a throwaway index so the clone's own index is untouched.
export_patch() {
  local repo="$1" base="$2" out="$3"
  shift 3
  local index
  index="$(mktemp)"
  GIT_INDEX_FILE="$index" git -C "$repo" read-tree "$base"
  GIT_INDEX_FILE="$index" git -C "$repo" add -A -- . "$@"
  GIT_INDEX_FILE="$index" git -C "$repo" diff --cached --binary "$base" -- . "$@" > "$out"
  rm -f "$index"
  echo "wrote $out ($(grep -c '^diff --git' "$out") files)"
}

export_patch "$DIR" "$EXTENSION_COMMIT" "$HERE/patches/kohaku-extension.patch" \
  ':!yarn.lock' ':!.yarnrc.yml' ':!key.pem' ':!src/ambire-common' ':!src/web/extension-services/tocsin-offscreen/harness'
export_patch "$DIR/src/ambire-common" "$COMMONS_COMMIT" "$HERE/patches/kohaku-commons.patch" \
  ':!package-lock.json' ':!src/libs/tocsin/reader'
