import { render, screen, fireEvent } from '@testing-library/react';
import AgentCanvas from './AgentCanvas';
import type { Agent } from '../types';

const mockWorker: Agent = {
  id: '1', name: 'Alice', role: 'developer', status: 'active',
  tier: 'worker', isAdversarial: false,
  systemPrompt: '', model: 'gpt-4o', provider: 'openrouter',
  personality: {}, memory: {}, config: {}, templateId: null,
  hiredAt: new Date().toISOString(), firedAt: null, fireReason: null,
  updatedAt: new Date().toISOString(),
};

const mockAdversarial: Agent = {
  ...mockWorker, id: '2', name: 'Auditor', role: 'auditor',
  tier: 'adversarial', isAdversarial: true,
};

describe('AgentCanvas', () => {
  it('renders empty state when no agents', () => {
    render(<AgentCanvas agents={[]} onAgentClick={vi.fn()} />);
    expect(screen.getByText(/No agents hired/i)).toBeInTheDocument();
  });

  it('renders agent nodes', () => {
    render(<AgentCanvas agents={[mockWorker, mockAdversarial]} onAgentClick={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Auditor')).toBeInTheDocument();
  });

  it('calls onAgentClick when node is clicked', () => {
    const onClick = vi.fn();
    render(<AgentCanvas agents={[mockWorker]} onAgentClick={onClick} />);
    fireEvent.click(screen.getByText('Alice').closest('g')!);
    expect(onClick).toHaveBeenCalledWith(mockWorker);
  });
});
