#!/usr/bin/env bash
#
# アサトモ Android アプリを bash (Git Bash) からビルドするスクリプト。
#
# 使い方:
#   scripts/build-android.sh                   # debug APK をビルド (assembleDebug)
#   scripts/build-android.sh release           # release APK をビルド (assembleRelease)
#   scripts/build-android.sh debug --install   # ビルドして接続端末へインストール
#   scripts/build-android.sh debug --reinstall # アンインストール→インストール（署名不一致対策）
#   scripts/build-android.sh --clean           # クリーンしてから debug ビルド
#
# 前提:
#   - Android Studio 同梱の JBR を JAVA_HOME に使う（未設定だと gradlew が
#     「-classpath requires class path specification」で落ちる）。
#     JAVA_HOME を既に環境に設定している場合はそれを尊重する。
#   - 実機インストール時は adb で端末が接続済みであること（無線 adb は
#     scripts/adb-wifi.ps1 参照）。
#
# 環境変数:
#   JAVA_HOME       未設定なら Android Studio 同梱の JBR を使う。
#   ADB_WAIT_SECS   --reinstall で端末認識を待つ秒数（既定 30）。
#
set -euo pipefail

# --- スクリプト位置からリポジトリルートを解決 -------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)/android"

# --- JAVA_HOME: 未設定なら Android Studio の JBR を使う ----------------------
if [[ -z "${JAVA_HOME:-}" ]]; then
  JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
fi
if [[ ! -x "${JAVA_HOME}/bin/java" && ! -x "${JAVA_HOME}/bin/java.exe" ]]; then
  echo "エラー: JAVA_HOME=${JAVA_HOME} に java が見つかりません。" >&2
  echo "       Android Studio のパスが異なる場合は JAVA_HOME を指定してください:" >&2
  echo '       JAVA_HOME="/c/path/to/jbr" scripts/build-android.sh' >&2
  exit 1
fi
export JAVA_HOME

# --- 引数パース -------------------------------------------------------------
VARIANT="debug"   # debug | release
DO_CLEAN=0
DO_INSTALL=0
DO_UNINSTALL=0
APP_ID="com.asatomo.app"

for arg in "$@"; do
  case "$arg" in
    debug|release) VARIANT="$arg" ;;
    --clean)       DO_CLEAN=1 ;;
    --install)     DO_INSTALL=1 ;;
    --reinstall)   DO_INSTALL=1; DO_UNINSTALL=1 ;;
    -h|--help)
      grep '^#' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "エラー: 不明な引数 '$arg'（debug|release|--clean|--install|--reinstall|--help）" >&2
      exit 1
      ;;
  esac
done

# variant を先頭大文字に（assembleDebug / assembleRelease）
VARIANT_CAP="$(tr '[:lower:]' '[:upper:]' <<< "${VARIANT:0:1}")${VARIANT:1}"
ASSEMBLE_TASK="assemble${VARIANT_CAP}"

# --- Gradle タスク組み立て --------------------------------------------------
GRADLE_TASKS=()
[[ "$DO_CLEAN" -eq 1 ]] && GRADLE_TASKS+=("clean")
GRADLE_TASKS+=("$ASSEMBLE_TASK")
# --install は debug 前提（release は署名設定が別途必要）
if [[ "$DO_INSTALL" -eq 1 ]]; then
  GRADLE_TASKS+=("install${VARIANT_CAP}")
fi

echo "JAVA_HOME     : ${JAVA_HOME}"
echo "Android dir   : ${ANDROID_DIR}"
echo "Gradle tasks  : ${GRADLE_TASKS[*]}"
echo "------------------------------------------------------------"

# --- 実行 -------------------------------------------------------------------
cd "$ANDROID_DIR"

# --reinstall: 先に端末からアンインストール（未インストールでもエラーにしない）
if [[ "$DO_UNINSTALL" -eq 1 ]]; then
  # デーモンのコールドスタート直後は端末を列挙できず uninstall が空振りするため、
  # 先にデーモンを起動して端末認識を待つ（既に接続済みなら即座に返る）。
  adb start-server
  echo "端末の接続を待機中（最大 ${ADB_WAIT_SECS:-30} 秒）..."
  if timeout "${ADB_WAIT_SECS:-30}" adb wait-for-device; then
    echo "adb uninstall ${APP_ID} ..."
    adb uninstall "$APP_ID" || true
  else
    echo "警告: 端末が見つからないためアンインストールをスキップします。" >&2
  fi
fi

./gradlew "${GRADLE_TASKS[@]}"

# --- 成果物の場所を表示 -----------------------------------------------------
APK="${ANDROID_DIR}/app/build/outputs/apk/${VARIANT}/app-${VARIANT}.apk"
echo "------------------------------------------------------------"
if [[ -f "$APK" ]]; then
  echo "✅ ビルド成功: ${APK}"
else
  echo "✅ Gradle 完了（APK: app/build/outputs/apk/${VARIANT}/ を確認）"
fi
