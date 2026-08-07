#!/usr/bin/env bash
#
# Wi-Fi 接続済み Android 端末へ release APK を入れる bash の入口。
# 実装は Windows の ADB/SDK パスを扱う既存の PowerShell に一本化する。
#
# 使い方:
#   npm run android:install:release
#   bash scripts/install-android-wifi.sh -- -Build
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS_SCRIPT="${SCRIPT_DIR}/install-android-wifi.ps1"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    PS_SCRIPT="$(cygpath -w "${PS_SCRIPT}")"
    ;;
  Linux*)
    if ! command -v wslpath >/dev/null 2>&1; then
      echo "エラー: このスクリプトは Windows の Git Bash または WSL で実行してください。" >&2
      exit 1
    fi
    PS_SCRIPT="$(wslpath -w "${PS_SCRIPT}")"
    ;;
esac

if command -v pwsh.exe >/dev/null 2>&1; then
  POWERSHELL="pwsh.exe"
elif command -v powershell.exe >/dev/null 2>&1; then
  POWERSHELL="powershell.exe"
else
  echo "エラー: Windows PowerShell（pwsh.exe または powershell.exe）が見つかりません。" >&2
  exit 1
fi

exec "${POWERSHELL}" -NoProfile -File "${PS_SCRIPT}" "$@"
