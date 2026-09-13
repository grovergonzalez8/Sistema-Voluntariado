import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly label: string;
  readonly name: string;
}

export function Field({
  'aria-describedby': describedBy,
  error,
  hint,
  id,
  label,
  name,
  ...props
}: FieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const describedByIds = [describedBy, hintId, error ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      <input
        aria-describedby={describedByIds || undefined}
        aria-invalid={error ? true : undefined}
        id={inputId}
        name={name}
        {...props}
      />
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
