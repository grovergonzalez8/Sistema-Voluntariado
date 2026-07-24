import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly error?: string | undefined;
  readonly label: string;
  readonly name: string;
}

export function Field({ error, id, label, name, ...props }: FieldProps) {
  const inputId = id ?? name;
  const errorId = `${inputId}-error`;

  return (
    <label className="field" htmlFor={inputId}>
      <span>{label}</span>
      <input
        aria-describedby={error ? errorId : undefined}
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
