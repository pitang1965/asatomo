<#
  実機Wi-Fi接続ヘルパ（アサトモ開発用・ローカル専用）。

  やること:
    1. adb の mDNS を Openscreen バックエンドに固定（Windows既定 Bonjour が壊れると
       Android Studio のワイヤレス自動再接続が全滅するため）。
    2. 端末へ接続（引数 → 前回値 → mDNS自動検出 の順で試す）。失敗したら
       ポート番号だけを対話入力してもらい、記憶している IP と合成して再接続する。
    3. dev サーバー転送 `adb reverse tcp:5173 tcp:5173` を張る。

  背景（なぜポートだけ聞くのか）:
    Android11 の「ワイヤレスデバッグ」トグルは OEM のバッテリー最適化・Wi-Fiスリープ等で
    勝手に OFF になり、再ONのたびにポートが変わる。一方 IP は LAN内でほぼ不変。
    そこで、変わるポートだけを最小入力で受け取り、IP は前回値を再利用する。

  使い方（新しいターミナルで）:
    npm run android:connect            # ← 日常: 前回値/mDNSで再接続。ダメなら「ポート番号だけ」聞く
    npm run android:connect -- 37045   # 変わったポート番号だけ渡す（IPは前回値を再利用）
    npm run android:connect -- 192.168.1.23:37045   # IPごと変わった時だけ ip:port
    pwsh adb-wifi.ps1                  # npm を介さない同等（直接呼び出し・リポジトリ直下）
    pwsh adb-wifi.ps1 -Pair 192.168.1.23:41000 -Code 123456  # 初回ペアのみ

  端末側の値の在り処:
    設定 → 開発者オプション → ワイヤレスデバッグ（ON）→ 項目をタップ
      「IPアドレスとポート」        = 接続用 ip:port（ポートが毎回変わる ← これを入力）
      「ペア設定コードでデバイスを…」 = 初回ペア用の別 ip:port ＋ 6桁コード
#>
param(
  [string]$Endpoint,           # 接続先。ip:port か、ポート番号だけ（前回IPと合成）。省略時は前回値→mDNS
  [string]$Pair,               # 初回ペア用 ip:port
  [string]$Code,               # 初回ペア用 6桁コード
  [int]$Port = 5173            # dev サーバーの reverse ポート
)

$ErrorActionPreference = 'Stop'
$env:ADB_MDNS_OPENSCREEN = '1'   # このプロセスの adb を Openscreen に固定
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$lastFile = "$env:LOCALAPPDATA\asatomo-adb-last.txt"

function Say($m) { Write-Host $m -ForegroundColor Cyan }

# adb を実行し、出力を「文字化けしない文字列」で返す。
#   adb は日本語のエラー文も UTF-8 で出力する。一方この開発機のコンソールは chcp 932
#   （[Console]::OutputEncoding = shift_jis）なので、既定の `& $adb` は UTF-8 バイトを
#   Shift-JIS として解釈してしまい `謗･邯壽ｸ…` と化ける。そこで adb の出力を
#   StandardOutputEncoding=UTF-8 で明示デコードして受け取る（pwsh 本来の出力は不変）。
function Invoke-Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$AdbArgs)
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $adb
  foreach ($a in $AdbArgs) { [void]$psi.ArgumentList.Add($a) }
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $psi.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
  $p = [System.Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  return (($out + $err) -split "`r?`n" | Where-Object { $_ -ne '' })
}

# 前回の接続先と、そこから取り出した IP（ポートだけ入力/合成する時の土台）。
$lastEndpoint = if (Test-Path $lastFile) { (Get-Content $lastFile -Raw).Trim() } else { "" }
$lastIp = if ($lastEndpoint -match '^(\d{1,3}(?:\.\d{1,3}){3}):\d+$') { $Matches[1] } else { "" }

# 1回接続を試し、成功（connected / already connected）したかを返す。
function Connect-To($ep) {
  Say "接続: $ep"
  $out = Invoke-Adb connect $ep
  $out | ForEach-Object { Write-Host "  $_" }
  return [bool]($out -match 'connected to')
}

Invoke-Adb start-server | Out-Null

# 初回ペア（指定時のみ）。ペアは一度きり。以降は connect だけで戻る。
if ($Pair -and $Code) {
  Say "ペア設定中: $Pair"
  Invoke-Adb pair $Pair $Code | ForEach-Object { Write-Host "  $_" }
}

# 引数がポート番号だけなら、前回IPと合成する（変わるのはポートだけ、という前提）。
if ($Endpoint -match '^\d+$') {
  if ($lastIp) {
    $Endpoint = "${lastIp}:$Endpoint"
    Say "前回IPと合成: $Endpoint"
  } else {
    Write-Host "前回IPが未記録のため、初回は ip:port で渡してください（例 192.168.1.23:37045）。" -ForegroundColor Yellow
    exit 1
  }
}

# 接続先の決定: 明示引数 > 前回値 > mDNS自動検出。
if (-not $Endpoint -and $lastEndpoint) {
  $Endpoint = $lastEndpoint
  Say "前回の接続先を使用: $Endpoint"
}

if (-not $Endpoint) {
  Say "mDNS で端末を探索中…（端末のワイヤレスデバッグ画面を開いたままにしてください）"
  $svc = Invoke-Adb mdns services
  $line = $svc | Where-Object { $_ -match '_adb-tls-connect\._tcp' } | Select-Object -First 1
  if ($line) {
    $Endpoint = ($line -split '\s+')[-1]
    Say "検出: $Endpoint"
  }
}

# 接続を試す。失敗したら「ポート番号だけ」聞いて、前回IPと合成して繰り返す。
$connected = $false
if ($Endpoint) { $connected = Connect-To $Endpoint }

while (-not $connected) {
  if ($lastIp) {
    $p = Read-Host "接続できません。端末『IPアドレスとポート』を入力（ポート番号だけなら IP=$lastIp と合成 / IPが変わったら ip:port を丸ごと / 空Enterで中止）"
    $p = $p.Trim()
    if (-not $p) { break }
    $Endpoint = if ($p -match '^\d+$') { "${lastIp}:$p" } else { $p }  # IPが変わったら ip:port を丸ごと入れる
  } else {
    $e = Read-Host "接続できません。端末の ip:port を入力（例 192.168.1.23:37045 / 空Enterで中止）"
    $e = $e.Trim()
    if (-not $e) { break }
    $Endpoint = $e
  }
  $connected = Connect-To $Endpoint
}

if (-not $connected) {
  Write-Host "接続を中止しました。端末のワイヤレスデバッグがONか、IPが変わっていないか確認してください。" -ForegroundColor Yellow
  exit 1
}

$Endpoint | Set-Content $lastFile -NoNewline   # 次回のために記憶（IP変更もここで追随）

# dev サーバー転送を張る（本番URLで試すなら不要だが、張っても無害）。
Invoke-Adb reverse "tcp:$Port" "tcp:$Port" | Out-Null

Say "----- 現在の接続 -----"
Invoke-Adb devices | ForEach-Object { Write-Host $_ }
