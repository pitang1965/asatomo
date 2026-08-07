<#
  ビルド済み APK を Wi-Fi 接続した実機へインストールするヘルパ（アサトモ開発用）。

  役割分担:
    scripts/adb-wifi.ps1        端末との Wi-Fi 接続（ポート変化に追随）
    scripts/build-android.sh    APK をビルド（assembleRelease / assembleDebug）
    scripts/install-android-wifi.ps1  ← ここ: ビルド済み APK を実機へ install

  既定は release（本番 https://asatomo.nafuda.me を向くビルド）。debug 版が
  入っている端末に release を上書きすると通信先が本番へ切り替わる（署名は
  どちらも debug 鍵なので通常は上書き可。万一の署名不一致は自動で入れ直す）。

  使い方（新しいターミナルで）:
    npm run android:install:release            # 接続確認 → release APK を実機へ
    npm run android:install:release -- -Build  # ビルドしてから実機へ（build:release 省略）
    npm run android:install:release -- -Variant debug
    bash scripts/install-android-wifi.sh       # npm を介さない同等
    pwsh scripts/install-android-wifi.ps1      # PowerShell を直接使う場合

  前提:
    - 端末の「ワイヤレスデバッグ」が ON。未接続なら自動で adb-wifi.ps1 を呼ぶ
      （ポート番号だけ聞かれることがある。端末画面の値を入力）。
    - -Build を付けるとき、または APK 未生成のときは Android Studio 同梱 JBR が要る
      （build-android.sh が JAVA_HOME を面倒見る）。
#>
param(
  [ValidateSet('release', 'debug')][string]$Variant = 'release',
  [switch]$Build,                 # インストール前に build-android.sh でビルドする
  [switch]$Reinstall              # 署名不一致でなくても先にアンインストールしてから入れる
)

$ErrorActionPreference = 'Stop'
$appId = 'com.asatomo.app'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$scriptDir = $PSScriptRoot
$repoRoot = Split-Path $scriptDir -Parent
$apk = Join-Path $repoRoot "android/app/build/outputs/apk/$Variant/app-$Variant.apk"

function Say($m) { Write-Host $m -ForegroundColor Cyan }
function Warn($m) { Write-Host $m -ForegroundColor Yellow }

if (-not (Test-Path $adb)) {
  Warn "adb が見つかりません: $adb"
  Warn "Android SDK の platform-tools を確認してください。"
  exit 1
}

# --- 1. 必要ならビルド --------------------------------------------------------
# APK があっても、ソースが APK より新しいと「古い成果物を入れ直す」だけになり反映されない。
# VSCode の NPM スクリプトパネルからは引数（-Build）を渡せないため、-Build 未指定でも
# 「APK にコンパイルされるソース（android/app/src とビルド設定）が APK より新しければ
# 自動でリビルド」する。何も変えていなければ従来どおり即インストール（高速パス）。
$needBuild = [bool]$Build -or -not (Test-Path $apk)
if (-not $needBuild) {
  $apkTime = (Get-Item $apk).LastWriteTimeUtc
  $watch = @()
  $srcDir = Join-Path $repoRoot 'android/app/src'
  if (Test-Path $srcDir) {
    $watch += Get-ChildItem -Path $srcDir -Recurse -File -ErrorAction SilentlyContinue
  }
  foreach ($rel in @(
      'android/app/build.gradle', 'android/app/build.gradle.kts',
      'android/build.gradle', 'android/build.gradle.kts',
      'android/gradle.properties', 'android/variables.gradle',
      'capacitor.config.ts', 'capacitor.config.json')) {
    $p = Join-Path $repoRoot $rel
    if (Test-Path $p) { $watch += Get-Item $p }
  }
  $newest = ($watch | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
  if ($newest -and $newest -gt $apkTime) {
    Warn "ソースが APK より新しいため自動でリビルドします。"
    Warn "  APK       : $($apkTime.ToLocalTime())"
    Warn "  最新ソース: $($newest.ToLocalTime())"
    $needBuild = $true
  }
}
if ($needBuild) {
  if (-not $Build -and -not (Test-Path $apk)) {
    Warn "APK が未生成のためビルドします: $apk"
  }
  Say "ビルド中: build-android.sh $Variant"
  # 素の `bash` は WSL の bash（C:\Windows\System32\bash.exe）に解決され、Windows パスを
  # Linux パスと誤解釈してビルドが落ちる（PWD が「C:Users...」に化ける）。必ず Git Bash を使う。
  $gitBash = @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    $(if ($g = (Get-Command git -ErrorAction SilentlyContinue).Source) {
        Join-Path (Split-Path (Split-Path $g -Parent) -Parent) 'bin\bash.exe'
      })
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $gitBash) {
    Warn "Git Bash が見つかりません（例: C:\Program Files\Git\bin\bash.exe）。Git for Windows を確認してください。"
    exit 1
  }
  # Git Bash へは MSYS 形式（/c/Users/...）で渡す。Windows のバックスラッシュ絶対パスは
  # エスケープとして食い潰され「C:Users...」に化けるため。
  $bs = (Join-Path $scriptDir 'build-android.sh') -replace '\\', '/'
  if ($bs -match '^([A-Za-z]):/(.*)$') { $bs = '/' + $Matches[1].ToLower() + '/' + $Matches[2] }
  & $gitBash $bs $Variant
  if ($LASTEXITCODE -ne 0) { Warn "ビルドに失敗しました。"; exit 1 }
}
if (-not (Test-Path $apk)) {
  Warn "ビルド後も APK が見つかりません: $apk"
  exit 1
}

# --- 2. 端末が接続済みか確認。未接続なら Wi-Fi 接続を試みる --------------------
function Get-ConnectedDevices {
  # `adb devices` の各行末が "device" のものだけ数える（offline / unauthorized は除く）。
  $lines = & $adb devices 2>$null | Select-Object -Skip 1
  @($lines | Where-Object { $_ -match '\sdevice$' })
}

& $adb start-server | Out-Null
# @(...) で包む: 関数が要素1個の配列を返すと PowerShell がスカラーへ展開してしまい、
# $devices[0] が「行」ではなく文字列の先頭文字を拾う（serial が "1" 等になる）ため。
$devices = @(Get-ConnectedDevices)
if ($devices.Count -eq 0) {
  Say "接続済みの端末がありません。Wi-Fi 接続を試みます（adb-wifi.ps1）…"
  & (Join-Path $repoRoot 'adb-wifi.ps1')
  $devices = @(Get-ConnectedDevices)
}
if ($devices.Count -eq 0) {
  Warn "端末に接続できませんでした。端末のワイヤレスデバッグを確認して再実行してください。"
  exit 1
}
if ($devices.Count -gt 1) {
  Warn "複数の端末が接続されています。1台だけにして再実行してください:"
  $devices | ForEach-Object { Warn "  $_" }
  exit 1
}
$serial = ($devices[0] -split '\s+')[0]
Say "対象端末: $serial"

# --- 3. インストール（署名不一致なら入れ直す） --------------------------------
function Install-Apk {
  Say "adb install -r $apk"
  # 出力を捕まえて成否と失敗理由を判定する（adb は失敗でも 0 を返すことがある）。
  $out = & $adb -s $serial install -r $apk 2>&1
  $out | ForEach-Object { Write-Host "  $_" }
  return ($out -join "`n")
}

if ($Reinstall) {
  Say "先にアンインストール: $appId"
  & $adb -s $serial uninstall $appId 2>&1 | ForEach-Object { Write-Host "  $_" }
}

$result = Install-Apk
if ($result -notmatch 'Success') {
  if ($result -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INSTALL_FAILED_VERSION_DOWNGRADE') {
    Warn "既存アプリと署名/バージョンが不一致のため、アンインストールしてから入れ直します。"
    & $adb -s $serial uninstall $appId 2>&1 | ForEach-Object { Write-Host "  $_" }
    $result = Install-Apk
  }
}

Write-Host "------------------------------------------------------------"
if ($result -match 'Success') {
  Say "✅ インストール成功: $Variant を $serial へ"
  if ($Variant -eq 'release') {
    Say "   通信先は本番 https://asatomo.nafuda.me です。アプリで pitang1965@gmail.com にログインしてください。"
  }
} else {
  Warn "❌ インストールに失敗しました。上のログを確認してください。"
  exit 1
}
