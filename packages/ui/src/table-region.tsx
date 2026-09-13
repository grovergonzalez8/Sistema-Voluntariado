import type { HTMLAttributes, ReactNode } from 'react';

export interface TableRegionProps extends HTMLAttributes<HTMLDivElement> {
  readonly 'aria-label': string;
  readonly children: ReactNode;
}

export function TableRegion({
  'aria-label': ariaLabel,
  children,
  className = '',
  ...props
}: TableRegionProps) {
  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={`table-region table-scroll ${className}`.trim()}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
