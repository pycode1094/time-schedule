#Requires -Version 5.1
<#
  알림톡 발송 도우미 제거

    1. 작업 스케줄러의 자동 실행 작업을 멈추고 삭제
    2. 실행 중인 발송 도우미(node notify-helper\server.js) 종료
    3. (-ResetEnvPermissions 를 주면) notify-helper\.env 권한을 폴더 기본값으로 되돌림

  실행: powershell -ExecutionPolicy Bypass -File scripts\uninstall-notify-helper.ps1
  .env 와 logs\ 는 지우지 않는다. 필요 없으면 직접 지우세요 (.env 에 API 키가 있음).
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'TimeSchedule-NotifyHelper',
  [switch]$ResetEnvPermissions
)

$ErrorActionPreference = 'Stop'
$Root    = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root 'notify-helper\.env'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "작업 스케줄러에서 '$TaskName' 을 삭제했습니다."
} else {
  Write-Host "작업 스케줄러에 '$TaskName' 이 없습니다."
}

# 작업을 멈춰도 node 가 남을 수 있어 직접 종료
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'notify-helper[\\/]server\.js' }
foreach ($p in $procs) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "실행 중인 발송 도우미(PID $($p.ProcessId))를 종료했습니다."
}

if ($ResetEnvPermissions -and (Test-Path $EnvFile)) {
  & icacls $EnvFile /reset | Out-Null
  Write-Host 'notify-helper\.env 권한을 폴더 기본값으로 되돌렸습니다.'
}

Write-Host '제거 완료. (.env 와 logs\ 는 그대로 있습니다)' -ForegroundColor Green
