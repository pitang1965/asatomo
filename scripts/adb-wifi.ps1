<#
  実機Wi-Fi接続ヘルパ（アサトモ開発用・ローカル専用）。

  やること:
    1. adb の mDNS を Openscreen バックエンドに固定（Windows既定 Bonjour が壊れると
       Android Studio のワイヤレス自動再接続が全滅するため）。
    2. 端末へ接続（引数の ip:port → 前回値 → mDNS自動検出 の順で試す）。
    3. dev サーバー転送 `adb reverse tcp:5173 tcp:5173` を張る。

  使い方（新しいターミナルで）:
    pwsh scripts/adb-wifi.ps1                     # 前回の ip:port か mDNS 自動検出で再接続
    pwsh scripts/adb-wifi.ps1 192.168.1.23:37045  # その ip:port で接続（次回用に記憶）
    pwsh scripts/adb-wifi.ps1 -Pair 192.168.1.23:41000 -Code 123456  # 初回ペアのみ

  端末側の値の在り処:
    設定 → 開発者オプション → ワイヤレスデバッグ（ON）→ 項目をタップ
      「IPアドレスとポート」        = 接続用 ip:port（毎回変わる。引数 or 自動検出で吸収）
      「ペア設定コードでデバイスを…」 = 初回ペア用の別 ip:port ＋ 6桁コード
#>
param(
  [string]$Endpoint,           # 接続先 ip:port（省略時は前回値→mDNS）
  [string]$Pair,               # 初回ペア用 ip:port
  [string]$Code,               # 初回ペア用 6桁コード
  [int]$Port = 5173            # dev サーバーの reverse ポート
)

$ErrorActionPreference = 'Stop'
$env:ADB_MDNS_OPENSCREEN = '1'   # このプロセスの adb を Openscreen に固定
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$lastFile = "$env:LOCALAPPDATA\asatomo-adb-last.txt"

function Say($m) { Write-Host $m -ForegroundColor Cyan }

& $adb start-server | Out-Null

# 初回ペア（指定時のみ）。ペアは一度きり。以降は connect だけで戻る。
if ($Pair -and $Code) {
  Say "ペア設定中: $Pair"
  & $adb pair $Pair $Code
}

# 接続先の決定: 明示引数 > 前回値 > mDNS自動検出。
if (-not $Endpoint -and (Test-Path $lastFile)) {
  $Endpoint = (Get-Content $lastFile -Raw).Trim()
  if ($Endpoint) { Say "前回の接続先を使用: $Endpoint" }
}

if (-not $Endpoint) {
  Say "mDNS で端末を探索中…（端末のワイヤレスデバッグ画面を開いたままにしてください）"
  $svc = & $adb mdns services 2>$null
  $line = $svc | Where-Object { $_ -match '_adb-tls-connect\._tcp' } | Select-Object -First 1
  if ($line) {
    $Endpoint = ($line -split '\s+')[-1]
    Say "検出: $Endpoint"
  }
}

if (-not $Endpoint) {
  Write-Host "接続先が見つかりません。端末の『IPアドレスとポート』を引数で渡してください:" -ForegroundColor Yellow
  Write-Host "  pwsh scripts/adb-wifi.ps1 192.168.x.x:xxxxx" -ForegroundColor Yellow
  exit 1
}

Say "接続: $Endpoint"
& $adb connect $Endpoint
$Endpoint | Set-Content $lastFile -NoNewline   # 次回のために記憶

# dev サーバー転送を張る（本番URLで試すなら不要だが、張っても無害）。
& $adb reverse "tcp:$Port" "tcp:$Port" 2>$null

Say "----- 現在の接続 -----"
& $adb devices
