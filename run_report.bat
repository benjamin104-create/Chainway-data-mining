@echo off
chcp 65001 >nul
setlocal
rem ===================================================================
rem  Kinloch Anderson - Season sell-through report
rem  Double-click to run. First run takes 3-5 min (installing packages),
rem  after that about 30 seconds.
rem
rem  Data folder is set in config\settings.yaml -> paths.root
rem  Currently: C:/Users/USER/Desktop/商品設計Raw Data
rem ===================================================================
cd /d "%~dp0"
set "PY="

rem -- Find a working Python. "where python" is not enough: Windows ships
rem    a Store stub named python.exe that just opens the Store and exits 9009.
for %%P in (py.exe python.exe) do (
    if not defined PY (
        %%P -c "import sys;raise SystemExit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
        if not errorlevel 1 set "PY=%%P"
    )
)

if not defined PY (
    echo.
    echo  [X] No usable Python 3.10+ found.
    echo.
    echo      Install from https://www.python.org/downloads/
    echo      IMPORTANT: tick "Add Python to PATH" on the first screen.
    echo.
    echo      If you already installed it, the "python" command may be
    echo      pointing at the Microsoft Store stub. Turn it off at:
    echo      Settings ^> Apps ^> Advanced ^> App execution aliases
    echo      -^> switch OFF both "python.exe" and "python3.exe"
    echo.
    pause
    exit /b 1
)

set "VPY=.venv\Scripts\python.exe"

if not exist "%VPY%" (
    echo.
    echo  [1/3] First run - creating an isolated Python environment...
    %PY% -m venv .venv
    if errorlevel 1 goto :fail
    echo  [2/3] Installing packages, please wait 3-5 minutes...
    "%VPY%" -m pip install --upgrade pip -q
    "%VPY%" -m pip install pandas numpy pyyaml openpyxl xlrd pyarrow Pillow -q
    if errorlevel 1 goto :fail
) else (
    echo  [1/3] Environment ready
    echo  [2/3] Packages already installed
)

echo.
echo  [3/3] Checking folders and building the report...
echo  ==================================================================
"%VPY%" -m chainway.cli doctor
echo  ==================================================================
echo.
"%VPY%" scripts\season_report.py --images
if errorlevel 1 goto :fail

echo.
echo  Done. Opening the report...
start "" "data\outputs\reports\季別完銷診斷.html"
echo  Report folder: %CD%\data\outputs\reports
pause
exit /b 0

:fail
echo.
echo  [X] Something failed above.
echo      Copy the whole window (right-click ^> Select All ^> Enter)
echo      and paste it back to Claude - that is enough to diagnose it.
echo.
pause
exit /b 1
