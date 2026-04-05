// ============================================================
// AgentCanvas — Dynasty OS-style canvas
// HTML div nodes + SVG Bézier edges + ref-based zoom/pan
// Dark glass aesthetic, no external graph library
// ============================================================

import { useRef, useState, useCallback, useEffect } from 'react';
import type { Agent } from '../types';

interface AgentCanvasProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

// ── Layout constants ──────────────────────────────────────────
const NODE_W     = 168;
const NODE_H     = 78;
const COMPANY_W  = 108;
const COMPANY_H  = 108;
const CANVAS_W   = 1400;
const CANVAS_H   = 900;
const CX         = 700;
const CY         = 430;
const ADV_R      = 230;
const WORK_R     = 390;

// ── Helpers ───────────────────────────────────────────────────
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

const TIER = {
  adversarial: {
    border:    '#f87171',
    glow:      '0 0 28px rgba(248,113,113,0.55), 0 0 70px rgba(248,113,113,0.18)',
    hoverGlow: '0 0 18px rgba(248,113,113,0.35)',
    edge:      '#f87171',
    edgeAlpha: 0.55,
    initial:   '#f87171',
    label:     'Adversarial',
  },
  worker: {
    border:    '#60a5fa',
    glow:      '0 0 28px rgba(96,165,250,0.5), 0 0 70px rgba(96,165,250,0.15)',
    hoverGlow: '0 0 18px rgba(96,165,250,0.3)',
    edge:      '#60a5fa',
    edgeAlpha: 0.5,
    initial:   '#60a5fa',
    label:     'Worker',
  },
  unknown: {
    border:    '#475569',
    glow:      '0 0 20px rgba(71,85,105,0.4)',
    hoverGlow: '0 0 14px rgba(71,85,105,0.25)',
    edge:      '#475569',
    edgeAlpha: 0.4,
    initial:   '#94a3b8',
    label:     'Agent',
  },
} as const;

// ── Layout ────────────────────────────────────────────────────
function layoutNodes(agents: Agent[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  pos['__company__'] = { x: CX - COMPANY_W / 2, y: CY - COMPANY_H / 2 };

  const adv = agents.filter((a) => tierKey(a) === 'adversarial');
  const wrk = agents.filter((a) => tierKey(a) !== 'adversarial');

  adv.forEach((a, i) => {
    const angle = (2 * Math.PI * i) / Math.max(adv.length, 1) - Math.PI / 2;
    pos[a.id] = {
      x: CX + ADV_R * Math.cos(angle) - NODE_W / 2,
      y: CY + ADV_R * Math.sin(angle) - NODE_H / 2,
    };
  });

  wrk.forEach((a, i) => {
    const angle = (2 * Math.PI * i) / Math.max(wrk.length, 1) - Math.PI / 2;
    pos[a.id] = {
      x: CX + WORK_R * Math.cos(angle) - NODE_W / 2,
      y: CY + WORK_R * Math.sin(angle) - NODE_H / 2,
    };
  });

  return pos;
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const cy = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
}

// ── Main component ────────────────────────────────────────────
interface Camera { x: number; y: number; z: number; }

export default function AgentCanvas({ agents, onAgentClick }: AgentCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef    = useRef<Camera>({ x: 0, y: 0, z: 0.85 });
  const [camera, setCamera]     = useState<Camera>({ x: 0, y: 0, z: 0.85 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0 });

  const flush = useCallback(() => {
    const c = cameraRef.current;
    setCamera({ x: c.x, y: c.y, z: c.z });
  }, []);

  const fitView = useCallback(() => {
    if (!containerRef.current) return;
    const r   = containerRef.current.getBoundingClientRect();
    const pad = 60;
    const z   = Math.min((r.width - pad * 2) / CANVAS_W, (r.height - pad * 2) / CANVAS_H, 1.1);
    cameraRef.current = {
      x: (r.width  - CANVAS_W * z) / 2,
      y: (r.height - CANVAS_H * z) / 2,
      z,
    };
    flush();
  }, [flush]);

  useEffect(() => { fitView(); }, [fitView]);

  // Non-passive wheel listener so e.preventDefault() works
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const c  = cameraRef.current;
      const r  = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const newZ = Math.min(3, Math.max(0.1, c.z * (1 - e.deltaY * 0.001)));
      cameraRef.current = {
        x: mx - (mx - c.x) * (newZ / c.z),
        y: my - (my - c.y) * (newZ / c.z),
        z: newZ,
      };
      flush();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [flush]);

  const zoomBy = (factor: number) => {
    if (!containerRef.current) return;
    const r  = containerRef.current.getBoundingClientRect();
    const c  = cameraRef.current;
    const mx = r.width  / 2;
    const my = r.height / 2;
    const newZ = Math.min(3, Math.max(0.1, c.z * factor));
    cameraRef.current = {
      x: mx - (mx - c.x) * (newZ / c.z),
      y: my - (my - c.y) * (newZ / c.z),
      z: newZ,
    };
    flush();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    setIsDragging(true);
    dragStart.current = {
      mx: e.clientX, my: e.clientY,
      cx: cameraRef.current.x, cy: cameraRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    cameraRef.current.x = dragStart.current.cx + e.clientX - dragStart.current.mx;
    cameraRef.current.y = dragStart.current.cy + e.clientY - dragStart.current.my;
    flush();
  };

  const stopDrag = () => { dragging.current = false; setIsDragging(false); };

  const positions = layoutNodes(agents);
  const compPos   = positions['__company__'];
  const compCX    = compPos.x + COMPANY_W / 2;
  const compCY    = compPos.y + COMPANY_H / 2;

  const edges = agents.map((agent) => {
    const ap = positions[agent.id];
    const t  = tierKey(agent);
    return {
      id:    agent.id,
      color: TIER[t].edge,
      alpha: TIER[t].edgeAlpha,
      path:  bezier(ap.x + NODE_W / 2, ap.y + NODE_H / 2, compCX, compCY),
    };
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>

      {/* ── Zoom controls ───────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {([
          { label: '+', title: 'Zoom in',  fn: () => zoomBy(1.25) },
          { label: '−', title: 'Zoom out', fn: () => zoomBy(0.8) },
          { label: '⊡', title: 'Fit view', fn: fitView },
        ] as const).map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={btn.fn}
            style={{
              width: 30, height: 30,
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid rgba(71,85,105,0.55)',
              borderRadius: 7, color: '#94a3b8',
              cursor: 'pointer',
              fontSize: btn.label === '⊡' ? 13 : 19,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              lineHeight: 1,
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Zoom % indicator ────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 10, right: 14, zIndex: 20,
        fontSize: 10, color: '#334155', fontFamily: 'monospace',
      }}>
        {Math.round(camera.z * 100)}%
      </div>

      {/* ── Hint ────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 10, left: 14, zIndex: 20,
        fontSize: 10, color: '#1e293b',
      }}>
        scroll to zoom · drag to pan
      </div>

      {/* ── Viewport ────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          width: '100%', height: '100%',
          background: '#060c1a',
          borderRadius: 12,
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        {/* ── Transformable canvas ────────────────────── */}
        <div
          style={{
            position: 'absolute',
            width: CANVAS_W, height: CANVAS_H,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Dot grid background */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <defs>
              <pattern id="dot-grid" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="15" cy="15" r="1" fill="#1a2640" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)" />
          </svg>

          {/* ── SVG edges (behind nodes) ────────────── */}
          <svg
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none', overflow: 'visible',
            }}
          >
            {edges.map((e) => (
              <g key={e.id}>
                {/* Ambient glow */}
                <path
                  d={e.path} stroke={e.color} strokeWidth={5} fill="none"
                  strokeOpacity={0.1} strokeLinecap="round"
                />
                {/* Animated dash line */}
                <path
                  d={e.path} stroke={e.color} strokeWidth={1.5} fill="none"
                  strokeOpacity={e.alpha} strokeLinecap="round"
                  strokeDasharray="7 5"
                  style={{ animation: 'dashFlow 2.2s linear infinite' }}
                />
              </g>
            ))}
          </svg>

          {/* ── COMPANY node ──────────────────────────── */}
          <CompanyNode pos={compPos} />

          {/* ── Agent nodes ───────────────────────────── */}
          {agents.map((agent) => (
            <AgentNode
              key={agent.id}
              agent={agent}
              pos={positions[agent.id]}
              onClick={(ev) => { ev.stopPropagation(); onAgentClick(agent); }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes dashFlow {
          to { stroke-dashoffset: -24; }
        }
        @keyframes nodePulse {
          0%,100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── COMPANY centre node ───────────────────────────────────────
function CompanyNode({ pos }: { pos: { x: number; y: number } }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y,
        width: COMPANY_W, height: COMPANY_H,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 32%, rgba(99,102,241,0.45), rgba(10,15,30,0.97) 68%)',
        border: '2px solid rgba(99,102,241,0.65)',
        boxShadow: '0 0 36px rgba(99,102,241,0.4), 0 0 80px rgba(99,102,241,0.14)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        zIndex: 3,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      <span style={{ color: '#a5b4fc', fontWeight: 800, fontSize: 11, letterSpacing: '0.12em' }}>
        COMPANY
      </span>
      <span style={{ color: 'rgba(99,102,241,0.45)', fontSize: 9, marginTop: 3, letterSpacing: '0.08em' }}>
        HQ
      </span>
    </div>
  );
}

// ── Agent node ────────────────────────────────────────────────
function AgentNode({
  agent,
  pos,
  onClick,
}: {
  agent: Agent;
  pos: { x: number; y: number };
  onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const t       = tierKey(agent);
  const s       = TIER[t];
  const initial = skipWords(agent.name);
  const isActive = agent.status === 'active';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y,
        width: NODE_W, height: NODE_H,
        borderRadius: 10,
        background: 'linear-gradient(145deg, rgba(12,19,36,0.94), rgba(4,8,20,0.97))',
        border: `1.5px solid ${isActive || hovered ? s.border : 'rgba(35,50,75,0.55)'}`,
        boxShadow: isActive
          ? s.glow
          : hovered
          ? `${s.hoverGlow}, 0 8px 28px rgba(0,0,0,0.5)`
          : '0 4px 18px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        overflow: 'hidden',
        zIndex: 4,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        backdropFilter: 'blur(18px)',
        userSelect: 'none',
      }}
    >
      {/* Top colour strip */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${s.border}bb, ${s.border}00)`,
      }} />

      {/* Content row */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 9, padding: '8px 10px 5px',
      }}>
        {/* Initial circle */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: `radial-gradient(circle at 38% 32%, ${s.border}28, ${s.border}07)`,
          border: `1.5px solid ${s.border}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, color: s.initial,
          flexShrink: 0,
          animation: isActive ? 'nodePulse 2.5s ease-in-out infinite' : 'none',
        }}>
          {initial}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: '#dde4f0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {agent.name}
          </div>
          <div style={{
            fontSize: 10, color: '#3d5070', marginTop: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {agent.role || t}
          </div>
        </div>

        {/* Live dot */}
        {isActive && (
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: s.border, boxShadow: `0 0 6px ${s.border}`,
            flexShrink: 0,
          }} />
        )}
      </div>

      {/* Footer row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 10px 7px',
      }}>
        <span style={{
          fontSize: 9, color: s.border, opacity: 0.6,
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {s.label}
        </span>
        <span style={{ fontSize: 9, color: '#243050' }}>
          {agent.status ?? 'idle'}
        </span>
      </div>
    </div>
  );
}
