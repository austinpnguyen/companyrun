// ============================================================
// Agent Role Templates — UI defaults & type definitions
//
// Source of truth for system prompts is src/db/seed.ts → DB.
// This file provides the TypeScript interface and a lightweight
// summary of each template for the "hire agent" UI picker.
// The full systemPrompt is loaded from the DB at runtime.
// ============================================================

export interface AgentTemplate {
  name: string;
  role: string;
  tier: 'leadership' | 'worker' | 'specialist' | 'adversarial';
  isAdversarial: boolean;
  adversarialTarget: string | null;
  description: string;
  defaultProvider: string;
  defaultModel: string;
  suggestedSkills: string[];
  baseWage: string;
  personality: {
    creativity: number;
    verbosity: 'concise' | 'normal' | 'detailed';
    tone: 'professional' | 'friendly' | 'technical';
  };
  /**
   * Full system prompt — populated when loading from DB.
   * Optional here because this file is the UI-layer summary;
   * the canonical prompt lives in the database (seed.ts → agent_templates table).
   */
  systemPrompt?: string;
}

// ============================================================
// Worker agents
// ============================================================

const WORKER_TEMPLATES: AgentTemplate[] = [
  {
    name: 'Developer',
    role: 'developer',
    tier: 'worker',
    isAdversarial: false,
    adversarialTarget: null,
    description: 'Code generation, debugging, architecture, and code review.',
    defaultProvider: 'openrouter',
    defaultModel: 'anthropic/claude-sonnet-4',
    suggestedSkills: ['filesystem', 'code-execution'],
    baseWage: '15.00',
    personality: { creativity: 0.3, verbosity: 'concise', tone: 'technical' },
  },
  {
    name: 'Writer',
    role: 'writer',
    tier: 'worker',
    isAdversarial: false,
    adversarialTarget: null,
    description: 'Content creation, editing, translation, and copywriting.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
    suggestedSkills: ['web-browse'],
    baseWage: '12.00',
    personality: { creativity: 0.8, verbosity: 'detailed', tone: 'friendly' },
  },
  {
    name: 'Analyst',
    role: 'analyst',
    tier: 'worker',
    isAdversarial: false,
    adversarialTarget: null,
    description: 'Data analysis, research, reporting, and strategic insights.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
    suggestedSkills: ['web-browse', 'database-query'],
    baseWage: '14.00',
    personality: { creativity: 0.2, verbosity: 'concise', tone: 'professional' },
  },
  {
    name: 'Designer',
    role: 'designer',
    tier: 'worker',
    isAdversarial: false,
    adversarialTarget: null,
    description: 'UI/UX design guidance, design systems, wireframes, accessibility audits.',
    defaultProvider: 'openrouter',
    defaultModel: 'anthropic/claude-sonnet-4',
    suggestedSkills: ['web-browse'],
    baseWage: '13.00',
    personality: { creativity: 0.7, verbosity: 'normal', tone: 'friendly' },
  },
  {
    name: 'Support',
    role: 'support',
    tier: 'worker',
    isAdversarial: false,
    adversarialTarget: null,
    description: 'Customer response, issue triage, FAQ handling, help desk.',
    defaultProvider: 'togetherai',
    defaultModel: 'meta-llama/llama-3.1-70b-instruct',
    suggestedSkills: ['web-browse'],
    baseWage: '8.00',
    personality: { creativity: 0.4, verbosity: 'concise', tone: 'friendly' },
  },
];

// ============================================================
// Adversarial agents — critique rather than produce
// Automatically assigned by orchestrator to review outputs
// ============================================================

const ADVERSARIAL_TEMPLATES: AgentTemplate[] = [
  {
    name: 'Auditor',
    role: 'auditor',
    tier: 'adversarial',
    isAdversarial: true,
    adversarialTarget: 'all',
    description: 'Stress-tests outputs for logic errors, unsupported claims, and missing edge cases.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
    suggestedSkills: [],
    baseWage: '16.00',
    personality: { creativity: 0.1, verbosity: 'concise', tone: 'professional' },
  },
  {
    name: "Devil's Advocate",
    role: 'devils-advocate',
    tier: 'adversarial',
    isAdversarial: true,
    adversarialTarget: 'plans',
    description: 'Challenges weak assumptions and articulates the most plausible failure scenario.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
    suggestedSkills: [],
    baseWage: '14.00',
    personality: { creativity: 0.3, verbosity: 'concise', tone: 'professional' },
  },
  {
    name: 'Competitor',
    role: 'competitor',
    tier: 'adversarial',
    isAdversarial: true,
    adversarialTarget: 'product',
    description: 'Simulates a well-funded competitor to force honest moat analysis.',
    defaultProvider: 'openrouter',
    defaultModel: 'openai/gpt-4o',
    suggestedSkills: [],
    baseWage: '14.00',
    personality: { creativity: 0.5, verbosity: 'concise', tone: 'professional' },
  },
];

// ============================================================
// Public API
// ============================================================

export const ALL_TEMPLATES: AgentTemplate[] = [
  ...WORKER_TEMPLATES,
  ...ADVERSARIAL_TEMPLATES,
];

/** Get all templates (worker + adversarial) */
export function getBuiltinTemplates(): AgentTemplate[] {
  return [...ALL_TEMPLATES];
}

/** Get only worker templates (for the "hire" flow) */
export function getWorkerTemplates(): AgentTemplate[] {
  return [...WORKER_TEMPLATES];
}

/** Get only adversarial templates */
export function getAdversarialTemplates(): AgentTemplate[] {
  return [...ADVERSARIAL_TEMPLATES];
}

/** Find a template by role identifier */
export function getTemplateByRole(role: string): AgentTemplate | undefined {
  return ALL_TEMPLATES.find(
    (t) => t.role.toLowerCase() === role.toLowerCase(),
  );
}
