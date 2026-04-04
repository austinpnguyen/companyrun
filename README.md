<p align="center">
  <h1 align="center">🏢 CompanyRun</h1>
  <p align="center"><strong>Run your own AI company.</strong></p>
  <p align="center">
    A multi-agent orchestration system where an AI CEO manages AI employees —<br>
    hiring, firing, assigning tasks, tracking KPIs, and managing a virtual economy —<br>
    all through a real-time web dashboard.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="MIT License" />
  <img src="https://img.shields.io/badge/platform-RPi%204%20%7C%20ARM64-red" alt="Raspberry Pi" />
</p>

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web Browser                              │
│              React Dashboard (Vite + Tailwind)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTP / WebSocket
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                         nginx                                    │
│        reverse proxy + static file server (port 80)              │
│   ┌────────────────┐  ┌──────────────────────────────────┐       │
│   │ /api/*         │  │ /socket.io/*                     │       │
│   │ → :3000        │  │ → :3000 (WebSocket upgrade)      │       │
│   └────────┬───────┘  └──────────────┬───────────────────┘       │
│            │   static: frontend/dist │                            │
└────────────┼─────────────────────────┼───────────────────────────┘
             ▼                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Fastify API Server (:3000)                     │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ REST API │  │ Socket.io  │  │ Orchestr.│  │ Agent Manager│   │
│  └────┬─────┘  └──────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │               │             │                │           │
│  ┌────▼───────────────▼─────────────▼────────────────▼───────┐   │
│  │                Core Services                              │   │
│  │  Task System │ Economy Engine │ KPI System │ MCP Manager  │   │
│  └──────────────┬──────────────────────────────┬─────────────┘   │
│                 │                              │                 │
│       ┌─────────▼──────────┐        ┌──────────▼─────────┐      │
│       │   LLM Gateway      │        │   Agent Runtimes   │      │
│       │  (multi-provider)  │◄───────│  (AI employees)    │      │
│       └─────────┬──────────┘        └────────────────────┘      │
└─────────────────┼────────────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────────────┐
    ▼             ▼             ▼       ▼
┌────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐
│OpenRtr │ │TogetherAI│ │ AskCodi │ │9router │   LLM Providers
└────────┘ └──────────┘ └─────────┘ └────────┘

    ▼
┌──────────────────────────┐
│  Supabase PostgreSQL     │   Cloud-hosted database
│  (cloud)                 │
└──────────────────────────┘
```

---

## Features

- **🤖 Multi-Agent System** — Hire, manage, and fire AI employees with distinct roles and personalities
- **🎯 Orchestrator (AI CEO)** — Always-on daemon that assigns tasks, evaluates performance, and makes decisions
- **🔧 MCP Tool Integration** — Agents learn new skills via Model Context Protocol servers
- **💰 Virtual Economy** — Budget management, wages, rewards, and financial health tracking
- **📊 KPI System** — Quantified performance reviews with automated warnings and firing proposals
- **📋 Task Management** — Create, assign, decompose, review, and track tasks end-to-end
- **💬 Chat Interface** — Talk to individual agents or the orchestrator directly
- **📡 Real-Time Dashboard** — Live updates via WebSocket for agent status, tasks, economy, and decisions
- **🔀 Multi-LLM Gateway** — Route to OpenRouter, TogetherAI, AskCodi, or 9router with automatic fallback
- **🏗️ Raspberry Pi Ready** — Optimized for ARM64 deployment on constrained hardware

---

## Tech Stack

### Backend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js 20+ / TypeScript | Lightweight, PM2-managed |
| API | Fastify 5 | High-perf HTTP framework |
| ORM | Drizzle ORM | Type-safe PostgreSQL access |
| WebSocket | Socket.io 4 | Real-time dashboard events |
| MCP | @modelcontextprotocol/sdk | Tool integration protocol |
| Validation | Zod | Schema validation |
| Logging | Pino | Structured JSON logging |
| Process Mgr | PM2 | Daemon management + monitoring |

### Frontend

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | React 18 + Vite 5 | Fast SPA build |
| Styling | Tailwind CSS 3 | Utility-first CSS |
| State | Zustand | Lightweight state management |
| Charts | Recharts | KPI & economy visualization |
| Routing | React Router 6 | Client-side navigation |
| Icons | Lucide React | Icon library |
| Real-time | Socket.io Client | WebSocket connection |

### Infrastructure

| Component | Technology |
|-----------|-----------|
| Database | Supabase PostgreSQL (cloud) |
| Reverse Proxy | nginx |
| Deployment | PM2 + bash deploy script |
| Container (opt.) | Docker / Docker Compose |

---

## Quick Start

### Prerequisites

- **Node.js 20+** and npm
- **PM2** (`npm i -g pm2`)
- A **Supabase** project (free tier works)
- At least one **LLM API key** (OpenRouter recommended)

### 1. Clone & Install

```bash
git clone <repo-url> CompanyRun
cd CompanyRun

# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env   # Fill in your keys
```

See the [Configuration](#configuration) section below for all variables.

### 3. Set Up Database

```bash
# Generate and run migrations
npm run db:generate
npm run db:migrate

# Seed initial data (company, sample agents, templates)
npm run db:seed
```

### 4. Build Frontend

```bash
cd frontend && npm run build && cd ..
```

### 5. Start

```bash
# Development (with hot-reload)
npm run dev

# Production
npm run build      # compile TypeScript
npm run start      # or: pm2 start ecosystem.config.js --only companyrun
```

Open `http://localhost:3000/api/health` to verify the API, and `http://localhost:5173` for the dev dashboard.

---

## Configuration

All configuration is done via environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `SUPABASE_URL` | — | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | — | Supabase anonymous/public key |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `OPENROUTER_API_KEY` | — | OpenRouter API key (primary LLM provider) |
| `TOGETHERAI_API_KEY` | — | TogetherAI API key (optional) |
| `ASKCODI_API_KEY` | — | AskCodi API key (optional) |
| `NINE_ROUTER_API_KEY` | — | 9router API key (optional) |
| `INITIAL_COMPANY_BUDGET` | `10000` | Starting virtual currency balance |
| `DEFAULT_TASK_REWARD` | `10` | Credits earned per task completion |
| `IDLE_PENALTY_PER_HOUR` | `1` | Credits deducted for idle agents |
| `KPI_REVIEW_INTERVAL_HOURS` | `24` | Hours between automatic KPI reviews |
| `KPI_WARNING_THRESHOLD` | `50` | KPI score below which agents get warned |
| `KPI_FIRE_THRESHOLD` | `40` | KPI score below which firing is proposed |
| `KPI_FIRE_CONSECUTIVE_REVIEWS` | `3` | Bad reviews needed before fire proposal |
| `ORCHESTRATOR_HEARTBEAT_MS` | `30000` | Orchestrator loop interval (ms) |
| `ORCHESTRATOR_MODEL` | `openai/gpt-4o-mini` | LLM model for orchestrator decisions |
| `ORCHESTRATOR_PROVIDER` | `openrouter` | LLM provider for orchestrator |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS origins (e.g. `http://192.168.0.100`). Leave unset when frontend is served by the same server. |
| `STALL_THRESHOLD_MS` | `1800000` | Milliseconds before a non-responding agent is considered stalled (30 min) |
| `MAX_AUTO_REBOOTS` | `2` | Maximum automatic stall reboots before an alert is raised |

---

## API Overview

All endpoints are prefixed with `/api`. See [`docs/API.md`](docs/API.md) for the full reference.

| Route Group | Endpoints | Description |
|-------------|-----------|-------------|
| **Health** | 1 | Server health check |
| **Company** | 3 | Company overview, config, reports |
| **Agents** | 8 | CRUD, hire/fire, skills, KPI, wallet |
| **Tasks** | 8 | CRUD, assign, review, stats |
| **Economy** | 5 | Overview, transactions, leaderboard, budget, health |
| **Orchestrator** | 5 | Status, commands, decisions (approve/reject) |
| **Skills** | 4 | MCP skill catalog CRUD |
| **Chat** | 3 | Send messages, list conversations |
| **WebSocket** | 6 events | Real-time: agent status, tasks, decisions, economy, chat, heartbeat |

---

## Project Structure

```
CompanyRun/
├── src/                        # Backend source (TypeScript)
│   ├── index.ts                # Entry point
│   ├── config/                 # Environment & database config
│   │   ├── env.ts
│   │   └── database.ts
│   ├── db/                     # Database schema & seed
│   │   ├── schema.ts
│   │   └── seed.ts
│   ├── server/                 # Fastify app & routes
│   │   ├── app.ts
│   │   ├── websocket.ts
│   │   └── routes/
│   │       ├── agents.ts
│   │       ├── chat.ts
│   │       ├── company.ts
│   │       ├── economy.ts
│   │       ├── orchestrator.ts
│   │       ├── skills.ts
│   │       └── tasks.ts
│   ├── agents/                 # Agent management & runtime
│   │   ├── index.ts
│   │   ├── manager.ts
│   │   ├── runtime.ts
│   │   ├── memory.ts
│   │   └── templates.ts
│   ├── orchestrator/           # AI CEO orchestration
│   │   ├── index.ts
│   │   ├── scheduler.ts
│   │   ├── decision-engine.ts
│   │   └── consultation.ts
│   ├── tasks/                  # Task lifecycle
│   │   ├── index.ts
│   │   ├── manager.ts
│   │   ├── queue.ts
│   │   ├── decomposer.ts
│   │   └── reviewer.ts
│   ├── economy/                # Virtual economy
│   │   ├── index.ts
│   │   ├── engine.ts
│   │   ├── wallet.ts
│   │   ├── wages.ts
│   │   └── reports.ts
│   ├── kpi/                    # Performance tracking
│   │   ├── index.ts
│   │   ├── calculator.ts
│   │   ├── metrics.ts
│   │   └── reviewer.ts
│   ├── llm/                    # Multi-provider LLM gateway
│   │   ├── index.ts
│   │   ├── gateway.ts
│   │   ├── tracker.ts
│   │   └── providers/
│   │       ├── base.ts
│   │       ├── openrouter.ts
│   │       ├── togetherai.ts
│   │       ├── askcodi.ts
│   │       └── 9router.ts
│   ├── mcp/                    # MCP tool connections
│   │   ├── index.ts
│   │   ├── manager.ts
│   │   ├── connector.ts
│   │   └── registry.ts
│   └── shared/                 # Shared utilities
│       ├── types.ts
│       ├── errors.ts
│       ├── logger.ts
│       └── utils.ts
├── frontend/                   # React dashboard
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── public/
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       ├── components/
│       │   ├── common/         # StatusBadge, KPIChart, DecisionCard
│       │   └── layout/         # Header, Sidebar, Layout
│       ├── pages/              # Dashboard, Agents, Tasks, Economy, Chat, Settings
│       ├── services/           # api.ts, socket.ts
│       ├── stores/             # Zustand stores
│       └── types/
├── deploy/                     # Deployment configs
│   ├── setup.sh                # RPi deploy script
│   └── nginx/
│       └── companyrun.conf     # nginx reverse proxy
├── docs/                       # Documentation
│   ├── API.md                  # REST API reference
│   └── DEPLOYMENT.md           # Production deploy guide
├── ecosystem.config.js         # PM2 process config
├── Dockerfile                  # Multi-stage Docker build
├── docker-compose.yml          # Docker Compose config
├── drizzle.config.ts           # Drizzle ORM config
├── tsconfig.json               # TypeScript config
├── package.json                # Backend dependencies
├── .env.example                # Environment template
├── .eslintrc.json              # ESLint config
├── .gitignore
├── PLAN.md                     # Full architecture plan
└── README.md                   # ← You are here
```

---

## Development

### Running in Dev Mode

```bash
# Backend with hot-reload (tsx watch)
npm run dev

# Frontend dev server (separate terminal)
cd frontend && npm run dev
```

The backend runs on `http://localhost:3000` and the frontend dev server on `http://localhost:5173` with HMR.

### Useful Commands

```bash
npm run build         # Compile TypeScript → dist/
npm run lint          # Run ESLint
npm run db:generate   # Generate Drizzle migrations
npm run db:migrate    # Apply migrations
npm run db:seed       # Seed initial data

# Frontend
cd frontend
npm run build         # Production build → frontend/dist/
npm run preview       # Preview production build locally
```

### Separated Frontend + Backend

You can run the frontend on your Mac (or any machine) while the backend runs on a Raspberry Pi:

**On the Pi** — add to `.env`:
```
ALLOWED_ORIGINS=http://192.168.0.100,http://localhost:5173
```

**On your Mac** — create `frontend/.env.local`:
```
BACKEND_URL=http://192.168.0.141
```

Then run `cd frontend && npm run dev`. The Vite proxy forwards `/api` and `/socket.io` to the Pi.

For a built frontend hitting a remote backend, set `VITE_API_URL=http://192.168.0.141` before building.

### PM2 in Dev

```bash
pm2 start ecosystem.config.js --only companyrun-dev
pm2 logs companyrun-dev
pm2 monit
```

---

## Production Deployment

CompanyRun is optimized for **Raspberry Pi 4** (ARM64, 8 GB RAM, Ubuntu 24.04). See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the complete guide.

### Quick Deploy

```bash
# On the RPi:
chmod +x deploy/setup.sh
./deploy/setup.sh
```

This will:
1. Verify Node.js, PM2, and nginx are installed
2. Install dependencies and build backend + frontend
3. Run database migrations and seed
4. Configure nginx reverse proxy
5. Start PM2 with production settings
6. Save process list for auto-restart on reboot

### LAN Access

Once deployed, access CompanyRun from any device on the same network:

| Service | URL |
|---------|-----|
| **Dashboard** | `http://<YOUR_DEVICE_IP>` |
| **API** | `http://<YOUR_DEVICE_IP>/api/health` |
| **WebSocket** | `ws://<YOUR_DEVICE_IP>/socket.io/` |

> **💡 Finding your device's IP:** Run `hostname -I` on the device itself,
> or use a LAN scanner from another machine:
> ```bash
> # Using nmap
> nmap -sn 192.168.0.0/24
>
> # Or use the Fing app (iOS/Android) for a visual scanner
> ```

### Docker Alternative

```bash
docker compose up -d
```

See [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml).

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Conventions

- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/)
- **Code style**: ESLint + TypeScript strict mode
- **File naming**: kebab-case for files, PascalCase for React components
- **Branches**: `main` (production), `dev` (development), `feature/*`, `fix/*`

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ❤️ for Raspberry Pi • Powered by AI agents
</p>
