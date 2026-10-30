# Deja la sincronización con Chess de ESTA PC andando sola (la base local AnalisisComercial):
#   - una tarea de Windows que corre sincronizar.ps1 -Automatico todos los días a la -Hora (por defecto 06:30, después de
#     la de producción de las 05:00: las dos usan el mismo usuario de Chess). Si la PC estaba apagada, corre al prenderla.
#   - un acceso directo en el escritorio, «Actualizar datos de Chess», para correrla con un clic cuando haga falta.
# Lo llama programar-sincronizacion.bat. Con -Quitar borra la tarea y el acceso directo.
# Corre con tu usuario y solo con la sesión abierta: no hace falta ser administrador ni guardar tu clave de Windows.
param(
    [string]$Hora = '06:30',
    [switch]$Quitar
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$tarea = 'Analisis Comercial - Sincronizar Chess'
$acceso = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Actualizar datos de Chess.lnk'

if ($Quitar) {
    if (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $tarea -Confirm:$false
    }
    if (Test-Path $acceso) { Remove-Item $acceso }
    Write-Host 'Listo: se quitaron la tarea diaria y el acceso directo.'
    exit 0
}

$cuando = [datetime]::ParseExact($Hora, 'HH:mm', $null)

# La tarea no puede preguntar la clave: si no está guardada, se pide ahora.
$secretos = Join-Path $env:APPDATA 'Microsoft\UserSecrets\analisis-comercial-sync-3f9d1c55\secrets.json'
if (-not (Test-Path $secretos)) {
    Write-Host 'Primero, la clave de la API de Chess (se guarda solo en esta PC).'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sincronizar.ps1') -SoloClave
    if ($LASTEXITCODE -ne 0) { Write-Host 'Sin la clave no se puede programar.'; exit 1 }
}

$script = Join-Path $PSScriptRoot 'sincronizar.ps1'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $PSScriptRoot `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Automatico"
$disparador = New-ScheduledTaskTrigger -Daily -At $cuando
$opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$quien = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger $disparador -Settings $opciones -Principal $quien `
    -Description 'Baja los datos de Chess a la base local de Análisis Comercial (Madomi). La creó programar-sincronizacion.bat.' `
    -Force | Out-Null

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($acceso)
$lnk.TargetPath = Join-Path $PSScriptRoot 'sincronizar.bat'
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Description = 'Baja ahora los datos de Chess a la base local de Análisis Comercial'
$lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,238"
$lnk.Save()

Write-Host ''
Write-Host "Listo:"
Write-Host "  - Todos los días a las $Hora se bajan los datos de Chess (si la PC estaba apagada, al prenderla)."
Write-Host "  - En el escritorio quedó «Actualizar datos de Chess» para hacerlo con un clic."
Write-Host "  - Lo que pasó en cada corrida automática: $env:LOCALAPPDATA\AnalisisComercial\logs"
Write-Host ''
$ahora = Read-Host '¿Bajar los datos ahora? La primera vez trae todo desde julio y tarda unos minutos (S/N)'
if ($ahora -match '^[sS]') {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $script
}
