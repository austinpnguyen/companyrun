// ============================================================
// Task Decomposer — LLM-powered breakdown of complex tasks
// ============================================================

import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { safeJsonParse } from '../shared/utils.js';
import { llmGateway } from '../llm/index.js';
import { taskManager } from './manager.js';
import type { Task } from '../shared/types.js';

const log = createLogger('tasks:decomposer');

// ============================================================
// Types
// ============================================================

export interface DecompositionResult {
  parentTaskId: string;
  subtasks: {
    title: string;
    description: string;
    requiredSkills: string[];
    complexity: number;
    priority: string;
  }[];
}

// ============================================================
// System prompt for task decomposition
// ============================================================

const DECOMPOSITION_SYSTEM_PROMPT = `You are a task decomposition expert. Given a complex task, break it down into smaller, manageable subtasks.

Rules:
- Create between 2 and 5 subtasks
- Each subtask should be independently executable
- Subtask complexity should be 1–3 (simpler than the parent)
- Assign relevant required skills to each subtask (e.g., "coding", "writing", "analysis", "design", "research")
- Subtasks should collectively cover the full scope of the parent task
- Each subtask needs a clear, actionable title and description

Respond ONLY with a valid JSON array of subtask objects. No extra text, no markdown fences.

Example output:
[
  {
    "title": "Research API options",
    "description": "Investigate available APIs and compare features, pricing, and rate limits.",
    "requiredSkills": ["research", "analysis"],
    "complexity": 2
  },
  {
    "title": "Implement API integration",
    "description": "Write the code to integrate with the selected API including authentication and error handling.",
    "requiredSkills": ["coding"],
    "complexity": 3
  }
]`;

// ============================================================
// TaskDecomposer
// ============================================================

export class TaskDecomposer {
  // ----------------------------------------------------------
  // Analyze a task and decide if it should be decomposed
  // Rule: decompose if complexity >= 4 OR description > 500 chars
  // ----------------------------------------------------------

  async shouldDecompose(task: Task): Promise<boolean> {
    const complexity = task.complexity ?? 1;
    const descriptionLength = (task.description ?? '').length;

    const should = complexity >= 4 || descriptionLength > 500;

    log.debug(
      { taskId: task.id, complexity, descriptionLength, shouldDecompose: should },
      'Decomposition check',
    );

    return should;
  }

  // ----------------------------------------------------------
  // Decompose a task into subtasks using LLM
  // ----------------------------------------------------------

  async decompose(task: Task): Promise<DecompositionResult> {
    log.info({ taskId: task.id, title: task.title }, 'Decomposing task');

    const userPrompt = [
      `Task Title: ${task.title}`,
      `Description: ${task.description ?? 'No description provided.'}`,
      `Current Complexity: ${task.complexity ?? 1}`,
      `Priority: ${task.priority ?? 'normal'}`,
      `Required Skills: ${((task.requiredSkills as string[]) ?? []).join(', ') || 'none specified'}`,
      '',
      'Break this task into 2–5 smaller subtasks. Respond with a JSON array only.',
    ].join('\n');

    const response = await llmGateway.chatWithFallback({
      model: env.ORCHESTRATOR_MODEL,
      messages: [
        { role: 'system', content: DECOMPOSITION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const rawContent = response.choices[0]?.message?.content ?? '[]';

    // Strip markdown code fences if present
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const subtaskData = safeJsonParse<
      Array<{
        title: string;
        description: string;
        requiredSkills: string[];
        complexity: number;
      }>
    >(cleaned, []);

    if (!Array.isArray(subtaskData) || subtaskData.length === 0) {
      log.warn({ taskId: task.id, rawContent }, 'LLM returned no valid subtasks');
      // Fallback: create a single subtask mirroring the parent
      return {
        parentTaskId: task.id,
        subtasks: [
          {
            title: `Execute: ${task.title}`,
            description: task.description ?? task.title,
            requiredSkills: (task.requiredSkills as string[]) ?? [],
            complexity: Math.min((task.complexity ?? 1), 3),
            priority: task.priority ?? 'normal',
          },
        ],
      };
    }

    const parentPriority = task.priority ?? 'normal';

    const subtasks = subtaskData.slice(0, 5).map((st) => ({
      title: st.title ?? 'Untitled subtask',
      description: st.description ?? '',
      requiredSkills: Array.isArray(st.requiredSkills) ? st.requiredSkills : [],
      complexity: Math.min(Math.max(st.complexity ?? 1, 1), 3),
      priority: parentPriority,
    }));

    log.info(
      { taskId: task.id, subtaskCount: subtasks.length },
      'Task decomposed successfully',
    );

    return {
      parentTaskId: task.id,
      subtasks,
    };
  }

  // ----------------------------------------------------------
  // Create subtasks in the database from decomposition result
  // ----------------------------------------------------------

  async createSubtasks(result: DecompositionResult): Promise<Task[]> {
    const createdTasks: Task[] = [];

    for (const subtask of result.subtasks) {
      const task = await taskManager.create({
        title: subtask.title,
        description: subtask.description,
        requiredSkills: subtask.requiredSkills,
        complexity: subtask.complexity,
        priority: subtask.priority as 'urgent' | 'high' | 'normal' | 'low',
        parentTaskId: result.parentTaskId,
        createdBy: 'orchestrator',
      });

      createdTasks.push(task);
    }

    log.info(
      {
        parentTaskId: result.parentTaskId,
        subtaskIds: createdTasks.map((t) => t.id),
      },
      'Subtasks created in database',
    );

    return createdTasks;
  }

  // ----------------------------------------------------------
  // Check if all subtasks of a parent are completed
  // ----------------------------------------------------------

  async areSubtasksComplete(parentTaskId: string): Promise<boolean> {
    const subtasks = await taskManager.getSubtasks(parentTaskId);

    if (subtasks.length === 0) {
      return true;
    }

    return subtasks.every((t) => t.status === 'completed');
  }

  // ----------------------------------------------------------
  // Aggregate subtask results into parent task result
  // ----------------------------------------------------------

  async aggregateResults(parentTaskId: string): Promise<Record<string, unknown>> {
    const subtasks = await taskManager.getSubtasks(parentTaskId);

    const subtaskResults = subtasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      result: t.result,
      completedAt: t.completedAt,
    }));

    const completedCount = subtasks.filter((t) => t.status === 'completed').length;
    const failedCount = subtasks.filter((t) => t.status === 'failed').length;

    const aggregated: Record<string, unknown> = {
      subtaskCount: subtasks.length,
      completedCount,
      failedCount,
      allComplete: completedCount === subtasks.length,
      subtaskResults,
    };

    log.info(
      { parentTaskId, completedCount, failedCount, total: subtasks.length },
      'Subtask results aggregated',
    );

    return aggregated;
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const taskDecomposer = new TaskDecomposer();
