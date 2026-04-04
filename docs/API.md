# CompanyRun — API Reference

> Base URL: `http://<host>/api`

All responses are JSON. Errors follow a consistent format:

```json
{
  "error": "NotFoundError",
  "message": "Agent abc-123 not found",
  "statusCode": 404
}
```

---

## Table of Contents

- [Health](#health)
- [Company](#company)
- [Agents](#agents)
- [Tasks](#tasks)
- [Economy](#economy)
- [Orchestrator](#orchestrator)
- [Skills](#skills)
- [Chat](#chat)
- [WebSocket Events](#websocket-events)

---

## Health

### `GET /api/health`

Server health check.

**Response** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2026-04-03T19:00:00.000Z",
  "version": "0.1.0",
  "uptime": 3600.5
}
```

---

## Company

### `GET /api/company`

Get company overview with agent count and task statistics.

**Response** `200 OK`

```json
{
  "company": {
    "id": "uuid",
    "name": "My AI Company",
    "description": "An AI-powered company",
    "config": {},
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-04-03T19:00:00.000Z"
  },
  "activeAgents": 5,
  "taskStats": {
    "pending": 3,
    "in_progress": 2,
    "completed": 45,
    "failed": 1
  }
}
```

---

### `PUT /api/company/config`

Update company settings.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Company name |
| `description` | string | No | Company description |
| `config` | object | No | Arbitrary config object |

**Example Request**

```json
{
  "name": "CompanyRun HQ",
  "description": "AI agents running the show"
}
```

**Response** `200 OK`

```json
{
  "company": { "id": "...", "name": "CompanyRun HQ", "..." : "..." }
}
```

---

### `GET /api/company/report`

Generate a daily financial report.

**Response** `200 OK`

```json
{
  "report": {
    "period": "2026-04-03",
    "revenue": 500,
    "expenses": 320,
    "profit": 180,
    "agentCosts": [...],
    "taskCompletions": 12
  },
  "summary": "Daily report for April 3, 2026: 12 tasks completed, net profit 180 credits..."
}
```

---

## Agents

### `GET /api/agents`

List all agents with optional status filter.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status: `active`, `idle`, `fired`, `suspended` |

**Response** `200 OK`

```json
{
  "agents": [
    {
      "id": "agent-uuid",
      "name": "Alice",
      "role": "developer",
      "status": "active",
      "model": "openai/gpt-4o",
      "provider": "openrouter",
      "personality": "methodical and detail-oriented",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### `GET /api/agents/:id`

Get detailed information about a specific agent.

**Response** `200 OK`

```json
{
  "agent": {
    "id": "agent-uuid",
    "name": "Alice",
    "role": "developer",
    "status": "active",
    "model": "openai/gpt-4o",
    "provider": "openrouter",
    "systemPrompt": "You are a senior software developer...",
    "personality": "methodical and detail-oriented",
    "skills": ["code-review", "testing"],
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Error** `404 Not Found` — Agent does not exist.

---

### `POST /api/agents/hire`

Hire a new AI agent from a template.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Display name for the agent |
| `templateRole` | string | No | Role template: `developer`, `writer`, `analyst`, etc. |

**Example Request**

```json
{
  "name": "Bob",
  "templateRole": "writer"
}
```

**Response** `201 Created`

```json
{
  "message": "Agent \"Bob\" hired successfully",
  "agentId": "new-agent-uuid",
  "agent": { "id": "new-agent-uuid", "name": "Bob", "role": "writer", "..." : "..." }
}
```

---

### `PUT /api/agents/:id`

Update agent configuration.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Agent display name |
| `systemPrompt` | string | No | Agent system prompt |
| `model` | string | No | LLM model identifier |
| `provider` | string | No | LLM provider name |
| `personality` | string | No | Personality description |

**Response** `200 OK`

```json
{
  "agent": { "id": "...", "name": "Updated Name", "..." : "..." }
}
```

---

### `POST /api/agents/:id/fire`

Fire an agent (graceful shutdown).

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | No | Termination reason (default: "Terminated by user") |

**Response** `200 OK`

```json
{
  "message": "Agent agent-uuid has been fired",
  "reason": "Poor performance on code reviews"
}
```

---

### `POST /api/agents/:id/skills`

Assign an MCP skill to an agent.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skillNameOrId` | string | **Yes** | Skill name or UUID to assign |

**Response** `201 Created`

```json
{
  "message": "Skill \"code-review\" assigned to agent agent-uuid"
}
```

---

### `DELETE /api/agents/:id/skills/:skillId`

Remove an MCP skill from an agent.

**Response** `200 OK`

```json
{
  "message": "Skill skill-uuid removed from agent agent-uuid"
}
```

---

### `GET /api/agents/:id/kpi`

Get agent KPI review history.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 20 | Max reviews to return |

**Response** `200 OK`

```json
{
  "agentId": "agent-uuid",
  "reviews": [
    {
      "id": "review-uuid",
      "score": 78,
      "taskCompletionRate": 0.92,
      "qualityAverage": 4.1,
      "speedScore": 65,
      "warnings": [],
      "reviewedAt": "2026-04-03T06:00:00.000Z"
    }
  ]
}
```

---

### `GET /api/agents/:id/wallet`

Get agent wallet balance and transaction history.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Max transactions to return |
| `type` | string | — | Filter by transaction type |

**Response** `200 OK`

```json
{
  "agentId": "agent-uuid",
  "wallet": {
    "balance": 450,
    "totalEarned": 600,
    "totalSpent": 150
  },
  "transactions": [
    {
      "id": "txn-uuid",
      "type": "task_reward",
      "amount": 10,
      "description": "Completed: Fix login bug",
      "createdAt": "2026-04-03T15:00:00.000Z"
    }
  ]
}
```

---

## Tasks

### `GET /api/tasks`

List tasks with optional filters.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status |
| `priority` | string | — | Filter by priority: `low`, `medium`, `high`, `critical` |
| `assignedAgentId` | string | — | Filter by assigned agent |
| `limit` | number | — | Max results |
| `offset` | number | — | Pagination offset |

**Response** `200 OK`

```json
{
  "tasks": [
    {
      "id": "task-uuid",
      "title": "Fix login bug",
      "description": "Users cannot log in with email",
      "status": "in_progress",
      "priority": "high",
      "complexity": 3,
      "assignedAgentId": "agent-uuid",
      "requiredSkills": ["debugging"],
      "createdBy": "user",
      "createdAt": "2026-04-03T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### `POST /api/tasks`

Create a new task.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | **Yes** | Task title |
| `description` | string | No | Detailed description |
| `priority` | string | No | `low`, `medium`, `high`, `critical` |
| `complexity` | number | No | 1–5 scale |
| `requiredSkills` | string[] | No | Skills needed to complete |

**Example Request**

```json
{
  "title": "Write unit tests for auth module",
  "description": "Cover all edge cases in the authentication flow",
  "priority": "medium",
  "complexity": 3,
  "requiredSkills": ["testing", "typescript"]
}
```

**Response** `201 Created`

```json
{
  "task": { "id": "new-task-uuid", "title": "Write unit tests for auth module", "..." : "..." }
}
```

---

### `GET /api/tasks/:id`

Get task details.

**Response** `200 OK`

```json
{
  "task": { "id": "task-uuid", "title": "...", "status": "...", "..." : "..." }
}
```

**Error** `404 Not Found` — Task does not exist.

---

### `PUT /api/tasks/:id`

Update a task.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | No | Updated title |
| `description` | string | No | Updated description |
| `priority` | string | No | Updated priority |
| `complexity` | number | No | Updated complexity |
| `requiredSkills` | string[] | No | Updated skills list |
| `status` | string | No | Updated status |
| `deadline` | string | No | ISO 8601 date string |

**Response** `200 OK`

```json
{
  "task": { "id": "task-uuid", "..." : "..." }
}
```

---

### `DELETE /api/tasks/:id`

Delete a task.

**Response** `200 OK`

```json
{
  "message": "Task task-uuid deleted"
}
```

---

### `POST /api/tasks/:id/assign`

Assign a task to an agent.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | **Yes** | Agent to assign the task to |

**Response** `200 OK`

```json
{
  "task": { "id": "task-uuid", "assignedAgentId": "agent-uuid", "status": "assigned", "..." : "..." }
}
```

---

### `POST /api/tasks/:id/review`

Submit a manual review for a completed task.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `score` | number | **Yes** | Review score (1–5) |
| `feedback` | string | **Yes** | Review feedback text |

**Example Request**

```json
{
  "score": 4,
  "feedback": "Good implementation, minor style issues"
}
```

**Response** `200 OK`

```json
{
  "review": {
    "taskId": "task-uuid",
    "score": 4,
    "feedback": "Good implementation, minor style issues",
    "approved": true,
    "reviewedAt": "2026-04-03T18:00:00.000Z"
  }
}
```

---

### `GET /api/tasks/stats`

Get task statistics grouped by status.

**Response** `200 OK`

```json
{
  "stats": {
    "pending": 5,
    "assigned": 2,
    "in_progress": 3,
    "completed": 42,
    "failed": 1,
    "total": 53
  }
}
```

---

## Economy

### `GET /api/economy/overview`

Get financial overview of the virtual economy.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `periodDays` | number | — | Period in days for the report |

**Response** `200 OK`

```json
{
  "overview": {
    "budget": 7500,
    "totalSpent": 2500,
    "totalEarned": 0,
    "agentCount": 5,
    "averageWage": 50,
    "burnRate": 120,
    "runwayDays": 62
  }
}
```

---

### `GET /api/economy/transactions`

Get transaction history for a specific agent.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `agentId` | string | **Required** | Agent to query transactions for |
| `type` | string | — | Filter by transaction type |
| `limit` | number | 50 | Max transactions |
| `offset` | number | 0 | Pagination offset |

**Response** `200 OK`

```json
{
  "transactions": [
    {
      "id": "txn-uuid",
      "agentId": "agent-uuid",
      "type": "task_reward",
      "amount": 10,
      "description": "Completed: Fix login bug",
      "createdAt": "2026-04-03T15:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### `GET /api/economy/leaderboard`

Get top-earning agents.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 10 | Number of top earners |

**Response** `200 OK`

```json
{
  "leaderboard": [
    {
      "agentId": "agent-uuid",
      "agentName": "Alice",
      "totalEarned": 450,
      "balance": 320,
      "tasksCompleted": 28
    }
  ]
}
```

---

### `POST /api/economy/budget`

Adjust the company budget.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | **Yes** | Positive number |
| `action` | string | **Yes** | `"add"` or `"deduct"` |

**Example Request**

```json
{
  "amount": 5000,
  "action": "add"
}
```

**Response** `200 OK`

```json
{
  "message": "Budget increased by 5000",
  "budgetRemaining": 12500
}
```

---

### `GET /api/economy/health`

Financial health check.

**Response** `200 OK`

```json
{
  "health": {
    "status": "healthy",
    "budget": 7500,
    "burnRate": 120,
    "runwayDays": 62,
    "warnings": []
  }
}
```

---

## Orchestrator

### `GET /api/orchestrator/status`

Get current orchestrator status and metrics.

**Response** `200 OK`

```json
{
  "status": {
    "running": true,
    "uptime": 86400,
    "lastHeartbeat": "2026-04-03T19:00:00.000Z",
    "activeAgents": 5,
    "pendingTasks": 3,
    "pendingDecisions": 1,
    "model": "openai/gpt-4o",
    "provider": "openrouter"
  }
}
```

---

### `POST /api/orchestrator/command`

Send a natural-language command to the orchestrator.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | **Yes** | Command text (e.g., "Hire a new developer") |

**Example Request**

```json
{
  "command": "Review agent performance and suggest improvements"
}
```

**Response** `200 OK`

```json
{
  "result": "I've reviewed all agent performance metrics. Alice is performing well with a KPI of 85. Bob needs improvement in task completion speed..."
}
```

---

### `GET /api/orchestrator/decisions`

Get pending decisions awaiting user approval.

**Response** `200 OK`

```json
{
  "decisions": [
    {
      "id": "decision-uuid",
      "type": "fire_agent",
      "agentId": "agent-uuid",
      "agentName": "Charlie",
      "reason": "KPI below threshold for 3 consecutive reviews",
      "proposedAt": "2026-04-03T06:00:00.000Z",
      "status": "pending"
    }
  ],
  "total": 1
}
```

---

### `POST /api/orchestrator/decisions/:id/approve`

Approve a pending decision.

**Response** `200 OK`

```json
{
  "message": "Decision decision-uuid approved",
  "decisionId": "decision-uuid"
}
```

---

### `POST /api/orchestrator/decisions/:id/reject`

Reject a pending decision.

**Response** `200 OK`

```json
{
  "message": "Decision decision-uuid rejected",
  "decisionId": "decision-uuid"
}
```

---

## Skills

### `GET /api/skills`

List all available MCP skills in the catalog.

**Response** `200 OK`

```json
{
  "skills": [
    {
      "id": "skill-uuid",
      "name": "code-review",
      "description": "Automated code review via MCP",
      "serverCommand": "npx",
      "serverArgs": ["-y", "@mcp/code-review"],
      "category": "development",
      "difficulty": 2
    }
  ],
  "total": 1
}
```

---

### `POST /api/skills`

Register a new MCP skill.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Skill name |
| `description` | string | No | What the skill does |
| `serverCommand` | string | **Yes** | MCP server command |
| `serverArgs` | string[] | No | Command arguments |
| `serverEnv` | object | No | Environment variables for the MCP server |
| `category` | string | No | Skill category (default: `"general"`) |
| `difficulty` | number | No | Difficulty level 1–5 (default: 1) |

**Example Request**

```json
{
  "name": "web-search",
  "description": "Search the web using Tavily",
  "serverCommand": "npx",
  "serverArgs": ["-y", "@mcp/tavily-search"],
  "serverEnv": { "TAVILY_API_KEY": "..." },
  "category": "research",
  "difficulty": 1
}
```

**Response** `201 Created`

```json
{
  "skill": { "id": "new-skill-uuid", "name": "web-search", "..." : "..." }
}
```

---

### `GET /api/skills/:id`

Get skill details.

**Response** `200 OK`

```json
{
  "skill": { "id": "skill-uuid", "name": "...", "..." : "..." }
}
```

**Error** `404 Not Found` — Skill does not exist.

---

### `PUT /api/skills/:id`

Update skill configuration.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated name |
| `description` | string | No | Updated description |
| `serverCommand` | string | No | Updated command |
| `serverArgs` | string[] | No | Updated arguments |
| `serverEnv` | object | No | Updated env vars |
| `category` | string | No | Updated category |
| `difficulty` | number | No | Updated difficulty |

**Response** `200 OK`

```json
{
  "skill": { "id": "skill-uuid", "..." : "..." }
}
```

---

## Chat

### `POST /api/chat`

Send a message to an agent or the orchestrator.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | **Yes** | Message content |
| `agentId` | string | No | Target agent (omit to route to orchestrator) |
| `conversationId` | string | No | Existing conversation (omit to create new) |

**Example — Chat with agent**

```json
{
  "agentId": "agent-uuid",
  "message": "Can you review the latest PR?"
}
```

**Response** `200 OK`

```json
{
  "conversationId": "conv-uuid",
  "response": "Sure! I'll take a look at the PR right away. Let me review the changes...",
  "toolCalls": [],
  "tokensUsed": { "prompt": 150, "completion": 85 }
}
```

**Example — Chat with orchestrator**

```json
{
  "message": "What's the status of the company?"
}
```

**Response** `200 OK`

```json
{
  "conversationId": "conv-uuid",
  "response": "The company is running smoothly with 5 active agents...",
  "source": "orchestrator"
}
```

---

### `GET /api/chat/conversations`

List conversations.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `agentId` | string | — | Filter by agent |
| `limit` | number | 50 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response** `200 OK`

```json
{
  "conversations": [
    {
      "id": "conv-uuid",
      "agentId": "agent-uuid",
      "type": "chat",
      "createdAt": "2026-04-03T14:00:00.000Z",
      "updatedAt": "2026-04-03T18:30:00.000Z"
    }
  ],
  "total": 1
}
```

---

### `GET /api/chat/conversations/:id`

Get messages in a conversation.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 100 | Max messages |
| `offset` | number | 0 | Pagination offset |

**Response** `200 OK`

```json
{
  "conversation": {
    "id": "conv-uuid",
    "agentId": "agent-uuid",
    "type": "chat"
  },
  "messages": [
    {
      "id": "msg-uuid",
      "conversationId": "conv-uuid",
      "role": "user",
      "content": "Can you review the latest PR?",
      "createdAt": "2026-04-03T14:00:00.000Z"
    },
    {
      "id": "msg-uuid-2",
      "conversationId": "conv-uuid",
      "role": "assistant",
      "content": "Sure! I'll take a look...",
      "toolCalls": null,
      "tokenCount": 85,
      "createdAt": "2026-04-03T14:00:05.000Z"
    }
  ],
  "total": 2
}
```

**Error** `404 Not Found` — Conversation does not exist.

---

## WebSocket Events

CompanyRun uses **Socket.io** for real-time updates. Connect to the same host on the default namespace.

### Connection

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);
});
```

### Event Types

#### `agent:status`

Emitted when an agent's status changes (hired, fired, active, idle).

```json
{
  "agentId": "agent-uuid",
  "status": "active",
  "timestamp": 1712170800000
}
```

#### `task:update`

Emitted when a task status changes or is assigned.

```json
{
  "taskId": "task-uuid",
  "status": "assigned",
  "data": { "agentId": "agent-uuid" },
  "timestamp": 1712170800000
}
```

#### `orchestrator:decision`

Emitted when a decision is created, approved, or rejected.

```json
{
  "decision": {
    "id": "decision-uuid",
    "status": "pending"
  },
  "timestamp": 1712170800000
}
```

#### `economy:transaction`

Emitted when a financial transaction occurs.

```json
{
  "transaction": {
    "type": "budget_adjustment",
    "action": "add",
    "amount": 5000,
    "remaining": 12500
  },
  "timestamp": 1712170800000
}
```

#### `chat:message`

Emitted when a new chat message is received.

```json
{
  "conversationId": "conv-uuid",
  "message": {
    "role": "assistant",
    "content": "Task completed successfully!",
    "agentId": "agent-uuid",
    "agentName": "Alice"
  },
  "timestamp": 1712170800000
}
```

#### `system:heartbeat`

Periodic system heartbeat from the orchestrator.

```json
{
  "status": {
    "running": true,
    "activeAgents": 5,
    "pendingTasks": 3
  },
  "timestamp": 1712170800000
}
```

### Client-Side Ping

Send a `ping` event to measure latency:

```javascript
socket.emit("ping");
socket.on("pong", (data) => {
  console.log("Server time:", data.timestamp);
});
```
