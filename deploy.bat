@echo off
setlocal enabledelayedexpansion

where python >nul 2>nul
if %errorlevel% neq 0 exit /b 1
where node >nul 2>nul
if %errorlevel% neq 0 exit /b 1
where npm >nul 2>nul
if %errorlevel% neq 0 exit /b 1

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if not exist venv (
    python -m venv venv
)

call venv\Scripts\activate
python -m pip install --upgrade pip

if exist requirements.txt (
    pip install -r requirements.txt
) else if exist backend\requirements.txt (
    pip install -r backend\requirements.txt
)

if exist package.json (
    if exist index.html (
        set "FRONTEND_DIR=%ROOT_DIR%"
    )
)
if exist frontend (
    if exist my-react-vite-app\index.html (
        set "FRONTEND_DIR=%ROOT_DIR%my-react-vite-app"
    )
)

if "%FRONTEND_DIR%"=="" exit /b 1

cd /d "%FRONTEND_DIR%"
call npm install
call npm run build

start /b npx vite preview --port 3000 --host

cd /d "%ROOT_DIR%"

if exist main.py (
    start /b venv\Scripts\python.exe main.py
) else if exist app.py (
    start /b venv\Scripts\python.exe app.py
) else if exist backend\main.py (
    start /b venv\Scripts\python.exe backend\main.py
)

echo Done. Processes are running in the background.
