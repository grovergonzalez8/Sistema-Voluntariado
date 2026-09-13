import type { HTMLAttributes, ReactNode } from 'react';

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly tone?: 'error' | 'info' | 'success' | 'warning';
}

export function Notice({
  children,
  className = '',
  role,
  tone = 'info',
  ...props
}: NoticeProps) {
  const defaultRole = tone === 'error' ? 'alert' : 'status';

  return (
    <div
      className={`notice notice--${tone} ${className}`.trim()}
      role={role ?? defaultRole}
      {...props}
    >
      {children}
    </div>
  );
}
