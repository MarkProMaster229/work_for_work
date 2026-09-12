#!/bin/bash

set -e

command -v python3 >/dev/null 2>&1 || { exit 1; }
command -v node >/dev/null 2>&1 || { exit 1; }
command -v npm >/dev/null 2>&1 || { exit 1; }

ROOT_DIR=$(pwd)

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip

if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
elif [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
fi

if [ -f "package.json" ] && [ -f "index.html" ]; then
    FRONTEND_DIR="$ROOT_DIR"
elif [ -d "my-react-vite-app" ] && [ -f "my-react-vite-app/index.html" ]; then
    FRONTEND_DIR="$ROOT_DIR/my-react-vite-app"
else
    exit 1
fi

cd "$FRONTEND_DIR"
npm install
npm install maplibre-gl
pkill -f "vite preview" || true
pkill -f "main.py|app.py" || true
python3 -m api.app &

npm run dev

pkill -f "vite preview" || true
pkill -f "main.py|app.py" || true

nohup npx vite preview --port 3001 --host > "$ROOT_DIR/frontend.log" 2>&1 &

cd "$ROOT_DIR"

source .venv/bin/activate

if [ -f "main.py" ]; then
    nohup python main.py > backend.log 2>&1 &
elif [ -f "app.py" ]; then
    nohup python app.py > backend.log 2>&1 &
elif [ -f "backend/main.py" ]; then
    nohup python backend/main.py > backend.log 2>&1 &
fi
