#!/bin/bash
# Sync production database from Fly.io to local development
# Usage: ./sync-db.sh

set -e

APP_NAME="moneywise"
APP_URL="https://moneywise.fly.dev"
REMOTE_DB_PATH="/data/moneywise.db"
LOCAL_DB_PATH="./data/moneywise.db"
BACKUP_DIR="./data"

# Create backup filename with timestamp
BACKUP_PATH="${BACKUP_DIR}/moneywise.db.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔄 MoneyWise Database Sync"
echo "=========================="
echo ""

# Check if fly CLI is available
if ! command -v fly &> /dev/null; then
    echo "❌ Error: Fly CLI (flyctl) is not installed or not in PATH"
    echo "   Install it from: https://fly.io/docs/flyctl/install/"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io"
    echo "   Run: fly auth login"
    exit 1
fi

# Wake up the VM first (it auto-stops when idle)
echo "🌅 Waking up Fly.io VM (it auto-stops when idle)..."
echo "   Making request to $APP_URL..."
curl -s -o /dev/null -w "   Response: HTTP %{http_code}\n" --max-time 60 "$APP_URL" || {
    echo "⚠️  Could not reach app, but continuing anyway..."
}

# Give the VM a moment to fully start
echo "   Waiting for VM to be ready..."
sleep 5

# Backup current local database if it exists
if [ -f "$LOCAL_DB_PATH" ]; then
    echo ""
    echo "📦 Backing up current local database..."
    cp "$LOCAL_DB_PATH" "$BACKUP_PATH"
    echo "   ✅ Backup saved to: $BACKUP_PATH"
    echo "   Removing old file (fly sftp won't overwrite)..."
    rm "$LOCAL_DB_PATH"
else
    echo ""
    echo "ℹ️  No existing local database to backup"
fi

echo ""
echo "⬇️  Downloading production database from Fly.io..."
echo "   App: $APP_NAME"
echo "   Remote path: $REMOTE_DB_PATH"
echo ""

# Ensure the local directory exists
mkdir -p "$BACKUP_DIR"

# Download the database
fly ssh sftp get "$REMOTE_DB_PATH" "$LOCAL_DB_PATH" --app "$APP_NAME"

echo ""
echo "✅ Database synced successfully!"
echo ""
echo "📊 Database info:"
ls -lh "$LOCAL_DB_PATH"
