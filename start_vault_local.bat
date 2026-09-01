@echo off
REM === CryptoKeep - LOCAL LAUNCHER ===
REM IMPORTANT : fichier 100%% ASCII (pas d'accents), fins de ligne CRLF.
REM Les caracteres multi-octets (UTF-8) desynchronisent le parseur cmd.exe
REM apres chaque goto, d'ou les erreurs type "'cho' n'est pas reconnu".
REM
REM === AVERTISSEMENT DE PERSISTANCE (Lot 1) ===
REM Ce lanceur historique est conserve. Il ouvrait auparavant le coffre
REM en navigation privee (--incognito), ce qui detruit IndexedDB et
REM localStorage a la fermeture du navigateur, donc le coffre lui-meme.
REM Le lancement utilise desormais le meme PROFIL PERSISTANT dedie que
REM start_vault_secure.bat, qui est le lanceur recommande.
REM Le serveur local sert le projet en HTTP EN CLAIR : il n y a pas de TLS.

setlocal enabledelayedexpansion
color 0A

REM Se placer dans le dossier du script (sinon un lancement "en admin"
REM demarre le serveur depuis C:\Windows\System32 et sert ce dossier).
cd /d "%~dp0"

REM ======== CONFIGURATION ========
set "PORT=8000"
set "PAGE=index.html"
set "BIND=127.0.0.1"
set "LOG_DIR=%~dp0logs"
set "APP_DIR=%LOCALAPPDATA%\CryptoKeep"
set "PROFILE_DIR=%APP_DIR%\browser-profile"
set "RUNTIME_DIR=%APP_DIR%\run"
set "CHROMIUM_FLAGS=--user-data-dir=%APP_DIR%\browser-profile --no-first-run --no-default-browser-check"

REM ======== ENVIRONNEMENT ========
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

REM === TIMESTAMP (PowerShell : WMIC est deprecie/absent de Windows 11 recent) ===
set "TIMESTAMP="
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TIMESTAMP=%%I"
if not defined TIMESTAMP set "TIMESTAMP=session"
set "LOG_FILE=%LOG_DIR%\vault_%TIMESTAMP%.log"

REM ======== DETECTION PYTHON ========
set "PYTHON="
for %%P in (python python3) do (
    %%P --version >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON=%%P"
        goto :pyok
    )
)
:pyok
if not defined PYTHON (
    echo [ERREUR] Python introuvable dans le PATH.
    pause
    exit /b 1
)

REM ======== MENU PRINCIPAL ========
:menu
cls
call :Banner
echo ================== MENU ==================
echo 1. Demarrer le serveur local
echo 2. Exporter les logs en HTML
echo 3. Quitter
echo ==========================================
set /p "choix=Votre choix [1-3] : "

if "!choix!"=="1" goto :start_server
if "!choix!"=="2" goto :export_logs
if "!choix!"=="3" goto :quitter

goto :menu

REM ======== NETTOYAGE SECURISE ========
:quitter
cls
echo Arret du serveur local...
REM === Lot 1 : arret cible uniquement ===
REM L ancienne version tuait TOUT processus python en ecoute sur le port,
REM y compris un serveur sans rapport avec ce projet. Ce comportement est
REM supprime. Seul le processus enregistre par le lanceur est arrete.
if exist "%~dp0scripts\stop_secure_server.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop_secure_server.ps1" -RuntimeDir "%RUNTIME_DIR%"
) else (
    echo [INFO] Script d arret cible introuvable.
)
echo [INFO] Aucun processus tiers n a ete arrete.
echo [INFO] Si un serveur lance par ce menu tourne encore, fermez sa fenetre.
echo Session terminee.
timeout /t 1 >nul
exit

REM ======== DEMARRAGE SERVEUR ========
:start_server
cls
call :Banner

REM ======== VERIF PORT DISPONIBLE ========
REM === Lot 1 : detection exacte du port ===
REM L ancienne detection "findstr :%PORT%" declenchait aussi sur 18000,
REM 80001 ou une adresse distante. Correspondance exacte adresse:port.
powershell -NoProfile -Command "$p=%PORT%; $b='%BIND%'; $u=$false; try { $u = @(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction Stop | Where-Object { $_.LocalAddress -eq $b -or $_.LocalAddress -eq '0.0.0.0' -or $_.LocalAddress -eq '::' }).Count -gt 0 } catch { $u = @(netstat -ano | Select-String -Pattern ('^\s*TCP\s+\S+:' + $p + '\s+\S+\s+LISTENING\s+\d+\s*$')).Count -gt 0 }; if ($u) { exit 1 } else { exit 0 }"
if errorlevel 1 (
    echo.
    echo [ERREUR] Le port %PORT% est deja utilise.
    echo          Verifiez si une autre instance tourne ou changez le PORT.
    echo.
    pause
    goto :menu
)

echo.
echo === Demarrage du serveur local ===
echo.
echo -^> Port : %PORT%
echo -^> Log  : %LOG_FILE%
echo.
pause

REM ======== VERIF FICHIERS ========
if not exist "%PAGE%" (
    echo [ERREUR] Fichier "%PAGE%" introuvable.
    pause
    goto :menu
)
if not exist "scripts\secure_local_server.py" (
    echo [ERREUR] scripts\secure_local_server.py introuvable.
    pause
    goto :menu
)

REM ======== LANCEMENT SERVEUR ========
title Vault Personal - Serveur Local
start /b "" "%PYTHON%" scripts\secure_local_server.py --port %PORT% --bind %BIND% --directory . >>"%LOG_FILE%" 2>&1

REM ======== HEALTHCHECK ========
set /a try=0
echo.
echo En attente du demarrage du serveur...
:wait_server
set /a try+=1
timeout /t 1 >nul
powershell -NoProfile -Command "$r=$null; try { $r = Invoke-WebRequest -Uri 'http://%BIND%:%PORT%' -UseBasicParsing -TimeoutSec 1 } catch {}; if ($r -ne $null) { exit 0 } else { exit 1 }"
if !errorlevel! equ 0 goto :server_ok

if !try! geq 20 (
    echo.
    echo [ERREUR] Timeout demarrage. Verifiez : %LOG_FILE%
    pause
    goto :menu
)
<nul set /p ".=."
goto :wait_server

:server_ok
echo.
echo [OK] Serveur operationnel.

REM ======== LANCEMENT NAVIGATEUR (FALLBACK COMPLET) ========
set "URL=http://%BIND%:%PORT%/%PAGE%"
echo Lancement du navigateur...

REM 1. Edge (Chromium)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="%URL%" %CHROMIUM_FLAGS%
    goto :browser_launched
)

REM 2. Chrome (installation utilisateur - tres courant)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%URL%" %CHROMIUM_FLAGS%
    goto :browser_launched
)

REM 3. Chrome (installation systeme x86)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%" %CHROMIUM_FLAGS%
    goto :browser_launched
)

REM 4. Fallback navigateur par defaut
start "" "%URL%"

:browser_launched
pause
goto :menu

REM ======== EXPORT LOGS HTML ========
:export_logs
cls
call :Banner

if not exist "%~dp0export_log.py" (
    echo [ERREUR] export_log.py introuvable.
    pause
    goto :menu
)

"%PYTHON%" "%~dp0export_log.py"
if errorlevel 1 (
    echo [ERREUR] Echec de l'export.
    pause
    goto :menu
)

if exist "%~dp0export-log.html" start "" "%~dp0export-log.html"
pause
goto :menu

REM ======== BANNIERE ========
:Banner
echo ======================================================
echo            VAULT PERSONAL - LOCAL LAUNCH
echo ======================================================
echo        Encrypted password vault (100%% LOCAL)
echo      Static HTML front-end + Python local server
echo        Launching: http://%BIND%:%PORT%/%PAGE%
echo ======================================================
goto :eof
