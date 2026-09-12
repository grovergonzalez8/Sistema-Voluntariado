import type { HTMLAttributes, ReactNode } from 'react';

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
}

export function LoadingState({
  children,
  className = '',
  ...props
}: LoadingStateProps) {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className={`loading-state ${className}`.trim()}
      role="status"
      {...props}
    >
      <span aria-hidden="true" className="loading-state__indicator" />
      <span>{children}</span>
    </div>
  );
}
