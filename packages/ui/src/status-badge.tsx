import type { HTMLAttributes, ReactNode } from 'react';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly children: ReactNode;
  readonly tone?: 'danger' | 'info' | 'neutral' | 'success' | 'warning';
}

export function StatusBadge({
  children,
  className = '',
  tone = 'neutral',
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${tone} ${className}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}
