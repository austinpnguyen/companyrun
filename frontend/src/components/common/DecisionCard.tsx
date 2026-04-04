// ============================================================
// DecisionCard — pending decision with Approve/Reject buttons
// ============================================================

import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { Decision } from '../../types';

interface DecisionCardProps {
  decision: Decision;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const urgencyColors: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-gray-400',
};

export default function DecisionCard({ decision, onApprove, onReject }: DecisionCardProps) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${urgencyColors[decision.urgency] ?? 'text-gray-400'}`} />
          <span className="text-sm font-medium text-gray-200 capitalize">
            {decision.type.replace(/_/g, ' ')}
          </span>
        </div>
        <span className="text-xs text-gray-500 capitalize">{decision.urgency} urgency</span>
      </div>

      <p className="text-sm text-gray-400 mb-3">{decision.reason}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onApprove(decision.id)}
          className="flex items-center gap-1.5 btn-success text-xs px-3 py-1.5"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Approve
        </button>
        <button
          onClick={() => onReject(decision.id)}
          className="flex items-center gap-1.5 btn-danger text-xs px-3 py-1.5"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    </div>
  );
}
