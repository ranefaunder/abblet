#!/bin/bash

# Sama kohde kuin ops/deploy.sh (faunder@faunder.fi, repo apps/remiix)
REMOTE="faunder@faunder.fi"
APP="/home/faunder/apps/remiix"
REMOTE_DB="${APP}/server/database/app.db"
LOCAL_DB_DIR="server/database"
LOCAL_DB="${LOCAL_DB_DIR}/app.db"
LOCAL_BACKUP_DIR="${LOCAL_DB_DIR}/backup"

echo "📦 Downloading Remiix database"
mkdir -p "$LOCAL_DB_DIR"
scp "${REMOTE}:${REMOTE_DB}" "$LOCAL_DB"

echo "💾 Creating daily database backup (if needed)..."
mkdir -p "$LOCAL_BACKUP_DIR"
BACKUP_DATE=$(date +%Y%m%d)
BACKUP_FILE="${LOCAL_BACKUP_DIR}/app-${BACKUP_DATE}.db"

if [ -f "$BACKUP_FILE" ]; then
  echo "ℹ️  Daily backup already exists: $BACKUP_FILE"
else
  cp "$LOCAL_DB" "$BACKUP_FILE"
  echo "✅ Created daily backup: $BACKUP_FILE"
fi

echo "🎨 Downloading app icons..."
mkdir -p static/app-icons
# All formats: legacy .webp plus current .svg / .png pairs
rsync -avz --ignore-existing "${REMOTE}:${APP}/static/app-icons/" static/app-icons/ || {
  echo "⚠️  Warning: Failed to download app icons"
}

echo "✅ Remiix database and app icons downloaded."
