[CmdletBinding()]
param(
    [string]$Version = "dev",
    [switch]$RefreshDependencies,
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Checked {
    param(
        [Parameter(Mandatory)] [string]$Label,
        [Parameter(Mandatory)] [scriptblock]$Command
    )

    Write-Host "`n==> $Label" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label falló con código $LASTEXITCODE."
    }
}

$scriptDir = Split-Path -Parent $PSCommandPath
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))
$desktopDir = Join-Path $projectRoot "desktop"
$frontendDir = Join-Path $desktopDir "frontend"
$venvDir = Join-Path $desktopDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"
$specFile = Join-Path $desktopDir "packaging\qsuene.spec"
$outputDir = Join-Path $desktopDir "packaging\bin"
$workDir = Join-Path $desktopDir "packaging\obj"
$artifact = Join-Path $outputDir "QSuene.exe"

if (-not (Test-Path -LiteralPath $specFile -PathType Leaf)) {
    throw "No se encontró la especificación de PyInstaller: $specFile"
}

$runningBuilds = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $artifact }
)
if ($runningBuilds.Count -gt 0) {
    throw "Cierre QSuene.exe antes de compilar. Procesos activos: $($runningBuilds.ProcessId -join ', ')."
}

if (-not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    Invoke-Checked "Crear entorno virtual del escritorio" {
        python -m venv $venvDir
    }
    $RefreshDependencies = $true
}

if ($RefreshDependencies) {
    Invoke-Checked "Instalar dependencias Python" {
        & $pythonExe -m pip install -r (Join-Path $desktopDir "requirements-dev.txt")
    }
    Invoke-Checked "Instalar dependencias del frontend" {
        npm --prefix $frontendDir ci
    }
} elseif (-not (Test-Path -LiteralPath (Join-Path $frontendDir "node_modules") -PathType Container)) {
    Invoke-Checked "Instalar dependencias del frontend" {
        npm --prefix $frontendDir ci
    }
}

Invoke-Checked "Comprobar dependencias Python" {
    & $pythonExe -m pip check
}

if (-not $SkipTests) {
    Invoke-Checked "Pruebas del escritorio" {
        & $pythonExe -m pytest (Join-Path $desktopDir "app\test_download_jobs.py") -q
    }
}

Invoke-Checked "Analizar frontend" {
    npm --prefix $frontendDir run lint
}
Invoke-Checked "Compilar frontend" {
    npm --prefix $frontendDir run build
}
Invoke-Checked "Verificar módulos Python" {
    & $pythonExe -m compileall -q (Join-Path $desktopDir "app")
}
Invoke-Checked "Empaquetar Q'Suene" {
    Push-Location $projectRoot
    try {
        & $pythonExe -m PyInstaller --noconfirm --clean `
            --distpath $outputDir `
            --workpath $workDir `
            $specFile
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw "PyInstaller terminó sin generar $artifact."
}

Invoke-Checked "Comprobar SpotDL y FFmpeg dentro del paquete" {
    $runtimeCheck = Start-Process -FilePath $artifact `
        -ArgumentList "--qsuene-runtime-check" `
        -WindowStyle Hidden `
        -Wait `
        -PassThru
    if ($runtimeCheck.ExitCode -ne 0) {
        throw "La autoprueba del paquete falló con código $($runtimeCheck.ExitCode)."
    }
}

$artifactInfo = Get-Item -LiteralPath $artifact
$artifactHash = Get-FileHash -LiteralPath $artifact -Algorithm SHA256
$gitRevision = $null
if (Test-Path -LiteralPath (Join-Path $projectRoot ".git")) {
    $gitRevision = (& git -C $projectRoot rev-parse --short HEAD 2>$null)
}

$buildInfo = [ordered]@{
    product = "Q'Suene"
    version = $Version
    created_at_utc = [DateTime]::UtcNow.ToString("o")
    artifact = $artifactInfo.Name
    bytes = $artifactInfo.Length
    sha256 = $artifactHash.Hash
    git_revision = $gitRevision
    launched_during_build = $false
}
$manifestPath = Join-Path $outputDir "build-info.json"
$buildInfo | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Host "`nCompilación terminada sin abrir la aplicación." -ForegroundColor Green
Write-Host "Ejecutable: $artifact"
Write-Host "Manifiesto: $manifestPath"
Write-Host "SHA-256: $($artifactHash.Hash)"
