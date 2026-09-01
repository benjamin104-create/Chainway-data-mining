@echo off
chcp 65001 >nul
rem ===================================================================
rem  季別完銷診斷報告 —— 在 Windows 上按兩下就跑
rem
rem  第一次執行會自動建立 .venv 並安裝套件（約 3-5 分鐘），
rem  之後每次執行只要幾十秒。
rem
rem  資料夾位置在 config\settings.yaml 的 paths.root，
rem  目前設定為 C:/Users/USER/Desktop/商品設計Raw Data
rem ===================================================================
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo [X] 找不到 Python。
    echo     請先到 https://www.python.org/downloads/ 安裝，
    echo     安裝時務必勾選 "Add Python to PATH"。
    echo.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo.
    echo [1/3] 第一次執行，建立獨立的 Python 環境...
    python -m venv .venv
    if errorlevel 1 goto :fail
    echo [2/3] 安裝需要的套件，請稍候 3-5 分鐘...
    ".venv\Scripts\python.exe" -m pip install --upgrade pip -q
    ".venv\Scripts\python.exe" -m pip install pandas numpy pyyaml openpyxl pyarrow xlrd Pillow -q
    if errorlevel 1 goto :fail
) else (
    echo [1/3] 環境已就緒
    echo [2/3] 略過安裝
)

echo.
echo [3/3] 檢查資料夾並產生報告...
echo ===================================================================
".venv\Scripts\python.exe" -m chainway.cli doctor
echo ===================================================================
echo.
".venv\Scripts\python.exe" scripts\season_report.py --images
if errorlevel 1 goto :fail

echo.
echo 報告在 data\outputs\reports\ 底下，用瀏覽器打開即可。
start "" "data\outputs\reports"
pause
exit /b 0

:fail
echo.
echo [X] 執行失敗。請把上面整段訊息複製給我，我來看是哪裡卡住。
pause
exit /b 1
