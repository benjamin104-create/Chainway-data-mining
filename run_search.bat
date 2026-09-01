@echo off
setlocal
rem ===================================================================
rem  Kinloch Anderson - photo to SKU search
rem
rem  Takes a photo of a garment and returns the matching style number,
rem  price and stock. Also does text search ("navy plaid pleated skirt").
rem
rem  FIRST RUN downloads about 700 MB (PyTorch CPU build + the
rem  Fashion-CLIP model) and then reads every system image once.
rem  Budget 20-40 minutes. Later runs start in seconds - the vectors
rem  are cached, only new styles get processed.
rem
rem  IMPORTANT: keep this file pure ASCII. cmd.exe mis-parses batch
rem  files containing multi-byte characters.
rem ===================================================================
cd /d "%~dp0"

set "PY="
py -3 -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto havepy
python -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if not errorlevel 1 set "PY=python"
:havepy
if not defined PY goto nopython

set "VPY=.venv\Scripts\python.exe"
if exist "%VPY%" goto haveenv
echo.
echo  [1/6] Creating the Python environment...
%PY% -m venv .venv
if errorlevel 1 goto fail
if not exist "%VPY%" goto fail
"%VPY%" -m pip install --upgrade pip -q
"%VPY%" -m pip install pandas numpy pyyaml openpyxl xlrd pyarrow Pillow -q
if errorlevel 1 goto fail
goto aipkgs

:haveenv
echo.
echo  [1/6] Environment ready

:aipkgs
"%VPY%" -c "import torch, transformers, fastapi" >nul 2>nul
if not errorlevel 1 goto haveai
echo  [2/6] Installing the AI packages - about 700 MB, 5-15 minutes.
echo        The screen will look frozen while pip downloads. Leave it alone.
rem  CPU-only wheels: the default PyTorch package pulls ~2.5 GB of CUDA
rem  libraries that are useless without an NVIDIA card.
"%VPY%" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu -q
if errorlevel 1 goto fail
"%VPY%" -m pip install transformers scikit-learn scipy opencv-python-headless fastapi "uvicorn[standard]" python-multipart -q
if errorlevel 1 goto fail
goto ingest

:haveai
echo  [2/6] AI packages already installed

:ingest
echo.
echo  [3/6] Scanning system images and sales reports...
"%VPY%" -m chainway.cli ingest
if errorlevel 1 goto fail

echo.
echo  [4/6] Extracting image features with Fashion-CLIP...
echo        First run also downloads the model (~600 MB) and reads every
echo        image once. This is the slow step. Progress is printed below.
"%VPY%" -m chainway.cli embed
if errorlevel 1 goto fail

echo.
echo  [5/6] Merging sales, images and tech packs into the master table...
"%VPY%" -m chainway.cli build
if errorlevel 1 goto fail

echo.
echo  [6/6] Starting the web interface...
echo  ==================================================================
echo    Open  http://127.0.0.1:8000  in your browser.
echo    Drop a photo on the page to get the style number back.
echo    Press Ctrl+C in this window to stop the server.
echo  ==================================================================
echo.
start "" "http://127.0.0.1:8000"
"%VPY%" -m chainway.cli serve
goto end

:nopython
echo.
echo  [X] No usable Python 3.10 or newer was found.
echo      Run run_report.bat first - it explains how to install Python.
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

:end
echo.
echo  Server stopped.
pause
exit /b 0
