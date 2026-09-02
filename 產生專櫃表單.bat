@echo off
setlocal enabledelayedexpansion
rem ===================================================================
rem  Kinloch Anderson - counter feedback form (one page, tick the photos)
rem
rem  Double-click this file. It builds a one-page form for the shop
rem  floor: photos of the latest season, tap Star / OK / Slow on each,
rem  then export a CSV and send it back.
rem    1. downloads the latest code from GitHub (no git needed)
rem    2. creates / reuses the Python environment
rem    3. builds the form and opens the folder
rem
rem  Send the .html file to the counter by LINE or email. It opens on a
rem  phone, works with no signal, and keeps half-finished answers.
rem
rem  Your data folder and your config\settings.yaml are never touched.
rem
rem  KEEP THIS FILE PURE ASCII. cmd.exe mis-parses batch files that
rem  mix code pages with multi-byte characters - it drops bytes and
rem  starts executing fragments of later lines.
rem ===================================================================
cd /d "%~dp0"
title Kinloch Anderson - counter feedback form

set "REPO=benjamin104-create/Chainway-data-mining"
set "BRANCH=claude/fashion-sales-design-platform-vabg76"
set "ZIPURL=https://codeload.github.com/%REPO%/zip/refs/heads/%BRANCH%"

echo.
echo  ==================================================================
echo   Step 1 of 3  -  downloading the latest code
echo  ==================================================================

set "TMPX=%TEMP%\ka_update"
if exist "%TMPX%" rd /s /q "%TMPX%"
mkdir "%TMPX%" 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
  "Invoke-WebRequest -Uri '%ZIPURL%' -OutFile '%TMPX%\src.zip' -UseBasicParsing;" ^
  "Expand-Archive -Path '%TMPX%\src.zip' -DestinationPath '%TMPX%' -Force"
if errorlevel 1 goto nodownload
if not exist "%TMPX%\src.zip" goto nodownload

set "SRC="
for /d %%D in ("%TMPX%\Chainway-data-mining-*") do set "SRC=%%D"
if not defined SRC goto nodownload

rem Copy over the top. /XD keeps your virtual environment, your settings
rem and your generated data - only the program code is replaced.
robocopy "%SRC%" "%CD%" /E /NFL /NDL /NJH /NJS /NP ^
  /XD ".venv" "data" "config" ".git" "__pycache__" >nul
if errorlevel 8 goto nodownload
echo   Code updated.

rem settings.yaml is only copied if you do not have one yet, so your
rem folder paths are never overwritten.
if not exist "config\settings.yaml" (
  mkdir config 2>nul
  copy /y "%SRC%\config\*.yaml" "config\" >nul
  echo   config\settings.yaml created from the template.
)
rd /s /q "%TMPX%" 2>nul

echo.
echo  ==================================================================
echo   Step 2 of 3  -  Python environment
echo  ==================================================================

set "VPY=.venv\Scripts\python.exe"
if exist "%VPY%" goto haveenv

rem No environment yet. Find a real Python 3.10+ - "where python" is not
rem enough, Windows ships a Store stub that just opens the Store.
set "PY="
py -3 -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto makeenv
python -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=python"
:makeenv
if not defined PY goto nopython
echo   Creating the environment (first time only)...
%PY% -m venv .venv
if not exist "%VPY%" goto fail
echo   Installing packages - this takes 3 to 5 minutes, please wait...
"%VPY%" -m pip install --upgrade pip -q
"%VPY%" -m pip install pandas numpy pyyaml openpyxl xlrd pyarrow Pillow -q
if errorlevel 1 goto fail
goto rebuild

:haveenv
echo   Environment found. Checking packages...
"%VPY%" -c "import pandas, PIL" >nul 2>nul
if not errorlevel 1 goto ready
echo   Some packages are missing, installing...
"%VPY%" -m pip install pandas numpy pyyaml openpyxl xlrd pyarrow Pillow -q
if errorlevel 1 goto fail
goto rebuild

:ready
echo   Packages already installed.

:rebuild
echo.
echo  ==================================================================
echo   Step 3 of 3  -  building the form
echo  ==================================================================
rem The master table has to exist first. This is quick if the data was
rem already ingested by the inventory batch file.
"%VPY%" -m chainway.cli build
if errorlevel 1 goto fail

rem --latest picks the most recent season on its own. Season names are
rem Chinese and this file has to stay pure ASCII, so it cannot be typed
rem in here - that is what --latest is for.
rem --limit 30 keeps it to one walk round the floor; a form nobody
rem finishes is the same as no form at all.
"%VPY%" -m chainway.cli counter-form --latest --limit 30
if errorlevel 1 goto fail

set "OUT=%CD%\data\outputs"
echo.
echo   Done. Opening the folder...
start "" "%OUT%"
echo.
echo   Send the .html file to the counter staff. On their phone they tap
echo   Star / OK / Slow on each photo, pick how sure they are, then press
echo   "Export CSV" and send the file back.
echo.
echo   When the CSV files come back, paste the rows into
echo     data\feedback\sales_feedback.csv
echo   then run the calibration batch file in this folder to see whose
echo   judgement turned out right.
echo.
pause
exit /b 0

:nodownload
echo.
echo   [X] Could not download the code from GitHub.
echo.
echo       Check your internet connection and try again. If your office
echo       network blocks GitHub, download the ZIP manually from:
echo         https://github.com/%REPO%
echo       (green "Code" button, "Download ZIP"), unzip it, and copy the
echo       "chainway" folder over the one here.
echo.
pause
exit /b 1

:nopython
echo.
echo   [X] No usable Python 3.10 or newer was found.
echo.
echo       Install it from https://www.python.org/downloads/
echo       On the FIRST install screen, tick "Add Python to PATH".
echo.
echo       If Python is installed but typing "python" opens the Microsoft
echo       Store, turn off the Store aliases:
echo         Settings ^> Apps ^> Advanced app settings
echo         ^> App execution aliases
echo         ^> switch OFF both "python.exe" and "python3.exe"
echo.
pause
exit /b 1

:fail
echo.
echo   [X] Something went wrong. The message above the line says what.
echo       Copy the whole window and send it over.
echo.
pause
exit /b 1
