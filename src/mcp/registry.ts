// ============================================================
// MCP Registry — Skill catalog with DB persistence
// ============================================================

import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { skills, agentSkills } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';

const log = createLogger('mcp:registry');

// ============================================================
// Types
// ============================================================

export interface MCPSkillDefinition {
  id: string;
  name: string;
  description: string;
  serverCommand: string;
  serverArgs: string[];
  serverEnv?: Record<string, string>;
  category: string;
  difficulty: number;
}

// ============================================================
// MCPRegistry
// ============================================================

export class MCPRegistry {
  // ----------------------------------------------------------
  // Load all active skills from the database
  // ----------------------------------------------------------

  async loadSkills(): Promise<MCPSkillDefinition[]> {
    const rows = await db
      .select()
      .from(skills)
      .where(eq(skills.isActive, true));

    log.info({ count: rows.length }, 'Loaded skills from database');

    return rows.map((row) => this.rowToDefinition(row));
  }

  // ----------------------------------------------------------
  // Register a new skill (insert into DB)
  // ----------------------------------------------------------

  async registerSkill(
    skill: Omit<MCPSkillDefinition, 'id'>,
  ): Promise<MCPSkillDefinition> {
    const [row] = await db
      .insert(skills)
      .values({
        name: skill.name,
        description: skill.description,
        mcpServerCommand: skill.serverCommand,
        mcpServerArgs: skill.serverArgs,
        mcpServerEnv: skill.serverEnv ?? {},
        category: skill.category,
        difficulty: skill.difficulty,
        isActive: true,
      })
      .returning();

    log.info(
      { skillId: row.id, name: row.name, category: skill.category },
      'Skill registered',
    );

    return this.rowToDefinition(row);
  }

  // ----------------------------------------------------------
  // Update a skill
  // ----------------------------------------------------------

  async updateSkill(
    id: string,
    updates: Partial<MCPSkillDefinition>,
  ): Promise<MCPSkillDefinition> {
    const updateValues: Record<string, unknown> = {};

    if (updates.name !== undefined) updateValues.name = updates.name;
    if (updates.description !== undefined) updateValues.description = updates.description;
    if (updates.serverCommand !== undefined) updateValues.mcpServerCommand = updates.serverCommand;
    if (updates.serverArgs !== undefined) updateValues.mcpServerArgs = updates.serverArgs;
    if (updates.serverEnv !== undefined) updateValues.mcpServerEnv = updates.serverEnv;
    if (updates.category !== undefined) updateValues.category = updates.category;
    if (updates.difficulty !== undefined) updateValues.difficulty = updates.difficulty;

    const [row] = await db
      .update(skills)
      .set(updateValues)
      .where(eq(skills.id, id))
      .returning();

    if (!row) {
      throw new NotFoundError('Skill', id);
    }

    log.info(
      { skillId: id, updates: Object.keys(updates) },
      'Skill updated',
    );

    return this.rowToDefinition(row);
  }

  // ----------------------------------------------------------
  // Remove a skill (soft-delete by setting isActive = false)
  // ----------------------------------------------------------

  async removeSkill(id: string): Promise<void> {
    const [row] = await db
      .update(skills)
      .set({ isActive: false })
      .where(eq(skills.id, id))
      .returning();

    if (!row) {
      throw new NotFoundError('Skill', id);
    }

    log.info({ skillId: id, name: row.name }, 'Skill removed (deactivated)');
  }

  // ----------------------------------------------------------
  // Get a specific skill by name or id
  // ----------------------------------------------------------

  async getSkill(nameOrId: string): Promise<MCPSkillDefinition | null> {
    // Try by ID first
    let [row] = await db
      .select()
      .from(skills)
      .where(eq(skills.id, nameOrId))
      .limit(1);

    // If not found, try by name
    if (!row) {
      [row] = await db
        .select()
        .from(skills)
        .where(eq(skills.name, nameOrId))
        .limit(1);
    }

    if (!row) {
      return null;
    }

    return this.rowToDefinition(row);
  }

  // ----------------------------------------------------------
  // Get skills by category
  // ----------------------------------------------------------

  async getSkillsByCategory(category: string): Promise<MCPSkillDefinition[]> {
    const rows = await db
      .select()
      .from(skills)
      .where(and(eq(skills.category, category), eq(skills.isActive, true)));

    return rows.map((row) => this.rowToDefinition(row));
  }

  // ----------------------------------------------------------
  // Get all skills assigned to a specific agent
  // ----------------------------------------------------------

  async getAgentSkills(agentId: string): Promise<MCPSkillDefinition[]> {
    const rows = await db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        mcpServerCommand: skills.mcpServerCommand,
        mcpServerArgs: skills.mcpServerArgs,
        mcpServerEnv: skills.mcpServerEnv,
        category: skills.category,
        difficulty: skills.difficulty,
        isActive: skills.isActive,
        createdAt: skills.createdAt,
      })
      .from(agentSkills)
      .innerJoin(skills, eq(agentSkills.skillId, skills.id))
      .where(and(eq(agentSkills.agentId, agentId), eq(skills.isActive, true)));

    log.debug(
      { agentId, skillCount: rows.length },
      'Retrieved agent skills',
    );

    return rows.map((row) => this.rowToDefinition(row));
  }

  // ----------------------------------------------------------
  // Assign a skill to an agent
  // ----------------------------------------------------------

  async assignSkillToAgent(agentId: string, skillId: string): Promise<void> {
    await db
      .insert(agentSkills)
      .values({
        agentId,
        skillId,
        proficiency: 50,
      })
      .onConflictDoNothing();

    log.info(
      { agentId, skillId },
      'Skill assigned to agent',
    );
  }

  // ----------------------------------------------------------
  // Remove a skill from an agent
  // ----------------------------------------------------------

  async removeSkillFromAgent(agentId: string, skillId: string): Promise<void> {
    await db
      .delete(agentSkills)
      .where(
        and(
          eq(agentSkills.agentId, agentId),
          eq(agentSkills.skillId, skillId),
        ),
      );

    log.info(
      { agentId, skillId },
      'Skill removed from agent',
    );
  }

  // ----------------------------------------------------------
  // Internal: convert a DB row to MCPSkillDefinition
  // ----------------------------------------------------------

  private rowToDefinition(row: {
    id: string;
    name: string;
    description: string | null;
    mcpServerCommand: string;
    mcpServerArgs: string[] | null;
    mcpServerEnv: unknown;
    category: string | null;
    difficulty: number | null;
  }): MCPSkillDefinition {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      serverCommand: row.mcpServerCommand,
      serverArgs: row.mcpServerArgs ?? [],
      serverEnv: (row.mcpServerEnv as Record<string, string>) ?? {},
      category: row.category ?? 'general',
      difficulty: row.difficulty ?? 1,
    };
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const mcpRegistry = new MCPRegistry();
