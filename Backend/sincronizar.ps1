# Baja los datos reales de Chess a la base AnalisisComercial (localhost) y muestra el resumen por mes.
# Lo llaman sincronizar.bat (a mano, con el acceso directo del escritorio) y la tarea diaria de Windows que crea
# programar-sincronizacion.bat (con -Automatico). La primera vez (o con -CambiarClave) pide usuario y clave de la API de
# Chess y los guarda en los secretos de usuario de .NET de ESTA PC (%APPDATA%\Microsoft\UserSecrets), nunca en el
# proyecto ni en OneDrive.
#   -Automatico   sin preguntas ni pausa; la salida va a %LOCALAPPDATA%\AnalisisComercial\logs (se guardan 30 días)
#   -SoloClave    pide y guarda la clave, sin sincronizar
param(
    [switch]$CambiarClave,
    [switch]$RecalcularCompras,
    [switch]$Automatico,
    [switch]$SoloClave
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$idSecretos = 'analisis-comercial-sync-3f9d1c55'   # el UserSecretsId de src/AnalisisComercial.Sync
$carpeta = Join-Path $env:APPDATA "Microsoft\UserSecrets\$idSecretos"
$archivo = Join-Path $carpeta 'secrets.json'

$secretos = [ordered]@{}
if (Test-Path $archivo) {
    (Get-Content $archivo -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $secretos[$_.Name] = $_.Value }
}

if ($CambiarClave -or $SoloClave -or -not $secretos['Chess:Clave']) {
    if ($Automatico) {
        # La tarea diaria no puede preguntar: sin clave guardada, avisa y termina.
        Write-Output 'No hay clave de Chess guardada en esta PC. Abrí sincronizar.bat una vez para cargarla.'
        exit 2
    }
    $usuario = Read-Host 'Usuario de la API de Chess [madomiapi]'
    if (-not $usuario) { $usuario = 'madomiapi' }
    $segura = Read-Host 'Contraseña (no se ve mientras escribís)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { $clave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if (-not $clave) { Write-Host 'No ingresaste la contraseña.'; exit 1 }
    $secretos['Chess:Usuario'] = $usuario
    $secretos['Chess:Clave'] = $clave
    New-Item -ItemType Directory -Force $carpeta | Out-Null
    $secretos | ConvertTo-Json | Set-Content $archivo -Encoding UTF8
    Remove-Variable clave
    Write-Host 'Listo: la clave quedó guardada en los secretos de usuario de esta PC (no en el proyecto).'
    if ($SoloClave) { exit 0 }
}

# Una corrida a la vez: si la tarea diaria y el acceso directo coinciden, la segunda espera su turno o se va.
$candado = New-Object System.Threading.Mutex($false, 'Local\AnalisisComercialSincronizar')
try { $libre = $candado.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $libre = $true }   # la corrida anterior se cortó sin soltarlo
if (-not $libre) {
    Write-Output 'Ya hay una sincronización corriendo en esta PC: esperá a que termine.'
    exit 3
}
try {
    $argumentos = 'run --project src\AnalisisComercial.Sync -- --una-vez'
    if ($RecalcularCompras) { $argumentos += ' --recalcular-compras' }

    if ($Automatico) {
        $logs = Join-Path $env:LOCALAPPDATA 'AnalisisComercial\logs'
        New-Item -ItemType Directory -Force $logs | Out-Null
        Get-ChildItem $logs -Filter 'sincronizar-*.log' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item
        $log = Join-Path $logs ("sincronizar-{0:yyyy-MM-dd_HHmm}.log" -f (Get-Date))
        "Sincronización automática: $(Get-Date -Format 'dd/MM/yyyy HH:mm')" | Set-Content $log -Encoding UTF8
        # Por cmd: así la salida de dotnet (también la de error) va al archivo tal cual.
        cmd /c "chcp 65001 >nul & dotnet $argumentos >> `"$log`" 2>&1"
        $codigo = $LASTEXITCODE
        "Terminó con código ${codigo}: $(Get-Date -Format 'dd/MM/yyyy HH:mm')" | Add-Content $log -Encoding UTF8
        exit $codigo
    }

    Write-Host ''
    Write-Host 'Sincronizando con Chess. La primera vez baja todo desde julio: tarda unos minutos.'
    & dotnet $argumentos.Split(' ')
    $codigo = $LASTEXITCODE
    Write-Host ''
    if ($codigo -eq 0) {
        Write-Host 'Sincronización OK.'
    } else {
        Write-Host 'La sincronización terminó con errores (ver los pasos de arriba). Si el error es del login de Chess, corré: sincronizar.bat clave'
    }
    exit $codigo
}
finally {
    $candado.ReleaseMutex()
    $candado.Dispose()
}
