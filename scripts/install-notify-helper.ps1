#Requires -Version 5.1
<#
  알림톡 발송 도우미 설치 (시간표를 업로드하는 PC 에서 1번 실행)

    1. Node.js 20 이상인지 확인
    2. notify-helper\.env 를 현재 사용자만 읽고 쓸 수 있게 권한 설정 (icacls)
    3. Windows 작업 스케줄러에 "로그온 시 자동 실행(창 숨김)" 작업 등록
    4. 바로 시작하고 http://127.0.0.1:5599/health 로 동작 확인

  실행 (저장소 폴더에서, 일반 PowerShell):
    powershell -ExecutionPolicy Bypass -File scripts\install-notify-helper.ps1

  제거: scripts\uninstall-notify-helper.ps1
  ※ 비즈고 연동관리에는 이 PC 의 공인 IP 를 등록해야 한다 (GitHub Pages 주소 아님).
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'TimeSchedule-NotifyHelper',
  [switch]$NoStart
)

$ErrorActionPreference = 'Stop'
$Root    = Split-Path -Parent $PSScriptRoot
$Server  = Join-Path $Root 'notify-helper\server.js'
$EnvFile = Join-Path $Root 'notify-helper\.env'
$User    = "$env:USERDOMAIN\$env:USERNAME"

function Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }

if (-not (Test-Path $Server)) { throw "notify-helper\server.js 를 찾을 수 없습니다: $Server" }

# 1. Node.js 20 이상
Step 'Node.js 버전 확인'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 가 없습니다. https://nodejs.org 에서 20 이상(LTS)을 설치한 뒤 다시 실행하세요.' }
$version = (& $node.Source --version).Trim().TrimStart('v')
if ([int]($version.Split('.')[0]) -lt 20) { throw "Node.js $version 입니다. 20 이상이 필요합니다." }
Write-Host "  Node.js $version ($($node.Source))"

# 2. .env 권한: 상속을 끊고 현재 사용자만 (읽기 · 쓰기)
Step 'notify-helper\.env 권한 설정'
if (-not (Test-Path $EnvFile)) {
  throw "notify-helper\.env 가 없습니다. notify-helper\.env.example 을 복사해 값을 넣은 뒤 다시 실행하세요."
}
& icacls $EnvFile /reset | Out-Null
& icacls $EnvFile /inheritance:r /grant:r "${User}:(M)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls 로 권한을 설정하지 못했습니다 (종료 코드 $LASTEXITCODE)" }
Write-Host "  $User 만 읽고 쓸 수 있습니다. (편집기로 고친 뒤 권한이 풀렸다면 이 스크립트를 다시 실행)"
& icacls $EnvFile

# 3. 작업 스케줄러: 로그온 시 실행, 창 숨김, 실패하면 1분 뒤 재시작, 실행 시간 제한 없음
Step "작업 스케줄러 등록: $TaskName"
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$command    = "& '$($node.Source)' '$Server'; exit `$LASTEXITCODE"
$action = New-ScheduledTaskAction -Execute $powershell `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$command`"" `
  -WorkingDirectory $Root
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $User
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description '종합시간표 알림톡 발송 도우미 (127.0.0.1:5599). 비즈고 허용 IP 에 이 PC 의 공인 IP 가 등록되어 있어야 합니다.' `
  -Force | Out-Null
Write-Host '  다음 로그온부터 창 없이 자동으로 실행됩니다. (로그온 직후 창이 잠깐 깜빡일 수 있음)'

# 4. 바로 시작하고 확인
if ($NoStart) { Write-Host "`n설치 완료. 지금 시작하려면: Start-ScheduledTask -TaskName '$TaskName'"; return }
Step '지금 시작하고 동작 확인'
Start-ScheduledTask -TaskName $TaskName
$health = $null
for ($i = 0; $i -lt 15 -and -not $health; $i++) {
  Start-Sleep -Seconds 1
  try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:5599/health' -TimeoutSec 5 } catch { }
}
if (-not $health) {
  $err = Join-Path $Root 'notify-helper\logs\start-error.txt'
  if (Test-Path $err) { Write-Warning "시작 오류: $(Get-Content $err -Raw)" }
  throw '발송 도우미가 응답하지 않습니다. npm run notify-helper 로 직접 실행해 오류를 확인하세요.'
}
Write-Host ("  모드 {0} · 발송 {1} · API 키 {2} · 공인 IP {3} ({4})" -f `
  $health.mode, $(if ($health.enabled) { '켜짐' } else { '꺼짐' }), $health.apiKey, $health.publicIp, $health.ipStatus)
if ($health.problems.Count -gt 0) {
  Write-Warning '지금은 발송할 수 없는 상태입니다:'
  $health.problems | ForEach-Object { Write-Warning "  - $_" }
}
Write-Host "`n설치 완료." -ForegroundColor Green
