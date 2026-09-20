#!/usr/bin/env bash
set -euo pipefail

sha="0123456789abcdef0123456789abcdef01234567"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

grep -Fq "bash ops/preflight.sh \"\$TAG\"" "$repo_root/ops/deploy.sh"
grep -Fq "export INFRARENDER_IMAGE_TAG=\"\$TAG\"" "$repo_root/ops/deploy.sh"
grep -Fq "TAG=\"\${1:-\${INFRARENDER_IMAGE_TAG:-}}\"" "$repo_root/ops/preflight.sh"
if grep -Eq '\^\(latest\|' "$repo_root/ops/rollback.sh"; then
  echo "Rollback still accepts mutable latest tags." >&2
  exit 1
fi

sandbox="$(mktemp -d)"
trap 'rm -rf "$sandbox"' EXIT
printf 'latest\n' > "$sandbox/.deploy-previous"
if (cd "$sandbox" && bash "$repo_root/ops/rollback.sh") 2>"$sandbox/error.log"; then
  echo "Legacy latest rollback unexpectedly succeeded." >&2
  exit 1
fi
grep -Fq 'Legacy latest rollback tags are no longer supported.' "$sandbox/error.log"

printf 'Immutable deployment contract checks passed for %s.\n' "$sha"
