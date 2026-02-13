import { render, screen } from '@testing-library/react';
import { format } from 'date-fns';
import { TaskItem } from '@/components/TaskItem';
import { Task } from '@/types/task';

function localDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'MMM d');
}

describe('TaskItem deadline rendering', () => {
  it('renders YYYY-MM-DD deadlines as local date (not previous day)', () => {
    const deadline = '2026-02-13';

    const task: Task = {
      id: 't1',
      title: 'Date check',
      description: '',
      status: 'todo',
      category: 'Life',
      priority: 3,
      estimatedMinutes: 30,
      energyLevel: 'medium',
      tags: [],
      createdAt: Date.now(),
      deadline,
    };

    render(
      <TaskItem
        task={task}
        onUpdate={() => {}}
        onDelete={() => {}}
        onFocus={() => {}}
        projects={[]}
      />
    );

    expect(screen.getByText(localDateLabel(deadline))).toBeInTheDocument();
  });
});
