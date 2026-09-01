<#
.SYNOPSIS
    CryptoKeep - demarrage controle du serveur statique local.

.DESCRIPTION
    Demarre scripts/secure_local_server.py comme processus enfant, enregistre
    son PID et son heure de demarrage dans un fichier d'execution, puis
    retourne le PID sur la sortie standard.

    Ce serveur sert le projet en HTTP en clair sur l'interface de bouclage.
    Il n'y a AUCUN chiffrement TLS. Ne pas presenter l'URL locale comme HTTPS.

    Ce script ne tue jamais un processus tiers. Si le port est deja occupe par
    un processus qui n'appartient pas a ce lanceur, il echoue et laisse
    l'utilisateur decider.

.NOTES
    Ajout du Lot 1 (cycle de vie). N'altere aucun fichier existant.
#>
[CmdletBinding()]
param(
    [string] $Python = 'python',
    [string] $ProjectRoot,
    [string] $Bind = '127.0.0.1',
    [int]    $Port = 8000,
    [string] $RuntimeDir,
    [string] $LogFile
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectRoot {
    param([string] $Provided)
    if ($Provided) { return (Resolve-Path -LiteralPath $Provided).Path }
    return (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
}

function Get-ListeningPids {
    param([string] $Address, [int] $TcpPort)

    $pids = @()
    $cmd = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($cmd) {
        try {
            $pids = @(
                Get-NetTCPConnection -State Listen -LocalPort $TcpPort -ErrorAction Stop |
                    Where-Object { $_.LocalAddress -eq $Address -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' } |
                    Select-Object -ExpandProperty OwningProcess
            )
            return ($pids | Sort-Object -Unique)
        } catch {
            $pids = @()
        }
    }

    # Repli netstat : correspondance exacte sur "adresse:port" en fin de champ.
    $pattern = '^\s*TCP\s+(\S+):' + $TcpPort + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
    foreach ($line in (netstat -ano)) {
        if ($line -match $pattern) {
            $local = $Matches[1]
            if ($local -eq $Address -or $local -eq '0.0.0.0' -or $local -eq '[::]') {
                $pids += [int] $Matches[2]
            }
        }
    }
    return ($pids | Sort-Object -Unique)
}

$root = Resolve-ProjectRoot -Provided $ProjectRoot
$serverScript = Join-Path $root 'scripts\secure_local_server.py'
if (-not (Test-Path -LiteralPath $serverScript)) {
    Write-Error "Script serveur introuvable : $serverScript"
    exit 1
}

if (-not $RuntimeDir) {
    $RuntimeDir = Join-Path $env:LOCALAPPDATA 'CryptoKeep\run'
}
if (-not (Test-Path -LiteralPath $RuntimeDir)) {
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
}

if (-not $LogFile) {
    $logDir = Join-Path $root 'logs'
    if (-not (Test-Path -LiteralPath $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    $LogFile = Join-Path $logDir ('vault_{0}.log' -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
}
$errFile = "$LogFile.err"

$pidFile = Join-Path $RuntimeDir 'server.json'

# 1. Une instance connue tourne-t-elle deja ?
if (Test-Path -LiteralPath $pidFile) {
    try {
        $known = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
        $proc = Get-Process -Id $known.Pid -ErrorAction SilentlyContinue
        if ($proc -and $proc.StartTime.ToString('o') -eq $known.StartTime) {
            Write-Host "[INFO] Serveur deja demarre par ce lanceur (PID $($known.Pid))."
            Write-Output $known.Pid
            exit 0
        }
    } catch {
        Write-Host '[INFO] Fichier d etat precedent illisible, il sera recree.'
    }
}

# 2. Le port est-il occupe par un tiers ?
$listening = Get-ListeningPids -Address $Bind -TcpPort $Port
if ($listening.Count -gt 0) {
    Write-Host "[ERREUR] Le port $Port est deja utilise (PID : $($listening -join ', '))."
    Write-Host '[ERREUR] Ce lanceur n arrete jamais un processus qui ne lui appartient pas.'
    Write-Host '[ERREUR] Fermez ce processus manuellement ou choisissez un autre port.'
    exit 2
}

# 3. Demarrage du processus enfant.
$arguments = @(
    ('"{0}"' -f $serverScript),
    '--port', $Port,
    '--bind', $Bind,
    '--directory', ('"{0}"' -f $root)
)

$proc = Start-Process -FilePath $Python `
                      -ArgumentList $arguments `
                      -WorkingDirectory $root `
                      -WindowStyle Hidden `
                      -PassThru `
                      -RedirectStandardOutput $LogFile `
                      -RedirectStandardError $errFile

Start-Sleep -Milliseconds 300
if ($proc.HasExited) {
    Write-Host "[ERREUR] Le serveur s est arrete immediatement. Voir $errFile"
    exit 3
}

$state = [ordered]@{
    Pid        = $proc.Id
    StartTime  = $proc.StartTime.ToString('o')
    Port       = $Port
    Bind       = $Bind
    Root       = $root
    Scheme     = 'http'
    LogFile    = $LogFile
    ErrorFile  = $errFile
}
$state | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

Write-Host "[OK] Serveur local demarre (PID $($proc.Id)) sur http://${Bind}:${Port}/ (HTTP en clair)."
Write-Output $proc.Id
exit 0
