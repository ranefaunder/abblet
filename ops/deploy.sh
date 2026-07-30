#!/bin/bash

set -e

echo "🔗 Deploying Remiix to server..."

ssh faunder@faunder.fi << 'EOF'
  set -e
  export PATH="/home/faunder/.bun/bin:$PATH"
  APP="/home/faunder/apps/remiix"
  OLD_ABBLET="/home/faunder/apps/abblet"
  OLD_APPLET="/home/faunder/apps/applet"
  REPO="git@github.com:ranefaunder/abblet.git"

  mkdir -p /home/faunder/apps

  # Migrate old installs → remiix (one-time)
  if [ -d "$OLD_APPLET" ] && [ ! -d "$APP" ] && [ ! -d "$OLD_ABBLET" ]; then
    echo "📦 Renaming apps/applet → apps/remiix..."
    sudo -n systemctl stop applet.service 2>/dev/null || true
    sudo -n systemctl stop appliet.service 2>/dev/null || true
    mv "$OLD_APPLET" "$APP"
  fi
  if [ -d "$OLD_ABBLET" ] && [ ! -d "$APP" ]; then
    echo "📦 Renaming apps/abblet → apps/remiix..."
    sudo -n systemctl stop abblet.service 2>/dev/null || true
    mv "$OLD_ABBLET" "$APP"
  fi

  if [ ! -d "$APP/.git" ]; then
    echo "📦 Cloning repository into apps/remiix..."
    bash -lc "cd /home/faunder/apps && git clone $REPO remiix"
  fi

  if [ ! -x "/home/faunder/.bun/bin/bun" ]; then
    echo "📦 Installing Bun for faunder..."
    bash -lc "curl -fsSL https://bun.sh/install | bash"
  fi

  if [ ! -f "$APP/.env" ]; then
    echo "❌ Missing $APP/.env"
    echo "Create it on the server before deploying (see .env.example)."
    exit 1
  fi

  bash -lc "cd $APP && git remote set-url origin $REPO && git fetch origin && git checkout main && git reset --hard origin/main && /home/faunder/.bun/bin/bun install"
  sudo -n install -m 644 "$APP/ops/remiix.service" /etc/systemd/system/remiix.service
  sudo -n systemctl daemon-reload
  sudo -n systemctl disable --now applet.service 2>/dev/null || true
  sudo -n systemctl disable --now appliet.service 2>/dev/null || true
  sudo -n systemctl disable --now abblet.service 2>/dev/null || true
  sudo -n rm -f /etc/systemd/system/applet.service /etc/systemd/system/appliet.service /etc/systemd/system/abblet.service
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now remiix.service
  sudo -n systemctl restart remiix.service

  if sudo -n systemctl status remiix.service > /dev/null 2>&1; then
    echo "✅ Remiix deploy complete! (systemd service)"
  else
    echo "❌ Remiix service failed to start"
    echo "Check logs with: journalctl -u remiix.service -f"
    exit 1
  fi
EOF
