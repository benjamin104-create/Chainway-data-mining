@echo off
setlocal
rem ===================================================================
rem  Kinloch Anderson - season sell-through report
rem
rem  Double-click to run. First run takes 3-5 minutes (installing
rem  packages); after that about 30 seconds.
rem
rem  The data folder is set in config\settings.yaml under paths.root
rem
rem  IMPORTANT: keep this file pure ASCII. cmd.exe mis-parses batch
rem  files that mix "chcp 65001" with multi-byte characters - it loses
rem  bytes and starts executing fragments of later lines.
rem ===================================================================
cd /d "%~dp0"

rem -- Find Python 3.10+. "where python" is not enough: Windows ships a
rem    Store stub called python.exe that just opens the Store.
set "PY="
py -3 -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto havepy
python -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=python"
:havepy
if not defined PY goto nopython

set "VPY=.venv\Scripts\python.exe"
if exist "%VPY%" goto ready

echo.
echo  [1/3] First run - creating an isolated Python environment...
%PY% -m venv .venv
if errorlevel 1 goto fail
if not exist "%VPY%" goto fail
echo  [2/3] Installing packages, please wait 3-5 minutes...
"%VPY%" -m pip install --upgrade pip -q
"%VPY%" -m pip install pandas numpy pyyaml openpyxl xlrd pyarrow Pillow -q
if errorlevel 1 goto fail
goto build

:ready
echo.
echo  [1/3] Environment ready
echo  [2/3] Packages already installed

:build
echo.
echo  [3/3] Checking folders and building the report...
echo  ==================================================================
"%VPY%" -m chainway.cli doctor
echo  ==================================================================
echo.
"%VPY%" scripts\season_report.py --images
if errorlevel 1 goto fail

echo.
echo  Done. Opening the report...
start "" "%CD%\data\outputs\reports\season_report.html"
echo  Report folder: %CD%\data\outputs\reports
echo.
pause
exit /b 0

:nopython
echo.
echo  [X] No usable Python 3.10 or newer was found.
echo.
echo      Install it from https://www.python.org/downloads/
echo      On the FIRST install screen, tick "Add Python to PATH".
echo.
echo      If Python is already installed but typing "python" opens the
echo      Microsoft Store, turn off the Store aliases:
echo        Settings ^> Apps ^> Advanced app settings
echo        ^> App execution aliases
echo        ^> switch OFF both "python.exe" and "python3.exe"
echo.
pause
exit /b 1

:fail
echo.
echo  [X] Something above failed.
echo      Right-click the window title ^> Edit ^> Select All ^> Enter
echo      to copy everything, then paste it back to Claude.
echo.
pause
exit /b 1
