#!/bin/bash

# 🍯 MoneyPot Launch Script
# Starts both backend and frontend servers

echo "🍯 Starting MoneyPot..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
echo "✅ MoneyPot is running!"
echo "   🌐 Open http://localhost:5173 in your browser"
echo ""
echo "   Press Ctrl+C to stop both servers"
echo ""

# Handle Ctrl+C to kill both processes
cleanup() {
    echo ""
    echo "🛑 Shutting down MoneyPot..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for processes
wait
