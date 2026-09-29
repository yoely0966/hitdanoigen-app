#!/usr/bin/env bash
# Builds, signs and copies the HitDaneOigen APK without Gradle.
# Usage (Git Bash):  bash android/build.sh          -> dist/HitDaneOigen.apk
# Env overrides: ANDROID_SDK, JDK_BIN, BUILD_TOOLS_VERSION, PLATFORM
set -euo pipefail

# version comes from android/version.properties (release.sh bumps it); env vars override
_VP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/version.properties"
_vp() { [ -f "$_VP" ] && grep "^$1=" "$_VP" | cut -d= -f2 | tr -d '
'; }
VERSION_NAME="${VERSION_NAME:-$(_vp VERSION_NAME)}"; VERSION_NAME="${VERSION_NAME:-1.0.0}"
VERSION_CODE="${VERSION_CODE:-$(_vp VERSION_CODE)}"; VERSION_CODE="${VERSION_CODE:-1}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ANDROID_SDK="${ANDROID_SDK:-${ANDROID_HOME:-$HOME/AppData/Local/Android/Sdk}}"
JDK_BIN="${JDK_BIN:-/c/Program Files/Android/Android Studio/jbr/bin}"
PLATFORM="${PLATFORM:-android-35}"
ANDROID_JAR="$ANDROID_SDK/platforms/$PLATFORM/android.jar"

if [ -z "${BUILD_TOOLS_VERSION:-}" ]; then
  for v in 36.1.0 37.0.0 34.0.0; do
    if [ -x "$ANDROID_SDK/build-tools/$v/aapt2.exe" ] || [ -x "$ANDROID_SDK/build-tools/$v/aapt2" ]; then BUILD_TOOLS_VERSION=$v; break; fi
  done
fi
BT="$ANDROID_SDK/build-tools/$BUILD_TOOLS_VERSION"
ext() { if [ -e "$BT/$1.exe" ]; then echo "$BT/$1.exe"; elif [ -e "$BT/$1.bat" ]; then echo "$BT/$1.bat"; else echo "$BT/$1"; fi; }
AAPT2="$(ext aapt2)"; AAPT="$(ext aapt)"; ZIPALIGN="$(ext zipalign)"
JAVAC="$JDK_BIN/javac"; JAVA="$JDK_BIN/java"; KEYTOOL="$JDK_BIN/keytool"
# d8/apksigner .bat wrappers break on paths with spaces under cmd.exe -> call their jars directly
D8_JAR="$BT/lib/d8.jar"; APKSIGNER_JAR="$BT/lib/apksigner.jar"
d8() { "$JAVA" -Xmx1g -cp "$(w "$D8_JAR")" com.android.tools.r8.D8 "$@"; }
apksigner() { "$JAVA" -jar "$(w "$APKSIGNER_JAR")" "$@"; }

for f in "$ANDROID_JAR" "$AAPT2" "$AAPT" "$D8_JAR" "$ZIPALIGN" "$APKSIGNER_JAR" "$JAVAC"; do
  [ -e "$f" ] || [ -e "$f.exe" ] || { echo "Missing: $f" >&2; exit 1; }
done
echo "SDK: $ANDROID_SDK  build-tools: $BUILD_TOOLS_VERSION  platform: $PLATFORM"

# Windows tools want Windows paths
w() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

OUT="$HERE/build"
rm -rf "$OUT"/* 2>/dev/null || rm -rf "$OUT"/*
mkdir -p "$OUT/compiled" "$OUT/gen" "$OUT/classes" "$OUT/dex"

# 1. Launcher icons (drawn by tools/DrawIcon.java, then scaled to every density)
if [ ! -f "$HERE/res/mipmap-xxxhdpi/ic_launcher.png" ]; then
  echo "== icons"
  mkdir -p "$OUT"
  "$JAVA" "$(w "$HERE/tools/DrawIcon.java")" "$(w "$OUT/icon-512.png")"
  "$JAVA" "$(w "$HERE/tools/IconGen.java")" "$(w "$OUT/icon-512.png")" "$(w "$HERE/res")"
fi

# 2. Signing key (created once; BACK IT UP - updates must use the same key)
KS="$HERE/hdo-release.jks"; PROPS="$HERE/keystore.properties"
if [ ! -f "$KS" ]; then
  echo "== creating release keystore"
  PASS="$(set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 32)"
  [ ${#PASS} -eq 32 ] || { echo "password generation failed" >&2; exit 1; }
  "$KEYTOOL" -genkeypair -keystore "$(w "$KS")" -storetype PKCS12 -alias hdo \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=HitDaneOigen" \
    -storepass "$PASS" -keypass "$PASS" >/dev/null
  printf 'storeFile=hdo-release.jks\nstorePassword=%s\nkeyAlias=hdo\nkeyPassword=%s\n' "$PASS" "$PASS" > "$PROPS"
  unset PASS
fi
prop() { grep "^$1=" "$PROPS" | head -1 | cut -d= -f2- | tr -d '\r'; }
STORE_PASS="$(prop storePassword)"; KEY_PASS="$(prop keyPassword)"; ALIAS="$(prop keyAlias)"

# 3. Resources
echo "== aapt2 compile/link"
"$AAPT2" compile --dir "$(w "$HERE/res")" -o "$(w "$OUT/compiled/res.zip")"
"$AAPT2" link -o "$(w "$OUT/base.apk")" -I "$(w "$ANDROID_JAR")" \
  --manifest "$(w "$HERE/AndroidManifest.xml")" --java "$(w "$OUT/gen")" \
  --min-sdk-version 24 --target-sdk-version 35 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --auto-add-overlay "$(w "$OUT/compiled/res.zip")"

# 4. Java -> classes -> dex
echo "== javac"
find "$HERE/src" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
# javac reads @file paths literally; convert to Windows form
: > "$OUT/sources.win.txt"
while IFS= read -r f; do printf '"%s"\n' "$(w "$f" | sed 's/\\/\\\\/g')" >> "$OUT/sources.win.txt"; done < "$OUT/sources.txt"
"$JAVAC" --release 11 -nowarn -Xlint:-options -encoding UTF-8 \
  -classpath "$(w "$ANDROID_JAR")" -d "$(w "$OUT/classes")" "@$(w "$OUT/sources.win.txt")"

echo "== d8"
CLASSFILES=()
while IFS= read -r f; do CLASSFILES+=("$(w "$f")"); done < <(find "$OUT/classes" -name '*.class')
d8 --release --lib "$(w "$ANDROID_JAR")" --min-api 24 --output "$(w "$OUT/dex")" "${CLASSFILES[@]}"

# 5. Add classes.dex, align, sign
echo "== package"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
# aapt (v1) "add" appends without touching existing entries (resources.arsc must stay uncompressed)
( cd "$OUT/dex" && "$AAPT" add "$(w "$OUT/unsigned.apk")" classes.dex >/dev/null )
# bundled UI (assets/ui/*) - added the same way; aapt2 -A skips them on Windows paths
( cd "$HERE" && find assets -type f | while IFS= read -r f; do "$AAPT" add "$(w "$OUT/unsigned.apk")" "$f" >/dev/null; done )
"$ZIPALIGN" -f -p 4 "$(w "$OUT/unsigned.apk")" "$(w "$OUT/aligned.apk")"
apksigner sign --ks "$(w "$KS")" --ks-key-alias "$ALIAS" \
  --ks-pass "pass:$STORE_PASS" --key-pass "pass:$KEY_PASS" \
  --out "$(w "$OUT/HitDaneOigen.apk")" "$(w "$OUT/aligned.apk")"
apksigner verify "$(w "$OUT/HitDaneOigen.apk")"

mkdir -p "$ROOT/dist"
cp "$OUT/HitDaneOigen.apk" "$ROOT/dist/HitDaneOigen.apk"
echo "OK -> $ROOT/dist/HitDaneOigen.apk ($(wc -c < "$ROOT/dist/HitDaneOigen.apk") bytes)"
