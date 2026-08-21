#!/bin/bash

set -e

echo "🔗 Deploying Abblet to server..."

ssh faunder@faunder.fi << 'EOF'
  set -e
  export PATH="/home/faunder/.bun/bin:$PATH"
  APP="/home/faunder/apps/abblet"
  OLD_REMIIX="/home/faunder/apps/remiix"
  REPO="git@github.com:ranefaunder/abblet.git"

  mkdir -p /home/faunder/apps

  # Migrate remiix install → abblet (one-time)
  if [ -d "$OLD_REMIIX" ] && [ ! -d "$APP" ]; then
    echo "📦 Renaming apps/remiix → apps/abblet..."
    sudo -n systemctl stop remiix.service 2>/dev/null || true
    mv "$OLD_REMIIX" "$APP"
  fi

  if [ ! -d "$APP/.git" ]; then
    echo "📦 Cloning repository into apps/abblet..."
    bash -lc "cd /home/faunder/apps && git clone $REPO abblet"
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
  sudo -n install -m 644 "$APP/ops/abblet.service" /etc/systemd/system/abblet.service
  sudo -n systemctl daemon-reload
  sudo -n systemctl disable --now remiix.service 2>/dev/null || true
  sudo -n systemctl disable --now applet.service 2>/dev/null || true
  sudo -n systemctl disable --now appliet.service 2>/dev/null || true
  sudo -n rm -f /etc/systemd/system/remiix.service /etc/systemd/system/applet.service /etc/systemd/system/appliet.service
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable --now abblet.service
  sudo -n systemctl restart abblet.service

  if sudo -n systemctl status abblet.service > /dev/null 2>&1; then
    echo "✅ Abblet deploy complete! (systemd service)"
  else
    echo "❌ Abblet service failed to start"
    echo "Check logs with: journalctl -u abblet.service -f"
    exit 1
  fi
EOF
