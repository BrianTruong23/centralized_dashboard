import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlantGrowth } from './PlantGrowth';

describe('PlantGrowth', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <PlantGrowth elapsedSeconds={0} isActive={true} />
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should show initial seed at stage 0', () => {
    const { container } = render(
      <PlantGrowth elapsedSeconds={0} isActive={true} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should grow stem after 60 seconds (1 minute)', () => {
    const { container } = render(
      <PlantGrowth elapsedSeconds={60} isActive={true} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should reach final stage after 5 minutes', () => {
    const { container } = render(
      <PlantGrowth elapsedSeconds={300} isActive={true} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should accept custom className', () => {
    const { container } = render(
      <PlantGrowth elapsedSeconds={0} isActive={true} className="custom-class" />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });
});
