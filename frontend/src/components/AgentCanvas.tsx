// ============================================================
// AgentCanvas — glass-frosted SVG org chart
// Aesthetic: n8n / Make.com — dark canvas, gradient nodes,
// flowing animated edges, glow halos, dot grid background.
// ============================================================

import type { Agent } from '../types';

interface AgentCanvasProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

const NODE_R   = 38;   // node radius
const INNER_R  = 148;  // adversarial ring radius
const OUTER_R  = 272;  // worker ring radius
const CX       = 310;  // canvas centre x
const CY       = 320;  // canvas centre y
const VW       = 620;  // viewBox width
const VH       = 700;  // viewBox height

function skipWords(name: string): string {
  const skip = new Set(['the', 'a', 'an', 'of', 'for']);
  const words = name.trim().split(/\s+/);
  return (words.find((w) => !skip.has(w.toLowerCase())) ?? words[0])
    .charAt(0)
    .toUpperCase();
}

type TierKey = 'adversarial' | 'worker' | 'unknown';

function tierKey(agent: Agent): TierKey {
  if (agent.tier === 'adversarial' || agent.isAdversarial) return 'adversarial';
  if (agent.tier === 'worker') return 'worker';
  return 'unknown';
}

// gradient / glow colors per tier
const TIER_COLORS: Record<TierKey, {
  gradA: string; gradB: string;     // node fill gradient (centre → edge)
  stroke1: string; stroke2: string; // border gradient start / end
  glow: string;                     // drop-shadow glow colour
  label: string;                    // name label colour
  edge: string;                     // edge stroke colour
  filterId: string;
}> = {
  adversarial: {
    gradA:   'rgba(239,68,68,0.32)',
    gradB:   'rgba(153,27,27,0.08)',
    stroke1: '#f87171',
    stroke2: '#fb923c',
    glow:    'rgba(239,68,68,0.7)',
    label:   '#fca5a5',
    edge:    '#ef4444',
    filterId: 'glow-red',
  },
  worker: {
    gradA:   'rgba(59,130,246,0.30)',
    gradB:   'rgba(37,99,235,0.06)',
    stroke1: '#60a5fa',
    stroke2: '#818cf8',
    glow:    'rgba(59,130,246,0.65)',
    label:   '#93c5fd',
    edge:    '#3b82f6',
    filterId: 'glow-blue',
  },
  unknown: {
    gradA:   'rgba(107,114,128,0.25)',
    gradB:   'rgba(75,85,99,0.05)',
    stroke1: '#9ca3af',
    stroke2: '#6b7280',
    glow:    'rgba(107,114,128,0.4)',
    label:   '#d1d5db',
    edge:    '#6b7280',
    filterId: 'glow-gray',
  },
};

interface Pos { agent: Agent; x: number; y: number }

function ring(cx: number, cy: number, r: number, items: Agent[]): Pos[] {
  return items.map((agent, i) => {
    const a = (2 * Math.PI * i) / (items.length || 1) - Math.PI / 2;
    return { agent, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

export default function AgentCanvas({ agents, onAgentClick }: AgentCanvasProps) {
  const adversarial = agents.filter((a) => a.tier === 'adversarial' || a.isAdversarial === true);
  const workers     = agents.filter((a) => a.tier !== 'adversarial' && !a.isAdversarial);

  const advPos    = ring(CX, CY, INNER_R, adversarial);
  const wrkPos    = ring(CX, CY, OUTER_R, workers);
  const allPos    = [...advPos, ...wrkPos];

  return (
    <div className="relative w-full select-none">
      {/* ── Animations ───────────────────────────────────────── */}
      <style>{`
        /* flowing edge dash animation */
        @keyframes flow-dash {
          to { stroke-dashoffset: -48; }
        }
        /* halo pulse ring — expands and fades */
        @keyframes halo {
          0%   { r: ${NODE_R + 2}; opacity: 0.55; }
          100% { r: ${NODE_R + 20}; opacity: 0; }
        }
        /* slow breathe glow */
        @keyframes breathe-red {
          0%,100% { filter: drop-shadow(0 0 5px rgba(239,68,68,0.5))
                             drop-shadow(0 0 16px rgba(239,68,68,0.2)); }
          50%     { filter: drop-shadow(0 0 10px rgba(239,68,68,0.85))
                             drop-shadow(0 0 28px rgba(239,68,68,0.35)); }
        }
        @keyframes breathe-blue {
          0%,100% { filter: drop-shadow(0 0 5px rgba(59,130,246,0.5))
                             drop-shadow(0 0 16px rgba(59,130,246,0.2)); }
          50%     { filter: drop-shadow(0 0 10px rgba(59,130,246,0.85))
                             drop-shadow(0 0 28px rgba(59,130,246,0.35)); }
        }
        @keyframes breathe-gray {
          0%,100% { filter: drop-shadow(0 0 3px rgba(107,114,128,0.3)); }
          50%     { filter: drop-shadow(0 0 8px rgba(107,114,128,0.55)); }
        }
        /* center node rotating gradient ring */
        @keyframes spin-ring {
          to { transform: rotate(360deg); transform-origin: ${CX}px ${CY}px; }
        }
        /* subtle float up/down */
        @keyframes float {
          0%,100% { transform: translateY(0px); }
          50%     { transform: translateY(-3px); }
        }

        .edge-flow-red  { stroke-dasharray:8 10; animation: flow-dash 1.8s linear infinite; }
        .edge-flow-blue { stroke-dasharray:8 10; animation: flow-dash 2.2s linear infinite; }
        .edge-glow-red  { stroke-dasharray:8 10; animation: flow-dash 1.8s linear infinite reverse; }
        .edge-glow-blue { stroke-dasharray:8 10; animation: flow-dash 2.2s linear infinite reverse; }

        .breathe-adversarial { animation: breathe-red  2.8s ease-in-out infinite; }
        .breathe-worker      { animation: breathe-blue 3.2s ease-in-out infinite; }
        .breathe-unknown     { animation: breathe-gray 4s   ease-in-out infinite; }

        .halo-circle { animation: halo 2.4s ease-out infinite; }
        .halo-circle-slow { animation: halo 2.4s ease-out 1.2s infinite; }

        .spin-ring-group { animation: spin-ring 8s linear infinite; }

        .node-group { cursor: pointer; transition: opacity 0.2s; }
        .node-group:hover { opacity: 0.85; }

        .float-center { animation: float 4s ease-in-out infinite; }
      `}</style>

      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        aria-label="Agent organization chart"
        style={{ display: 'block' }}
      >
        {/* ── Defs ─────────────────────────────────────────── */}
        <defs>
          {/* dot grid pattern */}
          <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="0.9" fill="rgba(255,255,255,0.055)" />
          </pattern>

          {/* glow filters */}
          {(['red','blue','gray'] as const).map((c) => {
            const col = c === 'red' ? '#ef4444' : c === 'blue' ? '#3b82f6' : '#9ca3af';
            return (
              <filter key={c} id={`glow-${c}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                <feFlood floodColor={col} floodOpacity="0.6" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            );
          })}

          {/* per-node radial fills (glass look) */}
          {allPos.map(({ agent, x, y }) => {
            const tk = tierKey(agent);
            const c  = TIER_COLORS[tk];
            return (
              <radialGradient
                key={`fill-${agent.id}`}
                id={`fill-${agent.id}`}
                cx="38%" cy="30%" r="70%"
              >
                <stop offset="0%"   stopColor={c.gradA} />
                <stop offset="100%" stopColor={c.gradB} />
              </radialGradient>
            );
          })}

          {/* per-node border gradient */}
          {allPos.map(({ agent, x, y }) => {
            const tk = tierKey(agent);
            const c  = TIER_COLORS[tk];
            return (
              <linearGradient
                key={`border-${agent.id}`}
                id={`border-${agent.id}`}
                x1="0%" y1="0%" x2="100%" y2="100%"
              >
                <stop offset="0%"   stopColor={c.stroke1} />
                <stop offset="100%" stopColor={c.stroke2} />
              </linearGradient>
            );
          })}

          {/* center node gradient */}
          <radialGradient id="center-fill" cx="40%" cy="32%" r="65%">
            <stop offset="0%"   stopColor="rgba(139,92,246,0.28)" />
            <stop offset="100%" stopColor="rgba(67,20,120,0.08)" />
          </radialGradient>
          <linearGradient id="center-spin" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#a78bfa" />
            <stop offset="50%"  stopColor="#ec4899" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>

          {/* glass highlight (inner arc) */}
          <radialGradient id="glass-highlight" cx="35%" cy="25%" r="55%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* edge gradient red */}
          <linearGradient id="edge-grad-red" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
          </linearGradient>
          {/* edge gradient blue */}
          <linearGradient id="edge-grad-blue" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* ── Background ───────────────────────────────────── */}
        <rect width={VW} height={VH} fill="#050b18" rx="14" />
        <rect width={VW} height={VH} fill="url(#dots)" rx="14" />

        {/* ── Empty state ──────────────────────────────────── */}
        {agents.length === 0 && (
          <text
            x={CX} y={CY}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(148,163,184,0.5)" fontSize="13" fontFamily="system-ui,sans-serif"
          >
            No agents hired. Hire your first agent to see the org chart.
          </text>
        )}

        {/* ── Orbit rings ──────────────────────────────────── */}
        {adversarial.length > 0 && (
          <circle cx={CX} cy={CY} r={INNER_R}
            fill="none" stroke="rgba(239,68,68,0.08)"
            strokeWidth="1.5" strokeDasharray="2 6" />
        )}
        {workers.length > 0 && (
          <circle cx={CX} cy={CY} r={OUTER_R}
            fill="none" stroke="rgba(59,130,246,0.08)"
            strokeWidth="1.5" strokeDasharray="2 6" />
        )}

        {/* ── Edges — base faint line ───────────────────────── */}
        {advPos.filter((p) => p.agent.status === 'active').map(({ agent, x, y }) => (
          <line key={`base-adv-${agent.id}`}
            x1={CX} y1={CY} x2={x} y2={y}
            stroke="#ef4444" strokeWidth="1" strokeOpacity="0.12" />
        ))}
        {wrkPos.filter((p) => p.agent.status === 'active').map(({ agent, x, y }) => (
          <line key={`base-wrk-${agent.id}`}
            x1={x} y1={y} x2={CX} y2={CY}
            stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.12" />
        ))}

        {/* ── Edges — flowing animated dashes ──────────────── */}
        {advPos.filter((p) => p.agent.status === 'active').map(({ agent, x, y }) => (
          <line key={`flow-adv-${agent.id}`}
            x1={CX} y1={CY} x2={x} y2={y}
            stroke={TIER_COLORS.adversarial.edge}
            strokeWidth="1.5" strokeOpacity="0.55"
            className="edge-flow-red" />
        ))}
        {wrkPos.filter((p) => p.agent.status === 'active').map(({ agent, x, y }) => (
          <line key={`flow-wrk-${agent.id}`}
            x1={x} y1={y} x2={CX} y2={CY}
            stroke={TIER_COLORS.worker.edge}
            strokeWidth="1.5" strokeOpacity="0.55"
            className="edge-flow-blue" />
        ))}

        {/* ── Center node ──────────────────────────────────── */}
        {agents.length > 0 && (
          <g className="float-center">
            {/* rotating gradient ring */}
            <g className="spin-ring-group">
              <circle cx={CX} cy={CY} r={40}
                fill="none" stroke="url(#center-spin)"
                strokeWidth="2.5" strokeDasharray="30 20 10 40"
                strokeOpacity="0.7" />
            </g>
            {/* inner glow halo */}
            <circle cx={CX} cy={CY} r={36}
              fill="none" stroke="rgba(139,92,246,0.15)"
              strokeWidth="8" />
            {/* glass circle */}
            <circle cx={CX} cy={CY} r={33}
              fill="url(#center-fill)"
              stroke="rgba(167,139,250,0.6)"
              strokeWidth="1.5" />
            {/* glass highlight */}
            <circle cx={CX} cy={CY} r={33}
              fill="url(#glass-highlight)" />
            {/* label */}
            <text x={CX} y={CY}
              textAnchor="middle" dominantBaseline="middle"
              fill="#e9d5ff" fontSize="11" fontWeight="700"
              fontFamily="system-ui,sans-serif" letterSpacing="0.05em">
              COMPANY
            </text>
          </g>
        )}

        {/* ── Agent nodes ──────────────────────────────────── */}
        {allPos.map(({ agent, x, y }) => {
          const tk      = tierKey(agent);
          const c       = TIER_COLORS[tk];
          const initial = skipWords(agent.name);
          const active  = agent.status === 'active';
          const fired   = agent.status === 'fired';
          const opacity = fired ? 0.28 : active ? 1 : 0.55;

          return (
            <g
              key={agent.id}
              className={`node-group ${active ? `breathe-${tk}` : ''}`}
              style={{ opacity, filter: fired ? 'grayscale(90%)' : undefined }}
              onClick={() => onAgentClick(agent)}
              role="button"
              aria-label={`Agent ${agent.name}`}
            >
              {/* halo pulse rings (active only) */}
              {active && (
                <>
                  <circle cx={x} cy={y} fill="none"
                    stroke={c.stroke1} strokeWidth="1.5" strokeOpacity="0.6"
                    className="halo-circle" />
                  <circle cx={x} cy={y} fill="none"
                    stroke={c.stroke1} strokeWidth="1" strokeOpacity="0.35"
                    className="halo-circle-slow" />
                </>
              )}

              {/* warning dashed ring */}
              {agent.status === 'warning' && (
                <circle cx={x} cy={y} r={NODE_R + 7}
                  fill="none" stroke="#f97316"
                  strokeWidth="2" strokeDasharray="5 3" strokeOpacity="0.7" />
              )}

              {/* outer glow bloom */}
              {active && (
                <circle cx={x} cy={y} r={NODE_R + 6}
                  fill={`radial-gradient(circle, ${c.gradA}, transparent)`}
                  style={{ fill: c.gradA.replace('0.3', '0.06').replace('0.25', '0.05') }} />
              )}

              {/* glass node body */}
              <circle cx={x} cy={y} r={NODE_R}
                fill={`url(#fill-${agent.id})`}
                stroke={`url(#border-${agent.id})`}
                strokeWidth="2" />

              {/* glass highlight (specular) */}
              <ellipse
                cx={x - NODE_R * 0.18}
                cy={y - NODE_R * 0.26}
                rx={NODE_R * 0.52}
                ry={NODE_R * 0.3}
                fill="rgba(255,255,255,0.14)"
                style={{ pointerEvents: 'none' }}
              />

              {/* initial letter */}
              <text x={x} y={y}
                textAnchor="middle" dominantBaseline="middle"
                fill={c.stroke1}
                fontSize="20" fontWeight="800"
                fontFamily="system-ui,sans-serif"
                style={{ filter: `drop-shadow(0 0 6px ${c.stroke1})` }}>
                {initial}
              </text>

              {/* agent name */}
              <text
                x={x} y={y + NODE_R + 15}
                textAnchor="middle" dominantBaseline="middle"
                fill={c.label}
                fontSize="11" fontWeight="600"
                fontFamily="system-ui,sans-serif">
                {agent.name}
              </text>

              {/* role */}
              <text
                x={x} y={y + NODE_R + 28}
                textAnchor="middle" dominantBaseline="middle"
                fill="rgba(148,163,184,0.55)"
                fontSize="9"
                fontFamily="system-ui,sans-serif">
                {agent.role}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
