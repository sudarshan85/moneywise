#!/bin/bash

# 💰 MoneyWise Launch Script
# Starts both backend and frontend servers
# Usage: ./start.sh [--seed] [--fresh]
#   --seed  : Populate database with sample data
#   --fresh : Delete existing database and start fresh

echo "💰 Starting MoneyWise..."
echo ""

# Load NVM if available (for correct Node.js version)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check Node.js version
NODE_VERSION=$(node --version)
echo "📌 Using Node.js $NODE_VERSION"

# Parse arguments
SEED_DATA=false
FRESH_DB=false
for arg in "$@"; do
    case $arg in
        --seed)
            SEED_DATA=true
            ;;
        --fresh)
            FRESH_DB=true
            ;;
    esac
done

# Handle fresh database
if [ "$FRESH_DB" = true ]; then
    echo "🗑️  Deleting existing database..."
    rm -f "$SCRIPT_DIR/data/moneywise.db"
fi

# Export seed flag for backend
export SEED_DATA=$SEED_DATA

# Start backend in background
echo "📦 Starting backend (port 3001)..."
cd "$SCRIPT_DIR/backend"
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to initialize
sleep 2

# Start frontend in background
echo "🎨 Starting frontend (port 5173)..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ MoneyWise is running!"
echo "   🌐 Open http://localhost:5173 in your browser"
echo ""
echo "   Press Ctrl+C to backup data and stop both servers"
echo ""

# Backup directory
BACKUP_DIR="/mnt/s/Finance Data"

# Handle Ctrl+C to backup and kill both processes
cleanup() {
    echo ""
    echo "🛑 Shutting down MoneyWise..."
    
    # Trigger backup via API (if backend is still running)
    echo "💾 Creating backup..."
    BACKUP_RESULT=$(curl -s -X POST http://localhost:3001/api/backup/manual 2>/dev/null)
    
    if echo "$BACKUP_RESULT" | grep -q '"success":true'; then
        BACKUP_PATH=$(echo "$BACKUP_RESULT" | grep -o '"path":"[^"]*"' | cut -d'"' -f4)
        echo "✅ Backup saved: $BACKUP_PATH"
    else
        echo "⚠️  Backup may have failed (server might already be stopped)"
    fi
    
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "👋 Goodbye!"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
