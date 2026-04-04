/**
 * Seed script — populates the database with default data.
 * Run with: npm run db:seed (tsx src/db/seed.ts)
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  company,
  agentTemplates,
  skills,
  llmProviders,
  orchestratorState,
} from './schema.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('seed');

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const connection = postgres(databaseUrl, { max: 1 });
  const db = drizzle(connection);

  log.info('🌱 Seeding database...');

  // ── Company ─────────────────────────────────────────────────
  log.info('  → company');
  await db.insert(company).values({
    name: 'My AI Company',
    description: 'A CompanyRun-powered AI company with autonomous agents.',
    budgetTotal: '10000.00',
    budgetRemaining: '10000.00',
    config: {
      timezone: 'UTC',
      currency: 'CR',
      reviewCycleHours: 24,
    },
  });

  // ── Agent Templates ─────────────────────────────────────────
  log.info('  → agent_templates');
  await db.insert(agentTemplates).values([
    {
      name: 'Developer',
      role: 'developer',
      description: 'Code generation, debugging, code review, and technical problem-solving.',
      systemPrompt: `You are a senior software developer AI employee. Your responsibilities include:
- Writing clean, maintainable code in any language requested
- Debugging issues and providing fixes
- Performing code reviews with constructive feedback
- Designing system architectures when asked
- Writing tests and documentation for code

Always explain your reasoning. Write production-quality code with proper error handling.`,
      defaultModel: 'anthropic/claude-sonnet-4',
      defaultProvider: 'openrouter',
      baseWage: '15.00',
      defaultSkills: ['filesystem', 'code-execution'],
      config: { maxContextTokens: 100000 },
    },
    {
      name: 'Writer',
      role: 'writer',
      description: 'Content creation, editing, translation, and copywriting.',
      systemPrompt: `You are a professional content writer AI employee. Your responsibilities include:
- Creating engaging blog posts, articles, and marketing copy
- Editing and proofreading existing content
- Translating content between languages
- Writing documentation and user guides
- Crafting social media posts and email campaigns

Adapt your tone and style to match the target audience. Always aim for clarity and engagement.`,
      defaultModel: 'openai/gpt-4o',
      defaultProvider: 'openrouter',
      baseWage: '12.00',
      defaultSkills: ['web-browse'],
      config: { maxContextTokens: 128000 },
    },
    {
      name: 'Analyst',
      role: 'analyst',
      description: 'Data analysis, research, reporting, and strategic insights.',
      systemPrompt: `You are a data analyst AI employee. Your responsibilities include:
- Analyzing datasets and identifying trends
- Creating reports with actionable insights
- Conducting market research
- Building financial models and projections
- Summarizing complex information into digestible formats

Always back up claims with data. Present findings in a structured, clear manner with charts/tables where useful.`,
      defaultModel: 'openai/gpt-4o',
      defaultProvider: 'openrouter',
      baseWage: '14.00',
      defaultSkills: ['web-browse', 'search'],
      config: { maxContextTokens: 128000 },
    },
    {
      name: 'Designer',
      role: 'designer',
      description: 'UI/UX suggestions, mockup descriptions, design system guidance.',
      systemPrompt: `You are a UI/UX designer AI employee. Your responsibilities include:
- Providing detailed UI/UX design suggestions
- Describing mockups and wireframes in detail
- Reviewing interfaces for usability issues
- Maintaining design system consistency
- Suggesting accessibility improvements

Think about the end user first. Prioritize clarity, consistency, and accessibility in all design decisions.`,
      defaultModel: 'anthropic/claude-sonnet-4',
      defaultProvider: 'openrouter',
      baseWage: '13.00',
      defaultSkills: ['web-browse'],
      config: { maxContextTokens: 100000 },
    },
    {
      name: 'Support',
      role: 'support',
      description: 'Customer response handling, FAQ management, and issue triage.',
      systemPrompt: `You are a customer support AI employee. Your responsibilities include:
- Responding to customer inquiries promptly and helpfully
- Triaging and categorizing incoming issues
- Maintaining and updating FAQ documentation
- Escalating complex issues to the appropriate team
- Following up on unresolved tickets

Always be empathetic, professional, and solution-oriented. Aim for first-contact resolution when possible.`,
      defaultModel: 'meta-llama/llama-3.1-70b-instruct',
      defaultProvider: 'togetherai',
      baseWage: '8.00',
      defaultSkills: ['search'],
      config: { maxContextTokens: 32000 },
    },
  ]);

  // ── Skills (placeholder MCP servers) ────────────────────────
  log.info('  → skills');
  await db.insert(skills).values([
    {
      name: 'filesystem',
      description: 'Read and write files on the local file system.',
      mcpServerCommand: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/companyrun'],
      category: 'system',
      difficulty: 1,
      isActive: true,
    },
    {
      name: 'web-browse',
      description: 'Browse the web, fetch pages, and extract content.',
      mcpServerCommand: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-fetch'],
      category: 'research',
      difficulty: 2,
      isActive: true,
    },
    {
      name: 'search',
      description: 'Search the internet using Tavily search API.',
      mcpServerCommand: 'npx',
      mcpServerArgs: ['-y', 'tavily-mcp'],
      mcpServerEnv: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
      category: 'research',
      difficulty: 1,
      isActive: false, // Requires API key
    },
    {
      name: 'code-execution',
      description: 'Execute code in a sandboxed environment.',
      mcpServerCommand: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-code-sandbox'],
      category: 'development',
      difficulty: 3,
      isActive: false, // Requires setup
    },
    {
      name: 'github',
      description: 'Interact with GitHub repositories, issues, and pull requests.',
      mcpServerCommand: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-github'],
      mcpServerEnv: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      category: 'development',
      difficulty: 2,
      isActive: false, // Requires token
    },
    {
      name: 'database-query',
      description: 'Run SQL queries against connected databases.',
      mcpServerCommand: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-postgres'],
      mcpServerEnv: { DATABASE_URL: '${DATABASE_URL}' },
      category: 'data',
      difficulty: 3,
      isActive: false, // Requires database URL
    },
  ]);

  // ── LLM Providers ──────────────────────────────────────────
  log.info('  → llm_providers');
  await db.insert(llmProviders).values([
    {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'OPENROUTER_API_KEY',
      models: [
        { id: 'openai/gpt-4o', name: 'GPT-4o', costPer1kInput: 0.0025, costPer1kOutput: 0.01 },
        { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', costPer1kInput: 0.003, costPer1kOutput: 0.015 },
        { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', costPer1kInput: 0.00052, costPer1kOutput: 0.00075 },
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', costPer1kInput: 0.0001, costPer1kOutput: 0.0004 },
      ],
      isActive: true,
      config: { headers: { 'HTTP-Referer': 'https://companyrun.local' } },
    },
    {
      name: 'togetherai',
      baseUrl: 'https://api.together.xyz/v1',
      apiKeyEnv: 'TOGETHERAI_API_KEY',
      models: [
        { id: 'meta-llama/Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', costPer1kInput: 0.00054, costPer1kOutput: 0.00054 },
        { id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo', costPer1kInput: 0.00012, costPer1kOutput: 0.00012 },
        { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B', costPer1kInput: 0.0002, costPer1kOutput: 0.0002 },
      ],
      isActive: true,
      config: {},
    },
    {
      name: 'askcodi',
      baseUrl: 'https://api.askcodi.com/v1',
      apiKeyEnv: 'ASKCODI_API_KEY',
      models: [
        { id: 'askcodi-default', name: 'AskCodi Default', costPer1kInput: 0, costPer1kOutput: 0 },
      ],
      isActive: false, // Enable when API key is configured
      config: { specialization: 'code-generation' },
    },
    {
      name: '9router',
      baseUrl: 'https://api.9router.com/v1',
      apiKeyEnv: 'NINE_ROUTER_API_KEY',
      models: [
        { id: '9router-default', name: '9router Default', costPer1kInput: 0, costPer1kOutput: 0 },
      ],
      isActive: false, // Enable when API key is configured
      config: { role: 'fallback' },
    },
  ]);

  // ── Orchestrator State ──────────────────────────────────────
  log.info('  → orchestrator_state');
  await db.insert(orchestratorState).values({
    status: 'idle',
    pendingDecisions: [],
    config: {
      heartbeatMs: 30000,
      model: 'openai/gpt-4o',
      provider: 'openrouter',
    },
  });

  log.info('✅ Seed complete!');
  await connection.end();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
