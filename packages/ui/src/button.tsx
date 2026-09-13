import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly busy?: boolean;
  readonly variant?: 'danger' | 'primary' | 'secondary';
}

export function Button({
  busy = false,
  className = '',
  type = 'button',
  variant,
  ...props
}: ButtonProps) {
  const variantClass = variant ? `button--${variant}` : '';
  const busyProps = busy ? { 'aria-busy': true } : {};

  return (
    <button
      className={`button ${variantClass} ${className}`.trim()}
      type={type}
      {...busyProps}
      {...props}
    />
  );
}
