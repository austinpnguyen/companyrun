// ============================================================
// StatusBadge — colored badge for various status values
// ============================================================

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const colorMap: Record<string, string> = {
  // Agent statuses
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  review: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  suspended: 'bg-red-500/20 text-red-300 border-red-500/30',
  fired: 'bg-red-600/20 text-red-400 border-red-600/30',
  archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',

  // Task statuses
  created: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  queued: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  assigned: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  in_review: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',

  // Task priorities
  urgent: 'bg-red-600/20 text-red-400 border-red-600/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',

  // Orchestrator
  running: 'bg-green-500/20 text-green-400 border-green-500/30',
  stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const defaultColor = 'bg-gray-500/20 text-gray-400 border-gray-500/30';

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const colors = colorMap[status] ?? defaultColor;
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium capitalize ${colors} ${sizeClass}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
