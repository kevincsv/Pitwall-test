@echo off
setlocal EnableDelayedExpansion
rem Pitlane HQ on this PC only, without internet (the owner's development set-up):
rem  - the Pitlane HQ server (cloud\, the same code as pitlanehq.app) runs here with wrangler (accounts, laps,
rem    community, the model, live telemetry; the database and files stay in cloud\.wrangler), LOCAL=1: every
rem    account is an admin and sign-up needs no email;
rem  - the app starts in local mode (PitlaneHQ.exe -local): it uses that server, its own data folder
rem    (%%APPDATA%%\PitlaneHQ-local, a copy of the normal one the first time, without the sign-ins) and its own
rem    port, so the normal Pitlane HQ is left alone; no updates, and nothing leaves the PC: every connection to
rem    anything but this PC is refused (pitlanehq.app never hears of it). The server listens on 127.0.0.1 only.
rem Needs Node.js (https://nodejs.org); the first run needs internet once (npm install). Then it all works offline.
rem   tools\local.cmd                  the installed app (%%LOCALAPPDATA%%\Programs\Pitlane HQ)
rem   tools\local.cmd C:\path\to\PitlaneHQ.exe   another build (PitlaneHQ.exe or PitlaneHQ.Desktop.exe)
set "ROOT=%~dp0.."
set "PORT=8787"

where node >nul 2>&1 || (echo Node.js is needed: https://nodejs.org & exit /b 1)
cd /d "%ROOT%\cloud" || exit /b 1
if not exist node_modules (
  echo Installing the server's tools (once, needs internet)...
  call npm install || exit /b 1
)
if not exist .dev.vars (
  for /f %%k in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set "KEY=%%k"
  > .dev.vars echo DATA_KEY=!KEY!
)
echo Preparing the local database...
call npx wrangler d1 migrations apply DB --local || exit /b 1

set "WRANGLER_SEND_METRICS=false"
curl -s -o nul http://127.0.0.1:%PORT%/server.json 2>nul
if errorlevel 1 (
  start "Pitlane HQ server (local)" cmd /k npx wrangler dev --local --ip 127.0.0.1 --port %PORT% --var LOCAL:1 --test-scheduled
  echo Waiting for the server...
  :wait
  timeout /t 1 >nul
  curl -s -o nul http://127.0.0.1:%PORT%/server.json 2>nul || goto wait
)
echo The server is at http://127.0.0.1:%PORT% (the web app too, in a browser).

rem the data of local mode: the normal one copied the first time (settings, races), never the sign-ins or the queue
if not exist "%APPDATA%\PitlaneHQ-local" if exist "%APPDATA%\PitlaneHQ" (
  robocopy "%APPDATA%\PitlaneHQ" "%APPDATA%\PitlaneHQ-local" /E /XF account.json sync-base.json cloud-outbox.json community.json paired.json update.json /NFL /NDL /NJH /NJS >nul
)

set "APP=%~1"
if "%APP%"=="" set "APP=%LOCALAPPDATA%\Programs\Pitlane HQ\PitlaneHQ.exe"
if not exist "%APP%" (echo Pitlane HQ is not installed: %APP% & exit /b 1)
set "PITLANEHQ_SERVER=http://127.0.0.1:%PORT%"
set "PITLANEHQ_DATA=PitlaneHQ-local"
set "PITLANEHQ_PORT=8585"
start "" "%APP%" -local
endlocal
