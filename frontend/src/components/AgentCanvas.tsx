// ============================================================
// AgentCanvas — SVG org chart with radial layout
// ============================================================

import type { Agent } from '../types';

interface AgentCanvasProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

const NODE_RADIUS = 36;
const INNER_RADIUS = 140;
const OUTER_RADIUS = 260;
const CX = 300;
const CY = 310;

/** Skip filler words so "The Auditor" → "A", "Devil's Advocate" → "D" */
function getInitial(name: string): string {
  const skip = new Set(['the', 'a', 'an', 'of', 'for']);
  const words = name.trim().split(/\s+/);
  const meaningful = words.find((w) => !skip.has(w.toLowerCase())) ?? words[0];
  return meaningful.charAt(0).toUpperCase();
}

function getTierColors(tier: string | null, isAdversarial: boolean | null) {
  if (tier === 'adversarial' || isAdversarial) {
    return {
      border: '#ef4444',
      fill: '#1a0808',
      labelColor: '#ef4444',
      glowColor: 'rgba(239,68,68,0.6)',
    };
  }
  if (tier === 'worker') {
    return {
      border: '#3b82f6',
      fill: '#080d1a',
      labelColor: '#93c5fd',
      glowColor: 'rgba(59,130,246,0.6)',
    };
  }
  return {
    border: '#6b7280',
    fill: '#111827',
    labelColor: '#9ca3af',
    glowColor: 'rgba(107,114,128,0.4)',
  };
}

function getNodeOpacity(status: string): number {
  if (status === 'active') return 1;
  if (status === 'fired') return 0.3;
  return 0.6;
}

function getStatusRingColor(status: string): string | null {
  if (status === 'warning') return '#f97316';
  return null;
}

interface NodePosition {
  agent: Agent;
  x: number;
  y: number;
}

export default function AgentCanvas({ agents, onAgentClick }: AgentCanvasProps) {
  const adversarialAgents = agents.filter(
    (a) => a.tier === 'adversarial' || a.isAdversarial === true
  );
  const workerAgents = agents.filter(
    (a) => a.tier !== 'adversarial' && a.isAdversarial !== true
  );

  const adversarialPositions: NodePosition[] = adversarialAgents.map((agent, i) => {
    const count = adversarialAgents.length;
    const angle = (2 * Math.PI * i) / (count || 1);
    const x = CX + INNER_RADIUS * Math.cos(angle - Math.PI / 2);
    const y = CY + INNER_RADIUS * Math.sin(angle - Math.PI / 2);
    return { agent, x, y };
  });

  const workerPositions: NodePosition[] = workerAgents.map((agent, i) => {
    const count = workerAgents.length;
    const angle = (2 * Math.PI * i) / (count || 1);
    const x = CX + OUTER_RADIUS * Math.cos(angle - Math.PI / 2);
    const y = CY + OUTER_RADIUS * Math.sin(angle - Math.PI / 2);
    return { agent, x, y };
  });

  const allPositions = [...adversarialPositions, ...workerPositions];

  return (
    <div className="relative w-full">
      <style>{`
        @keyframes pulse-glow-red {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(239,68,68,0.4)); }
          50% { filter: drop-shadow(0 0 12px rgba(239,68,68,0.9)); }
        }
        @keyframes pulse-glow-blue {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(59,130,246,0.4)); }
          50% { filter: drop-shadow(0 0 12px rgba(59,130,246,0.9)); }
        }
        @keyframes pulse-glow-gray {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(107,114,128,0.3)); }
          50% { filter: drop-shadow(0 0 6px rgba(107,114,128,0.6)); }
        }
        .agent-node-active-adversarial { animation: pulse-glow-red 2s ease-in-out infinite; }
        .agent-node-active-worker { animation: pulse-glow-blue 2s ease-in-out infinite; }
        .agent-node-active-unknown { animation: pulse-glow-gray 2.5s ease-in-out infinite; }
        .agent-node { cursor: pointer; }
        .agent-node:hover circle { opacity: 0.85; }
      `}</style>

      <svg
        viewBox="0 0 600 680"
        width="100%"
        aria-label="Agent organization chart"
      >
        {/* Background */}
        <rect width="600" height="600" fill="#0f1117" rx="12" />

        {/* Empty state */}
        {agents.length === 0 && (
          <text
            x="300"
            y="300"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6b7280"
            fontSize="14"
            fontFamily="sans-serif"
          >
            No agents hired. Hire your first agent to see the org chart.
          </text>
        )}

        {/* Orbit rings (decorative) */}
        {agents.length > 0 && adversarialAgents.length > 0 && (
          <circle
            cx={CX}
            cy={CY}
            r={INNER_RADIUS}
            fill="none"
            stroke="#1f2937"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
        )}
        {agents.length > 0 && workerAgents.length > 0 && (
          <circle
            cx={CX}
            cy={CY}
            r={OUTER_RADIUS}
            fill="none"
            stroke="#1f2937"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
        )}

        {/* Edges: adversarial → center (monitoring) */}
        {adversarialPositions
          .filter((p) => p.agent.status === 'active')
          .map((p) => (
            <line
              key={`edge-adv-${p.agent.id}`}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="5 5"
              strokeOpacity="0.3"
            />
          ))}

        {/* Edges: worker → center (reporting) */}
        {workerPositions
          .filter((p) => p.agent.status === 'active')
          .map((p) => (
            <line
              key={`edge-worker-${p.agent.id}`}
              x1={p.x}
              y1={p.y}
              x2={CX}
              y2={CY}
              stroke="#3b82f6"
              strokeWidth="1"
              strokeDasharray="5 5"
              strokeOpacity="0.25"
            />
          ))}

        {/* Center node */}
        {agents.length > 0 && (
          <g>
            <circle
              cx={CX}
              cy={CY}
              r={32}
              fill="#111827"
              stroke="#374151"
              strokeWidth="2"
            />
            <text
              x={CX}
              y={CY}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#e5e7eb"
              fontSize="11"
              fontWeight="600"
              fontFamily="sans-serif"
            >
              Company
            </text>
          </g>
        )}

        {/* Agent nodes */}
        {allPositions.map(({ agent, x, y }) => {
          const colors = getTierColors(agent.tier, agent.isAdversarial);
          const opacity = getNodeOpacity(agent.status);
          const warningRing = getStatusRingColor(agent.status);
          const initial = getInitial(agent.name);
          const isFired = agent.status === 'fired';

          const tierKey =
            agent.tier === 'adversarial' || agent.isAdversarial
              ? 'adversarial'
              : agent.tier === 'worker'
              ? 'worker'
              : 'unknown';

          const animClass =
            agent.status === 'active'
              ? `agent-node-active-${tierKey}`
              : '';

          return (
            <g
              key={agent.id}
              className={`agent-node ${animClass}`}
              style={{
                opacity,
                filter: isFired ? 'grayscale(100%)' : undefined,
              }}
              onClick={() => onAgentClick(agent)}
              role="button"
              aria-label={`Agent ${agent.name}`}
            >
              {/* Warning ring */}
              {warningRing && (
                <circle
                  cx={x}
                  cy={y}
                  r={NODE_RADIUS + 5}
                  fill="none"
                  stroke={warningRing}
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              )}

              {/* Main circle */}
              <circle
                cx={x}
                cy={y}
                r={NODE_RADIUS}
                fill={colors.fill}
                stroke={colors.border}
                strokeWidth="2"
              />

              {/* Initial letter */}
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={colors.border}
                fontSize="22"
                fontWeight="700"
                fontFamily="sans-serif"
              >
                {initial}
              </text>

              {/* Agent name label */}
              <text
                x={x}
                y={y + NODE_RADIUS + 14}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={colors.labelColor}
                fontSize="11"
                fontWeight="600"
                fontFamily="sans-serif"
              >
                {agent.name}
              </text>

              {/* Role label */}
              <text
                x={x}
                y={y + NODE_RADIUS + 27}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#6b7280"
                fontSize="9"
                fontFamily="sans-serif"
              >
                {agent.role}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
