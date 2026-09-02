@echo off
setlocal enabledelayedexpansion
rem ===================================================================
rem  Kinloch Anderson - product list with photos (inventory report)
rem
rem  Double-click this file. It does everything:
rem    1. downloads the latest code from GitHub (no git needed)
rem    2. creates / reuses the Python environment
rem    3. rebuilds the data tables from your POS files
rem    4. builds the illustrated list and opens it
rem
rem  Your data folder and your config\settings.yaml are never touched.
rem
rem  KEEP THIS FILE PURE ASCII. cmd.exe mis-parses batch files that
rem  mix code pages with multi-byte characters - it drops bytes and
rem  starts executing fragments of later lines.
rem ===================================================================
cd /d "%~dp0"
title Kinloch Anderson - inventory report

set "REPO=benjamin104-create/Chainway-data-mining"
set "BRANCH=claude/fashion-sales-design-platform-vabg76"
set "ZIPURL=https://codeload.github.com/%REPO%/zip/refs/heads/%BRANCH%"

echo.
echo  ==================================================================
echo   Step 1 of 4  -  downloading the latest code
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
echo   Step 2 of 4  -  Python environment
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
echo   Step 3 of 4  -  rebuilding the data tables
echo  ==================================================================
"%VPY%" -m chainway.cli ingest
if errorlevel 1 goto fail
"%VPY%" -m chainway.cli build
if errorlevel 1 goto fail

echo.
echo  ==================================================================
echo   Step 4 of 4  -  building the illustrated list
echo  ==================================================================
rem Find out where the colour code lives (filenames / tech-pack text).
"%VPY%" -m chainway.cli color --scan-codes
rem Re-classify the extracted tech-pack images by content, not by file size.
"%VPY%" -m chainway.cli reclassify-images
rem One file per series with big thumbnails, plus a combined file.
"%VPY%" -m chainway.cli inventory --split --thumb 500
if errorlevel 1 goto fail
"%VPY%" -m chainway.cli inventory
if errorlevel 1 goto fail

set "OUT=%CD%\data\outputs\inventory"
echo.
echo   Done. Opening the report...
start "" "%OUT%"
for %%F in ("%OUT%\*.html") do start "" "%%F"
echo.
echo   The file is in: %OUT%
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
