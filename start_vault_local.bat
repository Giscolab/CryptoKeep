@echo off
REM === VAULT PERSONAL - LOCAL LAUNCHER ===
REM Fichier à sauvegarder en UTF-8 avec BOM

chcp 65001 >nul
setlocal enabledelayedexpansion
color 0A

REM ======== CONFIGURATION ========
set "PORT=8000"
set "PAGE=index.html"
set "BIND=127.0.0.1"
set "LOG_DIR=%~dp0logs"

REM ======== ENVIRONNEMENT ========
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM === TIMESTAMP ROBUSTE (Corrige les espaces parasites WMIC) ===
for /f "tokens=2 delims==." %%I in ('wmic os get localdatetime /value ^| find "="') do set "DATETIME=%%I"
set "TIMESTAMP=%DATETIME:~0,8%_%DATETIME:~8,6%"
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
echo 1. Démarrer le serveur local
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
echo Arrêt du serveur local...
REM Vérifie que le processus sur le PORT est bien Python avant de tuer
for /f "tokens=2,5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    REM %%b contient le PID
    for /f "tokens=1" %%p in ('tasklist /FI "PID eq %%b" /NH ^| findstr /i "python"') do (
        taskkill /F /PID %%b >nul 2>&1
        echo [OK] Processus Python (PID %%b) arrêté.
    )
)
echo Session terminée.
timeout /t 1 >nul
exit

REM ======== DEMARRAGE SERVEUR ========
:start_server
cls
call :Banner

REM ======== VERIF PORT DISPONIBLE ========
netstat -an | findstr ":%PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo [ERREUR] Le port %PORT% est déjà utilisé.
    echo         Vérifiez si une autre instance tourne ou changez le PORT.
    echo.
    pause
    goto :menu
)

echo.
echo === Démarrage du serveur local ===
echo.
echo -^> Port : %PORT%
echo -^> Log : %LOG_FILE%
echo.
pause

REM ======== VERIF FICHIERS ========
if not exist "!PAGE!" (
    echo [ERREUR] Fichier "!PAGE!" introuvable.
    pause
    goto :menu
)

REM ======== LANCEMENT SERVEUR ========
title Vault Personal – Serveur Local
start /b "" "!PYTHON!" -m http.server !PORT! --bind !BIND! >>"%LOG_FILE%" 2>&1

REM ======== HEALTHCHECK ========
set /a try=0
echo.
echo En attente du démarrage du serveur...
:wait_server
set /a try+=1
timeout /t 1 >nul
powershell -Command "$r=$null; try { $r = Invoke-WebRequest -Uri 'http://!BIND!:!PORT!' -UseBasicParsing -TimeoutSec 1 -EA SilentlyContinue } catch {}; if ($r -ne $null) { exit 0 } else { exit 1 }"
if !errorlevel! equ 0 goto :server_ok

if !try! geq 20 (
    echo.
    echo [ERREUR] Timeout démarrage. Vérifiez : %LOG_FILE%
    pause
    goto :menu
)
<nul set /p ".=."
goto :wait_server

:server_ok
echo.
echo [OK] Serveur opérationnel.

REM ======== LANCEMENT NAVIGATEUR (FALLBACK COMPLET) ========
set "URL=http://%BIND%:%PORT%/%PAGE%"
echo Lancement du navigateur...

REM 1. Edge (Chromium)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "msedge.exe" --app="%URL%" --disable-cache --incognito
    goto :browser_launched
)

REM 2. Chrome (User Install - Très courant)
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="%URL%" --disable-cache --incognito
    goto :browser_launched
)

REM 3. Chrome (System Install x86)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="%URL%" --disable-cache --incognito
    goto :browser_launched
)

REM 4. Fallback défaut
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

REM ======== BANNIÈRE ========
:Banner
echo ╔════════════════════════════════════════════════════╗
echo              VAULT PERSONAL – LOCAL LAUNCH
echo ╠════════════════════════════════════════════════════╣
echo        Encrypted password vault (100%% LOCAL)
echo      Static HTML front-end + Python local server
echo        Launching: http://!BIND!:!PORT!/!PAGE!
echo ╚════════════════════════════════════════════════════╝
goto :eof