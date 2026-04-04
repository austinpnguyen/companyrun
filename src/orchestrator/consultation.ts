// ============================================================
// Consultation System — user approval flow for decisions
// ============================================================

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  agents,
  tasks,
  performanceReviews,
  activityLog,
} from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { generateId } from '../shared/utils.js';
import type { Decision } from './decision-engine.js';

const log = createLogger('orchestrator:consultation');

// ============================================================
// Types
// ============================================================

export interface ConsultationRequest {
  id: string;
  decision: Decision;
  question: string;
  options: string[];
  context: {
    agentName?: string;
    kpiHistory?: number[];
    taskBacklog?: number;
    estimatedCost?: number;
  };
  status: 'pending' | 'responded';
  response?: string;
  createdAt: Date;
  respondedAt?: Date;
}

// ============================================================
// ConsultationSystem
// ============================================================

export class ConsultationSystem {
  private requests: Map<string, ConsultationRequest> = new Map();

  // ----------------------------------------------------------
  // Create a consultation request from a decision
  // ----------------------------------------------------------

  async createRequest(decision: Decision): Promise<ConsultationRequest> {
    // Check if a request already exists for this decision
    for (const req of this.requests.values()) {
      if (req.decision.id === decision.id && req.status === 'pending') {
        log.debug(
          { decisionId: decision.id, requestId: req.id },
          'Consultation request already exists for this decision',
        );
        return req;
      }
    }

    const { question, context } = await this.buildQuestion(decision);

    const options = this.getOptionsForDecision(decision);

    const request: ConsultationRequest = {
      id: generateId(),
      decision,
      question,
      options,
      context,
      status: 'pending',
      createdAt: new Date(),
    };

    this.requests.set(request.id, request);

    await db.insert(activityLog).values({
      actor: 'orchestrator',
      action: 'consultation_created',
      entityType: 'consultation',
      details: {
        requestId: request.id,
        decisionId: decision.id,
        type: decision.type,
        question,
      },
    });

    log.info(
      { requestId: request.id, decisionType: decision.type, question },
      'Consultation request created',
    );

    return request;
  }

  // ----------------------------------------------------------
  // Get all pending requests
  // ----------------------------------------------------------

  getPendingRequests(): ConsultationRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) => r.status === 'pending',
    );
  }

  // ----------------------------------------------------------
  // Record user's response
  // ----------------------------------------------------------

  async respond(
    requestId: string,
    response: 'approve' | 'reject' | 'defer',
  ): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new Error(`Consultation request ${requestId} not found`);
    }

    if (request.status === 'responded') {
      throw new Error(`Consultation request ${requestId} has already been responded to`);
    }

    request.status = 'responded';
    request.response = response;
    request.respondedAt = new Date();

    await db.insert(activityLog).values({
      actor: 'user',
      action: 'consultation_responded',
      entityType: 'consultation',
      details: {
        requestId: request.id,
        decisionId: request.decision.id,
        response,
        type: request.decision.type,
      },
    });

    log.info(
      { requestId, response, decisionType: request.decision.type },
      'Consultation response recorded',
    );
  }

  // ----------------------------------------------------------
  // Get count of pending requests (for dashboard badge)
  // ----------------------------------------------------------

  getPendingCount(): number {
    let count = 0;
    for (const req of this.requests.values()) {
      if (req.status === 'pending') count++;
    }
    return count;
  }

  // ----------------------------------------------------------
  // Build a human-readable question + context
  // ----------------------------------------------------------

  private async buildQuestion(decision: Decision): Promise<{
    question: string;
    context: ConsultationRequest['context'];
  }> {
    const context: ConsultationRequest['context'] = {};

    switch (decision.type) {
      case 'hire': {
        // Get the task backlog count
        const [backlogResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(tasks)
          .where(
            sql`${tasks.status} = 'queued' AND ${tasks.assignedAgentId} IS NULL`,
          );

        context.taskBacklog = backlogResult?.count ?? 0;

        return {
          question: `The task backlog has grown to ${context.taskBacklog} unassigned tasks. I recommend hiring a new "${decision.templateRole}" agent. Approve this hire?`,
          context,
        };
      }

      case 'fire': {
        if (decision.targetAgentId) {
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, decision.targetAgentId))
            .limit(1);

          if (agent) {
            context.agentName = agent.name;
          }

          // Get KPI history
          const reviews = await db
            .select({ overallScore: performanceReviews.overallScore })
            .from(performanceReviews)
            .where(eq(performanceReviews.agentId, decision.targetAgentId))
            .orderBy(desc(performanceReviews.reviewedAt))
            .limit(5);

          context.kpiHistory = reviews.map((r) => Number(r.overallScore));
        }

        return {
          question: `Agent "${context.agentName ?? 'Unknown'}" has consistently underperformed (KPI history: ${(context.kpiHistory ?? []).join(', ')}). ${decision.reason} Do you approve terminating this agent?`,
          context,
        };
      }

      case 'warn': {
        if (decision.targetAgentId) {
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, decision.targetAgentId))
            .limit(1);

          if (agent) {
            context.agentName = agent.name;
          }

          const reviews = await db
            .select({ overallScore: performanceReviews.overallScore })
            .from(performanceReviews)
            .where(eq(performanceReviews.agentId, decision.targetAgentId))
            .orderBy(desc(performanceReviews.reviewedAt))
            .limit(3);

          context.kpiHistory = reviews.map((r) => Number(r.overallScore));
        }

        return {
          question: `Agent "${context.agentName ?? 'Unknown'}" is underperforming (recent KPIs: ${(context.kpiHistory ?? []).join(', ')}). ${decision.reason} Issue a formal warning?`,
          context,
        };
      }

      case 'retrain': {
        if (decision.targetAgentId) {
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, decision.targetAgentId))
            .limit(1);

          if (agent) {
            context.agentName = agent.name;
          }
        }

        return {
          question: `Agent "${context.agentName ?? 'Unknown'}" may benefit from retraining. ${decision.reason} Approve retraining?`,
          context,
        };
      }

      case 'promote': {
        if (decision.targetAgentId) {
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, decision.targetAgentId))
            .limit(1);

          if (agent) {
            context.agentName = agent.name;
          }

          const reviews = await db
            .select({ overallScore: performanceReviews.overallScore })
            .from(performanceReviews)
            .where(eq(performanceReviews.agentId, decision.targetAgentId))
            .orderBy(desc(performanceReviews.reviewedAt))
            .limit(3);

          context.kpiHistory = reviews.map((r) => Number(r.overallScore));
        }

        return {
          question: `Agent "${context.agentName ?? 'Unknown'}" has been performing exceptionally (KPIs: ${(context.kpiHistory ?? []).join(', ')}). ${decision.reason} Approve promotion?`,
          context,
        };
      }

      default: {
        return {
          question: `Decision: ${decision.reason}. Approve?`,
          context,
        };
      }
    }
  }

  // ----------------------------------------------------------
  // Get response options based on decision type
  // ----------------------------------------------------------

  private getOptionsForDecision(decision: Decision): string[] {
    switch (decision.type) {
      case 'fire':
        return ['Approve', 'Reject', 'Defer'];
      case 'hire':
        return ['Approve', 'Reject', 'Defer'];
      case 'warn':
        return ['Approve', 'Reject'];
      case 'retrain':
        return ['Approve', 'Reject'];
      case 'promote':
        return ['Approve', 'Reject'];
      default:
        return ['Approve', 'Reject'];
    }
  }
}

// ============================================================
// Singleton
// ============================================================

export const consultationSystem = new ConsultationSystem();
