import { useId, type ReactNode } from 'react';

export interface EmptyStateProps {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly title: ReactNode;
}

export function EmptyState({
  actions,
  children,
  description,
  title,
}: EmptyStateProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="empty-state panel">
      <h2 id={titleId}>{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
      {children}
      {actions ? <div className="button-row">{actions}</div> : null}
    </section>
  );
}
