#!/usr/bin/env bash
# Publishes a new version: bumps the version, builds + signs the APK, pushes the code,
# and creates a GitHub Release with the APK attached. The app's "check for updates"
# reads the newest release of this repo and offers to install it.
#
# Usage (Git Bash):  bash release.sh 1.4.1 "What changed (shown in the app)"
#                    bash release.sh            -> bumps the last number (1.4.0 -> 1.4.1)
set -euo pipefail

REPO="yoely0966/hitdanoigen-app"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VP="$HERE/android/version.properties"
cd "$HERE"

cur_name="$(grep '^VERSION_NAME=' "$VP" | cut -d= -f2 | tr -d '\r')"
cur_code="$(grep '^VERSION_CODE=' "$VP" | cut -d= -f2 | tr -d '\r')"
new_name="${1:-}"
if [ -z "$new_name" ]; then
  IFS=. read -r a b c <<<"$cur_name"; new_name="$a.$b.$((c + 1))"
fi
notes="${2:-ווערזשן $new_name}"
new_code=$((cur_code + 1))

git diff --quiet HEAD -- 2>/dev/null || echo "note: uncommitted changes will be included in this release"
echo "== $cur_name ($cur_code) -> $new_name ($new_code)"
printf 'VERSION_NAME=%s\nVERSION_CODE=%s\n' "$new_name" "$new_code" > "$VP"

bash android/build.sh
APK="dist/HitDaneOigen.apk"

git add -A
git commit -m "Release v$new_name" -m "$notes" >/dev/null
git tag -a "v$new_name" -m "v$new_name"
git push origin HEAD --tags

# GitHub token from Git's credential manager (the same sign-in used for the push above)
TOKEN="$(printf 'protocol=https\nhost=github.com\nusername=yoely0966\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')"
[ -n "$TOKEN" ] || { echo "No GitHub sign-in found for github.com - push once so Git asks you to log in." >&2; exit 1; }
api() { curl -fsS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

body="$(node -e 'process.stdout.write(JSON.stringify({tag_name:process.argv[1],name:process.argv[1],body:process.argv[2],draft:false,prerelease:false}))' "v$new_name" "$notes")"
rel="$(api -X POST "https://api.github.com/repos/$REPO/releases" -d "$body")"
upload="$(printf '%s' "$rel" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).upload_url.replace(/\{.*$/,"")))')"
api -X POST -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"$APK" "$upload?name=HitDaneOigen-$new_name.apk" >/dev/null
unset TOKEN
echo "OK -> https://github.com/$REPO/releases/tag/v$new_name"
