import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly titleClassName?: string;
  readonly titleId?: string;
}

export function PageHeader({
  actions,
  children,
  description,
  eyebrow,
  title,
  titleClassName,
  titleId,
}: PageHeaderProps) {
  return (
    <header className={`page-header${actions ? ' page-header--actions' : ''}`}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className={titleClassName} id={titleId}>
          {title}
        </h1>
        {description ? <p className="muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
