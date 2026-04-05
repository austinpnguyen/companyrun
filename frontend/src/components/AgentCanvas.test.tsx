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
  it('renders zoom controls', () => {
    render(<AgentCanvas agents={[]} onAgentClick={vi.fn()} />);
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByTitle('Fit view')).toBeInTheDocument();
  });

  it('renders agent nodes', () => {
    render(<AgentCanvas agents={[mockWorker, mockAdversarial]} onAgentClick={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Auditor')).toBeInTheDocument();
  });

  it('calls onAgentClick when node is clicked', () => {
    const onClick = vi.fn();
    render(<AgentCanvas agents={[mockWorker]} onAgentClick={onClick} />);
    // Click the node div (parent of the name text)
    const nameEl = screen.getByText('Alice');
    const nodeDiv = nameEl.closest('[style*="cursor: pointer"]') as HTMLElement;
    fireEvent.click(nodeDiv);
    expect(onClick).toHaveBeenCalledWith(mockWorker);
  });
});
