# CompanyRun — Deployment Guide

Step-by-step instructions for deploying CompanyRun on a **Raspberry Pi 4** (ARM64, 8 GB RAM, Ubuntu 24.04).

> This guide also works on any Ubuntu/Debian ARM64 or x86_64 server. Adjust memory limits accordingly.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. Server Preparation](#1-server-preparation)
- [2. Clone the Project](#2-clone-the-project)
- [3. Environment Configuration](#3-environment-configuration)
- [4. Database Setup (Supabase)](#4-database-setup-supabase)
- [5. Install Dependencies & Build](#5-install-dependencies--build)
- [6. Database Migrations & Seed](#6-database-migrations--seed)
- [7. Nginx Configuration](#7-nginx-configuration)
- [8. PM2 Production Launch](#8-pm2-production-launch)
- [9. Auto-Start on Boot](#9-auto-start-on-boot)
- [10. Verify Deployment](#10-verify-deployment)
- [Automated Setup Script](#automated-setup-script)
- [PM2 Management Commands](#pm2-management-commands)
- [Monitoring & Logs](#monitoring--logs)
- [Updating / Upgrading](#updating--upgrading)
- [Docker Deployment (Alternative)](#docker-deployment-alternative)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Version | Check Command |
|------------|---------|---------------|
| Node.js | 20+ | `node -v` |
| npm | 10+ | `npm -v` |
| PM2 | latest | `pm2 -v` |
| nginx | any | `nginx -v` |
| git | any | `git --version` |
| Supabase account | — | [supabase.com](https://supabase.com) |

### Install Node.js 20 (if not already)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install PM2

```bash
sudo npm install -g pm2
```

### Install nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

---

## 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Create project directory
mkdir -p ~/CompanyRun

# Install build tools (needed for some npm packages on ARM)
sudo apt install -y build-essential python3
```

---

## 2. Clone the Project

```bash
cd ~
git clone <your-repo-url> CompanyRun
cd CompanyRun
```

Or if deploying from your local machine via SCP:

```bash
# From your local machine:
scp -r ./CompanyRun/ ubuntu@<YOUR_DEVICE_IP>:~/CompanyRun/
```

---

## 3. Environment Configuration

```bash
cd ~/CompanyRun
cp .env.example .env
nano .env
```

Fill in all required values:

```ini
# Server
PORT=3000
NODE_ENV=production

# Supabase (see next section)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres

# LLM — at least one provider key is required
OPENROUTER_API_KEY=sk-or-v1-...

# Economy (defaults are fine for start)
INITIAL_COMPANY_BUDGET=10000
DEFAULT_TASK_REWARD=10
IDLE_PENALTY_PER_HOUR=1

# KPI (defaults are fine)
KPI_REVIEW_INTERVAL_HOURS=24
KPI_WARNING_THRESHOLD=50
KPI_FIRE_THRESHOLD=40
KPI_FIRE_CONSECUTIVE_REVIEWS=3

# Orchestrator
ORCHESTRATOR_HEARTBEAT_MS=30000
ORCHESTRATOR_MODEL=openai/gpt-4o
ORCHESTRATOR_PROVIDER=openrouter
```

> **Security**: Ensure `.env` is **not** committed to version control. The `.gitignore` already excludes it.

---

## 4. Database Setup (Supabase)

### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a strong database password
3. Wait for the project to finish provisioning (~2 minutes)

### Get Connection Details

From your Supabase dashboard → **Settings** → **Database**:

- **Host**: `db.<project-ref>.supabase.co`
- **Port**: `5432`
- **Database**: `postgres`
- **User**: `postgres`
- **Password**: (the one you set during project creation)

Construct the `DATABASE_URL`:

```
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

From **Settings** → **API**:

- **URL**: `https://<project-ref>.supabase.co`
- **Anon Key**: `eyJ...` (the public/anon key)

Add these to your `.env` file.

### Connection Pooling (Recommended for Production)

For better connection handling, use the **pooled connection** string from Supabase:

- Go to **Settings** → **Database** → **Connection string** → **URI** tab
- Select the **Pooler** mode (port `6543`)

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

---

## 5. Install Dependencies & Build

```bash
cd ~/CompanyRun

# Backend dependencies (include devDependencies for build)
npm ci

# Build backend TypeScript → JavaScript
npm run build

# Frontend dependencies & build
cd frontend
npm ci
npm run build
cd ..
```

Verify the build outputs exist:

```bash
ls dist/index.js         # Backend entry point
ls frontend/dist/index.html  # Frontend SPA
```

---

## 6. Database Migrations & Seed

```bash
# Generate migration SQL from schema
npm run db:generate

# Apply migrations to Supabase
npm run db:migrate

# Seed initial data (company, templates, etc.)
npm run db:seed
```

> **Note**: `db:seed` is idempotent — safe to run again, but may create duplicate data if the seed script doesn't check for existing records.

---

## 7. Nginx Configuration

### Install the Config

```bash
# Copy the config
sudo cp deploy/nginx/companyrun.conf /etc/nginx/sites-available/companyrun

# Update the static file root path to match your install location
sudo sed -i "s|/home/ubuntu/CompanyRun/frontend/dist|$HOME/CompanyRun/frontend/dist|g" \
  /etc/nginx/sites-available/companyrun

# Enable the site
sudo ln -sf /etc/nginx/sites-available/companyrun /etc/nginx/sites-enabled/companyrun

# Optionally remove the default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Verify

```bash
# Should serve the frontend
curl -s http://localhost/ | head -5

# Should proxy to the API
curl -s http://localhost/api/health | python3 -m json.tool
```

### Access from LAN

From any device on the same network, use your device's IP:

- **Dashboard**: `http://<YOUR_DEVICE_IP>`
- **API**: `http://<YOUR_DEVICE_IP>/api/health`
- **WebSocket**: `ws://<YOUR_DEVICE_IP>/socket.io/`

> **💡 Finding your device's IP:** Run `hostname -I` on the device itself,
> or use a LAN scanner from another machine:
> ```bash
> # Using nmap
> nmap -sn 192.168.0.0/24
>
> # Or use the Fing app (iOS/Android) for a visual scanner
> ```

### Access via Tailscale

If Tailscale is configured, use the Tailscale IP:

```bash
tailscale ip -4   # Get the Tailscale IP
```

Then: `http://<tailscale-ip>/`

### Optional: SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d companyrun.yourdomain.com
```

---

## 8. PM2 Production Launch

```bash
cd ~/CompanyRun

# Create logs directory
mkdir -p logs

# Start the production process
pm2 start ecosystem.config.js --only companyrun --env production

# Verify it's running
pm2 status
pm2 logs companyrun --lines 20
```

### Install Log Rotation

```bash
pm2 install pm2-logrotate

# Configure rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## 9. Auto-Start on Boot

```bash
# Save current PM2 process list
pm2 save

# Generate and install startup script
pm2 startup

# PM2 will print a command like:
#   sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Copy and run that command.
```

After reboot, PM2 will automatically restore CompanyRun.

---

## 10. Verify Deployment

Run these checks to confirm everything is working:

```bash
# 1. PM2 process is online
pm2 status | grep companyrun

# 2. API responds
curl -s http://localhost/api/health | python3 -m json.tool

# 3. Frontend loads
curl -sI http://localhost/ | head -5

# 4. WebSocket is accessible
# (Open browser dev tools → Network → WS to verify socket.io connection)

# 5. Check logs for errors
pm2 logs companyrun --err --lines 20
```

---

## Automated Setup Script

For a one-command deployment, use the included setup script:

```bash
chmod +x deploy/setup.sh
./deploy/setup.sh
```

This script handles steps 3–9 automatically and is **idempotent** (safe to run multiple times).

---

## PM2 Management Commands

| Command | Description |
|---------|-------------|
| `pm2 status` | Show process status |
| `pm2 logs companyrun` | View live logs |
| `pm2 logs companyrun --err` | View error logs only |
| `pm2 monit` | Interactive monitoring dashboard |
| `pm2 restart companyrun` | Restart the process |
| `pm2 stop companyrun` | Stop the process |
| `pm2 delete companyrun` | Remove from PM2 |
| `pm2 reload companyrun` | Zero-downtime reload |
| `pm2 info companyrun` | Detailed process info |
| `pm2 env 0` | Show environment variables |

---

## Monitoring & Logs

### Log Locations

| Log | Path |
|-----|------|
| App stdout | `~/CompanyRun/logs/out.log` |
| App stderr | `~/CompanyRun/logs/error.log` |
| PM2 daemon | `~/.pm2/pm2.log` |
| nginx access | `/var/log/nginx/companyrun_access.log` |
| nginx error | `/var/log/nginx/companyrun_error.log` |

### Real-Time Monitoring

```bash
# PM2 interactive dashboard
pm2 monit

# Watch logs in real-time
pm2 logs companyrun

# System resource usage
htop
# or
pm2 info companyrun   # Shows memory & CPU for the process
```

### Health Endpoint

Set up a cron job to periodically check health:

```bash
# Check every 5 minutes
*/5 * * * * curl -sf http://localhost/api/health > /dev/null || pm2 restart companyrun
```

---

## Updating / Upgrading

### Standard Update

```bash
cd ~/CompanyRun

# Pull latest code
git pull origin main

# Install any new dependencies
npm ci
cd frontend && npm ci && cd ..

# Rebuild
npm run build
cd frontend && npm run build && cd ..

# Run any new migrations
npm run db:migrate

# Restart with zero downtime
pm2 reload companyrun
```

### Major Version Upgrade

For breaking changes, do a full restart:

```bash
pm2 stop companyrun

# ... update code, deps, build ...

npm run db:migrate

pm2 start ecosystem.config.js --only companyrun --env production
pm2 save
```

---

## Docker Deployment (Alternative)

If you prefer Docker over PM2 + nginx:

```bash
cd ~/CompanyRun

# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

> **Note**: The Docker setup uses the built-in Node.js server on port 3000. You may still want nginx in front for SSL termination and static file caching.

See [`Dockerfile`](../Dockerfile) and [`docker-compose.yml`](../docker-compose.yml) for details.

---

## Troubleshooting

### PM2 process keeps crashing

```bash
# Check error logs
pm2 logs companyrun --err --lines 50

# Common causes:
# - Missing .env file or variables
# - Database connection string incorrect
# - Port 3000 already in use
# - dist/index.js doesn't exist (forgot to build)
```

### "EADDRINUSE: address already in use :::3000"

```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill it, or change PORT in .env
kill <PID>
```

### nginx returns 502 Bad Gateway

```bash
# Check if the backend is running
pm2 status
curl http://localhost:3000/api/health

# If not running, start it
pm2 start ecosystem.config.js --only companyrun

# Check nginx error log
sudo tail -20 /var/log/nginx/companyrun_error.log
```

### Database connection refused

```bash
# Verify DATABASE_URL in .env
grep DATABASE_URL .env

# Test connection manually
npx tsx -e "
  import postgres from 'postgres';
  const sql = postgres(process.env.DATABASE_URL);
  const result = await sql\`SELECT NOW()\`;
  console.log('Connected:', result);
  await sql.end();
"
```

### Frontend shows blank page

```bash
# Verify the build exists
ls frontend/dist/index.html

# Rebuild if missing
cd frontend && npm run build && cd ..

# Check nginx root path matches
grep root /etc/nginx/sites-available/companyrun
```

### Memory issues on Raspberry Pi

```bash
# Check memory usage
free -h

# PM2 should auto-restart at 1 GB (configured in ecosystem.config.js)
pm2 info companyrun | grep "max memory"

# If still OOM, reduce Node memory:
# Edit ecosystem.config.js → node_args: '--max-old-space-size=384'
pm2 restart companyrun
```

### WebSocket not connecting

```bash
# Verify socket.io endpoint is accessible
curl -s "http://localhost/socket.io/?EIO=4&transport=polling"

# Should return something like: 0{"sid":"...","upgrades":["websocket"],...}

# Check nginx config has WebSocket upgrade headers
grep -A5 "socket.io" /etc/nginx/sites-available/companyrun
```

### Tailscale access not working

```bash
# Check Tailscale status
tailscale status

# Ensure the service is running
sudo systemctl status tailscaled

# Get your Tailscale IP
tailscale ip -4

# nginx listens on all interfaces by default, so Tailscale should work
# If not, check firewall:
sudo ufw status
```

---

## RPi-Specific Tips

1. **Use an SSD** instead of an SD card for better I/O performance
2. **Enable swap** if you encounter OOM during builds:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
3. **Monitor temperature**: `vcgencmd measure_temp`
4. **Reduce log verbosity** in production — set `NODE_ENV=production` so Pino uses `info` level instead of `debug`
5. **Consider a cron job** to clean old logs:
   ```bash
   0 3 * * 0 find ~/CompanyRun/logs -name '*.log' -mtime +30 -delete
   ```
