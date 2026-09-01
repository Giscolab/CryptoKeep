<#
.SYNOPSIS
    CryptoKeep - arret cible du serveur local demarre par le lanceur.

.DESCRIPTION
    Lit le fichier d'etat ecrit par start_secure_server.ps1 et n'arrete QUE le
    processus enfant appartenant au lanceur. Trois verifications sont exigees
    avant tout arret :

      1. le PID enregistre correspond a un processus vivant ;
      2. l'heure de demarrage du processus correspond a celle enregistree
         (protection contre la reutilisation de PID) ;
      3. la ligne de commande du processus reference secure_local_server.py.

    Aucun processus n'est jamais arrete parce qu'il utilise le port 8000.

.NOTES
    Ajout du Lot 1 (cycle de vie). N'altere aucun fichier existant.
#>
[CmdletBinding()]
param(
    [string] $RuntimeDir,
    [switch] $Quiet
)

$ErrorActionPreference = 'Stop'

function Write-Line {
    param([string] $Message)
    if (-not $Quiet) { Write-Host $Message }
}

if (-not $RuntimeDir) {
    $RuntimeDir = Join-Path $env:LOCALAPPDATA 'CryptoKeep\run'
}
$pidFile = Join-Path $RuntimeDir 'server.json'

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Line '[INFO] Aucun serveur enregistre par ce lanceur. Rien a arreter.'
    exit 0
}

try {
    $state = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
} catch {
    Write-Line '[AVERTISSEMENT] Fichier d etat illisible. Aucun processus arrete.'
    exit 0
}

$proc = Get-Process -Id $state.Pid -ErrorAction SilentlyContinue
if (-not $proc) {
    Write-Line "[INFO] Le processus $($state.Pid) n existe plus. Nettoyage de l etat."
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    exit 0
}

if ($proc.StartTime.ToString('o') -ne $state.StartTime) {
    Write-Line "[AVERTISSEMENT] Le PID $($state.Pid) a ete reattribue a un autre processus."
    Write-Line '[AVERTISSEMENT] Aucun arret effectue. Verifiez manuellement.'
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    exit 4
}

$commandLine = $null
try {
    $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($state.Pid)" -ErrorAction Stop).CommandLine
} catch {
    $commandLine = $null
}

if ($commandLine -and ($commandLine -notmatch 'secure_local_server\.py')) {
    Write-Line "[AVERTISSEMENT] Le PID $($state.Pid) n execute pas secure_local_server.py."
    Write-Line '[AVERTISSEMENT] Aucun arret effectue.'
    exit 5
}

Stop-Process -Id $state.Pid -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 200
if (Get-Process -Id $state.Pid -ErrorAction SilentlyContinue) {
    Write-Line "[AVERTISSEMENT] Le processus $($state.Pid) resiste a l arret."
    exit 6
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Line "[OK] Serveur local (PID $($state.Pid)) arrete."
exit 0
