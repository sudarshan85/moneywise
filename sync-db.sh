#!/bin/bash
# Sync production database from Fly.io to local development
# Usage: ./sync-db.sh

set -e

APP_NAME="moneywise"
APP_URL="https://moneywise.fly.dev"
REMOTE_DB_PATH="/data/moneywise.db"
REMOTE_ICONS_DIR="/data/icons"
LOCAL_ICONS_DIR="./frontend/public/icons"
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

# The database runs in WAL mode: recent writes may live in moneywise.db-wal
# instead of the main file. Checkpoint before copying so the raw file is complete.
#
# Two quoting traps in `fly ssh console -C`, which does its own argv splitting
# rather than handing the string to a shell:
#   1. it splits on whitespace, so the -e script must contain no spaces;
#   2. it STRIPS single quotes, so 'better-sqlite3' arrives as a bare identifier
#      and node dies with "Invalid regular expression flags".
# Backticks (JS template literals) survive both, escaped here so the local shell
# does not treat them as command substitution.
echo ""
echo "🧹 Checkpointing WAL on remote so the database file is complete..."
fly ssh console --app "$APP_NAME" -C "node -e require(\`better-sqlite3\`)(\`$REMOTE_DB_PATH\`).pragma(\`wal_checkpoint(TRUNCATE)\`)" || {
    echo "⚠️  Checkpoint failed — the downloaded database may miss the latest writes."
}

echo ""
echo "⬇️  Downloading production database from Fly.io..."
echo "   App: $APP_NAME"
echo "   Remote path: $REMOTE_DB_PATH"
echo ""

# Ensure the local directory exists
mkdir -p "$BACKUP_DIR"

# Download the database
fly ssh sftp get "$REMOTE_DB_PATH" "$LOCAL_DB_PATH" --app "$APP_NAME"

# Stale local WAL companions would shadow the freshly downloaded file
rm -f "${LOCAL_DB_PATH}-wal" "${LOCAL_DB_PATH}-shm"

# Record the sync time (informational; the MCP connector now reads live data on Fly)
date -u +%Y-%m-%dT%H:%M:%SZ > "$BACKUP_DIR/.last-sync"

# Icons uploaded through MCP live on the volume. Copy any we don't have into the
# repo's icon folder so they can be committed as built-in icons. Never overwrite.
echo ""
echo "🖼️  Checking for icons uploaded on Fly..."
REMOTE_ICONS=$(fly ssh console --app "$APP_NAME" -C "ls -1 $REMOTE_ICONS_DIR" 2>/dev/null | tr -d '\r' | grep -E '^[a-z0-9_]+\.png$' || true)
PULLED=()
for icon in $REMOTE_ICONS; do
    if [ ! -e "$LOCAL_ICONS_DIR/$icon" ]; then
        fly ssh sftp get "$REMOTE_ICONS_DIR/$icon" "$LOCAL_ICONS_DIR/$icon" --app "$APP_NAME" > /dev/null
        PULLED+=("$icon")
    fi
done
if [ ${#PULLED[@]} -gt 0 ]; then
    echo "   ⬇️  Pulled new icons (commit them): ${PULLED[*]}"
else
    echo "   No new icons."
fi

echo ""
echo "✅ Database synced successfully!"
echo ""
echo "📊 Database info:"
ls -lh "$LOCAL_DB_PATH"
