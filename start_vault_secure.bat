@echo off
REM === CryptoKeep - LANCEUR LOCAL PERSISTANT (Lot 1) ===
REM IMPORTANT : fichier 100%% ASCII (pas d'accents), fins de ligne CRLF.
REM Les caracteres multi-octets (UTF-8) desynchronisent le parseur cmd.exe.
REM
REM Ce lanceur remplace le mode navigation privee par un PROFIL NAVIGATEUR
REM PERSISTANT dedie au projet. Le coffre s'appuie sur IndexedDB et
REM localStorage : en navigation privee, ces donnees sont detruites a la
REM fermeture du navigateur, ce qui equivaut a perdre le coffre.
REM
REM Le serveur local sert le projet en HTTP EN CLAIR sur 127.0.0.1.
REM Il n'y a AUCUN chiffrement TLS. Ne pas presenter l'URL comme HTTPS.
REM
REM Le lanceur historique start_vault_local.bat est conserve.

setlocal enabledelayedexpansion
color 0A

cd /d "%~dp0"

REM ======== CONFIGURATION ========
set "PORT=8000"
set "PAGE=index.html"
set "BIND=127.0.0.1"
set "LOG_DIR=%~dp0logs"
set "APP_DIR=%LOCALAPPDATA%\CryptoKeep"
set "PROFILE_DIR=%APP_DIR%\browser-profile"
set "RUNTIME_DIR=%APP_DIR%\run"
set "PS=powershell -NoProfile -ExecutionPolicy Bypass"

REM Variables de chemin isolees : "%%ProgramFiles(x86)%%" contient une
REM parenthese fermante qui casse les blocs "if ( ... )" de cmd.exe.
set "PF=%ProgramFiles%"
set "PF86=%ProgramFiles(x86)%"
set "LAD=%LocalAppData%"

REM ======== ENVIRONNEMENT ========
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

set "TIMESTAMP="
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TIMESTAMP=%%I"
if not defined TIMESTAMP set "TIMESTAMP=session"
set "LOG_FILE=%LOG_DIR%\vault_%TIMESTAMP%.log"

REM ======== DETECTION PYTHON ========
set "PYTHON="
for %%P in (python python3 py) do (
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
echo 1. Demarrer le serveur local + navigateur persistant
echo 2. Arreter le serveur local de ce lanceur
echo 3. Exporter les logs en HTML
echo 4. Afficher l emplacement du profil navigateur
echo 5. Quitter (arrete le serveur de ce lanceur)
echo ==========================================
set /p "choix=Votre choix [1-5] : "

if "!choix!"=="1" goto :start_server
if "!choix!"=="2" goto :stop_server
if "!choix!"=="3" goto :export_logs
if "!choix!"=="4" goto :show_profile
if "!choix!"=="5" goto :quitter

goto :menu

REM ======== ARRET CIBLE ========
:stop_server
cls
call :Banner
%PS% -File "%~dp0scripts\stop_secure_server.ps1" -RuntimeDir "%RUNTIME_DIR%"
echo.
pause
goto :menu

:quitter
cls
echo Arret du serveur local appartenant a ce lanceur...
%PS% -File "%~dp0scripts\stop_secure_server.ps1" -RuntimeDir "%RUNTIME_DIR%"
echo Session terminee.
timeout /t 2 >nul
exit /b 0

REM ======== EMPLACEMENT DU PROFIL ========
:show_profile
cls
call :Banner
echo Profil navigateur persistant utilise par CryptoKeep :
echo   %PROFILE_DIR%
echo.
echo Ce profil est distinct de votre profil navigateur personnel.
echo Il contient IndexedDB et localStorage du coffre : ne le supprimez pas
echo sans avoir exporte votre coffre au prealable.
echo.
echo Fichier d etat du serveur :
echo   %RUNTIME_DIR%\server.json
echo.
pause
goto :menu

REM ======== DEMARRAGE SERVEUR ========
:start_server
cls
call :Banner

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
if not exist "scripts\start_secure_server.ps1" (
    echo [ERREUR] scripts\start_secure_server.ps1 introuvable.
    pause
    goto :menu
)

echo.
echo === Demarrage du serveur local ===
echo -^> Adresse : http://%BIND%:%PORT%/%PAGE%  (HTTP en clair, pas de TLS)
echo -^> Log     : %LOG_FILE%
echo -^> Profil  : %PROFILE_DIR%
echo.

set "SERVER_PID="
for /f "usebackq delims=" %%I in (`%PS% -File "%~dp0scripts\start_secure_server.ps1" -Python "%PYTHON%" -ProjectRoot "%~dp0." -Bind "%BIND%" -Port %PORT% -RuntimeDir "%RUNTIME_DIR%" -LogFile "%LOG_FILE%"`) do (
    echo %%I
    set "LAST_LINE=%%I"
)

REM La derniere ligne emise par le script PowerShell est le PID.
set "SERVER_PID=!LAST_LINE!"
echo !SERVER_PID!| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
    echo.
    echo [ERREUR] Le serveur n a pas demarre. Consultez : %LOG_FILE%.err
    echo          Aucun processus tiers n a ete arrete.
    pause
    goto :menu
)

echo.
echo [OK] Serveur local demarre. PID enfant : !SERVER_PID!

REM ======== HEALTHCHECK ========
set /a try=0
echo En attente de la reponse HTTP...
:wait_server
set /a try+=1
timeout /t 1 >nul
powershell -NoProfile -Command "$r=$null; try { $r = Invoke-WebRequest -Uri 'http://%BIND%:%PORT%/' -UseBasicParsing -TimeoutSec 1 } catch {}; if ($r -ne $null) { exit 0 } else { exit 1 }"
if !errorlevel! equ 0 goto :server_ok

if !try! geq 20 (
    echo.
    echo [ERREUR] Timeout demarrage. Verifiez : %LOG_FILE%.err
    pause
    goto :menu
)
<nul set /p ".=."
goto :wait_server

:server_ok
echo.
echo [OK] Serveur operationnel.

REM ======== LANCEMENT NAVIGATEUR - PROFIL PERSISTANT ========
REM Aucun --incognito / --inprivate : le coffre a besoin d IndexedDB
REM et de localStorage persistants.
set "URL=http://%BIND%:%PORT%/%PAGE%"
set "CHROMIUM_FLAGS=--user-data-dir=%PROFILE_DIR% --no-first-run --no-default-browser-check --disable-background-networking"

echo Lancement du navigateur avec profil persistant...

set "BROWSER="
if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF86%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%PF%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LAD%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LAD%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF%\Google\Chrome\Application\chrome.exe"

if defined BROWSER (
    start "" "!BROWSER!" --app="%URL%" !CHROMIUM_FLAGS!
    echo [OK] Navigateur Chromium lance sur un profil dedie et persistant.
) else (
    echo [AVERTISSEMENT] Ni Edge ni Chrome n ont ete trouves.
    echo [AVERTISSEMENT] Ouverture avec le navigateur par defaut.
    echo [AVERTISSEMENT] N utilisez PAS une fenetre privee : le coffre serait
    echo [AVERTISSEMENT] efface a la fermeture du navigateur.
    start "" "%URL%"
)

echo.
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
    echo [ERREUR] Echec de l export.
    pause
    goto :menu
)

if exist "%~dp0export-log.html" start "" "%~dp0export-log.html"
pause
goto :menu

REM ======== BANNIERE ========
:Banner
echo ======================================================
echo         CRYPTOKEEP - LANCEUR LOCAL PERSISTANT
echo ======================================================
echo    Coffre de mots de passe chiffre (100%% LOCAL)
echo    Front statique + serveur local Python (HTTP clair)
echo    Profil navigateur dedie et PERSISTANT (pas d incognito)
echo    URL : http://%BIND%:%PORT%/%PAGE%
echo ======================================================
goto :eof
