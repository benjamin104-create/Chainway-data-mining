@echo off
setlocal enabledelayedexpansion
rem ===================================================================
rem  Kinloch Anderson - one file, one menu. Everything lives here.
rem
rem  Double-click this file. It updates itself, then shows a menu.
rem  Nothing else in this folder needs to be run - the other .bat files
rem  are obsolete and can be deleted.
rem
rem  Your data folder and your config\settings.yaml are never touched.
rem
rem  KEEP THIS FILE PURE ASCII. cmd.exe mis-parses batch files that
rem  mix code pages with multi-byte characters - it drops bytes and
rem  starts executing fragments of later lines.
rem ===================================================================
cd /d "%~dp0"
title Kinloch Anderson

set "REPO=benjamin104-create/Chainway-data-mining"
set "BRANCH=claude/fashion-sales-design-platform-vabg76"
set "ZIPURL=https://codeload.github.com/%REPO%/zip/refs/heads/%BRANCH%"

echo.
echo  ==================================================================
echo   Updating the program
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
echo   Python environment
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
goto menu

:haveenv
echo   Environment found. Checking packages...
"%VPY%" -c "import pandas, PIL" >nul 2>nul
if not errorlevel 1 goto ready
echo   Some packages are missing, installing...
"%VPY%" -m pip install pandas numpy pyyaml openpyxl xlrd pyarrow Pillow -q
if errorlevel 1 goto fail
goto menu

:ready
echo   Packages already installed.

rem Remove the older one-click files this menu replaces. Batch files must
rem stay pure ASCII, so they cannot name the Chinese filenames themselves -
rem Python does the deleting. The list is hard-coded, never a wildcard.
"%VPY%" -m chainway.cli tidy

:menu
cls
echo.
echo  ==================================================================
echo    Kinloch Anderson   -   what do you want to do?
echo  ==================================================================
echo.
echo    1   Rebuild everything and open the product list
echo        (POS + tech packs, photos, colours, motif positions.
echo         Slow. Run it when the source data changed.)
echo.
echo    2   Counter feedback form    (this week's new arrivals)
echo    3   Counter calibration      (was their call right?)
echo.
echo    4   Image audit              (why some styles have no photo)
echo    5   Range plan               (how many styles per category)
echo    6   Season report            (sell-through by season)
echo    7   Duplicate styles         (is this one already done before?)
echo.
echo    8   Open the overview page (what exists, how fresh, what is stuck)
echo.
echo    0   Quit
echo.
set "C="
set /p C=  Type a number and press Enter:  
if "%C%"=="1" goto j1
if "%C%"=="2" goto j2
if "%C%"=="3" goto j3
if "%C%"=="4" goto j4
if "%C%"=="5" goto j5
if "%C%"=="6" goto j6
if "%C%"=="7" goto j7
if "%C%"=="8" goto j8
if "%C%"=="0" goto bye
goto menu

:j1
echo.
"%VPY%" -m chainway.cli ingest --extract-images
if errorlevel 1 goto oops
"%VPY%" -m chainway.cli build
if errorlevel 1 goto oops
"%VPY%" -m chainway.cli color --scan-codes
"%VPY%" -m chainway.cli locate
"%VPY%" -m chainway.cli color --validate
"%VPY%" -m chainway.cli reclassify-images
"%VPY%" -m chainway.cli inventory --split --thumb 500
"%VPY%" -m chainway.cli inventory
start "" "%CD%\data\outputs\inventory"
goto done

:j2
echo.
"%VPY%" -m chainway.cli build
if errorlevel 1 goto oops
"%VPY%" -m chainway.cli counter-form --new-weeks 2 --limit 30
if errorlevel 1 goto oops
start "" "%CD%\data\outputs"
goto done

:j3
echo.
"%VPY%" -m chainway.cli build
if errorlevel 1 goto oops
"%VPY%" -m chainway.cli calibration
goto done

:j4
echo.
"%VPY%" -m chainway.cli build
if errorlevel 1 goto oops
"%VPY%" -m chainway.cli image-audit
if errorlevel 1 goto oops
start "" "%CD%\data\outputs"
goto done

:j5
echo.
"%VPY%" -m chainway.cli rangeplan
if errorlevel 1 goto oops
start "" "%CD%\data\outputs"
goto done

:j6
echo.
"%VPY%" -m chainway.cli season-report
if errorlevel 1 goto oops
start "" "%CD%\data\outputs"
goto done

:j7
echo.
"%VPY%" -m chainway.cli duplicates
if errorlevel 1 goto oops
start "" "%CD%\data\outputs"
goto done

:j8
echo.
"%VPY%" -m chainway.cli overview
rem The overview filename is Chinese and this file must stay pure ASCII,
rem so open the folder instead - the line above prints the full path.
start "" "%CD%\data\outputs"
goto done

:done
rem Regenerate the overview every time, so it always reflects the last run
rem rather than a snapshot from whenever it happened to be built.
"%VPY%" -m chainway.cli overview
echo.
echo  ------------------------------------------------------------------
echo   Finished. Scroll up to read or screenshot the numbers, then press
echo   a key to go back to the menu.
echo  ------------------------------------------------------------------
echo.
pause
goto menu

:oops
echo.
echo   [X] That step stopped with an error. The reason is a few lines up.
echo       Screenshot the whole window and send it over.
echo.
pause
goto menu

:bye
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
