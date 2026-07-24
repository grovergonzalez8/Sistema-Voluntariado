interface StartupErrorProps {
  readonly message: string;
}

export function StartupError({ message }: StartupErrorProps) {
  return (
    <main className="centered-status">
      <section aria-labelledby="startup-error-title" className="panel">
        <h1 id="startup-error-title">La aplicación no puede iniciar</h1>
        <p className="notice notice--error" role="alert">
          {message}
        </p>
        <p>
          Revisa `.env.local` a partir de `.env.example` y vuelve a iniciar.
        </p>
      </section>
    </main>
  );
}
