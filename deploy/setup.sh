#!/usr/bin/env bash
# =============================================================
# CompanyRun — Raspberry Pi deployment script
# =============================================================
#
# Usage:
#   chmod +x deploy/setup.sh
#   ./deploy/setup.sh
#
# This script is idempotent — safe to run multiple times.
# =============================================================

set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Resolve project root (directory containing this script's parent) ─
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "============================================="
echo "  CompanyRun — Deployment Setup"
echo "============================================="
echo "  Project root: $PROJECT_ROOT"
echo "  Date:         $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================="
echo ""

# ── 1. Verify prerequisites ──────────────────────────────────
info "Checking prerequisites …"

command -v node  >/dev/null 2>&1 || fail "Node.js not found. Install Node 20+ first."
command -v npm   >/dev/null 2>&1 || fail "npm not found."
command -v pm2   >/dev/null 2>&1 || fail "PM2 not found. Install with: npm i -g pm2"

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ required (found v$(node -v))"
fi

ok "Node $(node -v), npm $(npm -v), PM2 $(pm2 -v 2>/dev/null || echo 'installed')"

# ── 2. Environment file ──────────────────────────────────────
info "Checking environment file …"

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    warn ".env created from .env.example — please edit it with real values!"
    warn "  nano $PROJECT_ROOT/.env"
    echo ""
    read -rp "Press Enter after you have configured .env, or Ctrl+C to abort …"
  else
    fail ".env file not found and no .env.example to copy from."
  fi
else
  ok ".env file exists"
fi

# ── 3. Create log directory ──────────────────────────────────
info "Ensuring logs directory exists …"
mkdir -p "$PROJECT_ROOT/logs"
ok "logs/"

# ── 4. Install backend dependencies ─────────────────────────
info "Installing backend dependencies …"
npm ci --production=false
ok "Backend dependencies installed"

# ── 5. Build backend (TypeScript → JavaScript) ───────────────
info "Building backend …"
npm run build
ok "Backend compiled to dist/"

# ── 6. Install & build frontend ─────────────────────────────
info "Installing frontend dependencies …"
cd "$PROJECT_ROOT/frontend"
npm ci
ok "Frontend dependencies installed"

info "Building frontend …"
npm run build
ok "Frontend compiled to frontend/dist/"
cd "$PROJECT_ROOT"

# ── 7. Run database migrations ───────────────────────────────
info "Running database migrations …"
npm run db:migrate 2>/dev/null && ok "Migrations applied" || warn "db:migrate skipped or already up to date"

# ── 8. Seed database (only if not already seeded) ────────────
info "Seeding database …"
npm run db:seed 2>/dev/null && ok "Database seeded" || warn "db:seed skipped (may already be seeded)"

# ── 9. Configure nginx ───────────────────────────────────────
info "Configuring nginx …"

NGINX_CONF_SRC="$PROJECT_ROOT/deploy/nginx/companyrun.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/companyrun"
NGINX_ENABLED="/etc/nginx/sites-enabled/companyrun"

if command -v nginx >/dev/null 2>&1; then
  # Update the root path in the config to match actual project location
  ESCAPED_ROOT=$(echo "$PROJECT_ROOT/frontend/dist" | sed 's/\//\\\//g')
  sed "s|/home/ubuntu/CompanyRun/frontend/dist|$PROJECT_ROOT/frontend/dist|g" \
    "$NGINX_CONF_SRC" | sudo tee "$NGINX_AVAILABLE" > /dev/null

  # Enable site
  if [ ! -L "$NGINX_ENABLED" ]; then
    sudo ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  fi

  # Remove default site if it exists (optional — keeps things clean)
  if [ -L /etc/nginx/sites-enabled/default ]; then
    warn "Removing default nginx site (backed up to sites-available)"
    sudo rm -f /etc/nginx/sites-enabled/default
  fi

  # Test and reload
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    ok "nginx configured and reloaded"
  else
    warn "nginx config test failed — check $NGINX_AVAILABLE"
  fi
else
  warn "nginx not found — skipping reverse-proxy setup"
fi

# ── 10. Install PM2 log rotate module ────────────────────────
info "Setting up PM2 log rotation …"
pm2 install pm2-logrotate 2>/dev/null || true
pm2 set pm2-logrotate:max_size 10M 2>/dev/null || true
pm2 set pm2-logrotate:retain 7 2>/dev/null || true
pm2 set pm2-logrotate:compress true 2>/dev/null || true
ok "PM2 log rotation configured"

# ── 11. Start / restart PM2 process ─────────────────────────
info "Starting CompanyRun with PM2 …"

# Stop existing instance if running
pm2 delete companyrun 2>/dev/null || true

# Start production config
pm2 start ecosystem.config.js --only companyrun --env production
ok "PM2 process started"

# ── 12. Save PM2 process list for reboot persistence ────────
info "Saving PM2 process list …"
pm2 save
ok "PM2 process list saved"

# Set up PM2 startup hook (runs on boot)
info "Configuring PM2 startup on boot …"
pm2 startup 2>/dev/null | grep "sudo" | bash 2>/dev/null || warn "PM2 startup hook may need manual setup: pm2 startup"

# ── 13. Final status ─────────────────────────────────────────
echo ""
echo "============================================="
echo -e "  ${GREEN}✓ CompanyRun deployed successfully!${NC}"
echo "============================================="
echo ""
pm2 status
echo ""
info "Dashboard:  http://$(hostname -I | awk '{print $1}')"
info "API:        http://$(hostname -I | awk '{print $1}')/api/health"
info "Logs:       pm2 logs companyrun"
info "Monitor:    pm2 monit"
echo ""
