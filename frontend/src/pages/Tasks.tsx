// ============================================================
// Tasks Page — Kanban-style columns + create task modal
// ============================================================

import { useEffect, useState } from 'react';
import { Plus, X, GripVertical, Loader2, Ban } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { api } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import type { Task, TaskPriority } from '../types';

const KANBAN_COLUMNS = [
  { key: 'queued', label: 'Queued' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'Review' },
  { key: 'completed', label: 'Completed' },
] as const;

export default function Tasks() {
  const { tasks, loading, error, fetchTasks, createTask } = useTaskStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newComplexity, setNewComplexity] = useState(1);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createTask({
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      priority: newPriority,
      complexity: newComplexity,
    });
    setNewTitle('');
    setNewDescription('');
    setNewPriority('normal');
    setNewComplexity(1);
    setShowCreateModal(false);
  };

  const getTasksByStatus = (status: string): Task[] =>
    tasks.filter((t) => t.status === status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Tasks</h2>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Task
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && <div className="text-gray-500">Loading tasks...</div>}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(({ key, label }) => {
          const columnTasks = getTasksByStatus(key);
          return (
            <div key={key} className="flex-shrink-0 w-64">
              {/* Column header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  {label}
                </h3>
                <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>

              {/* Column tasks */}
              <div className="space-y-3">
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onRefresh={() => fetchTasks()} />
                ))}
                {columnTasks.length === 0 && (
                  <div className="text-center py-8 text-gray-600 text-sm border border-dashed border-gray-700 rounded-lg">
                    No tasks
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Also show created/failed/cancelled at the bottom */}
      {tasks.filter((t) => ['created', 'failed', 'cancelled'].includes(t.status)).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Other Tasks
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tasks
              .filter((t) => ['created', 'failed', 'cancelled'].includes(t.status))
              .map((task) => (
                <TaskCard key={task.id} task={task} onRefresh={() => fetchTasks()} />
              ))}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Create New Task</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Build login page"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                  className="input w-full resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="input w-full"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="label">Complexity (1-5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={newComplexity}
                    onChange={(e) => setNewComplexity(parseInt(e.target.value) || 1)}
                    className="input w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!newTitle.trim()} className="btn-primary">
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TaskCard component ───────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onRefresh: () => void;
}

function TaskCard({ task, onRefresh }: TaskCardProps) {
  const complexityDots = Array.from({ length: 5 }, (_, i) => i < task.complexity);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const canCancel = task.status === 'in_progress' || task.status === 'assigned';

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Cancel task "${task.title}"?`)) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api.cancelTask(task.id);
      onRefresh();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="card hover:border-gray-600 transition-colors">
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <StatusBadge status={task.priority} />
        <div className="flex gap-1">
          {complexityDots.map((filled, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${filled ? 'bg-blue-400' : 'bg-gray-700'}`}
            />
          ))}
        </div>
      </div>

      {task.assignedAgentId && (
        <div className="mt-2 text-xs text-gray-500">
          Assigned: <span className="text-gray-400">{task.assignedAgentId.slice(0, 8)}...</span>
        </div>
      )}

      {cancelError && (
        <p className="text-xs text-red-400 mt-1">{cancelError}</p>
      )}

      {canCancel && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-400 transition-colors disabled:opacity-50"
          >
            {cancelling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Ban className="w-3 h-3" />
            )}
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
