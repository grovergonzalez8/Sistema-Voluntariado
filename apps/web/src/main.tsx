import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ApplicationRoot } from './app/application-root';
import { createApplicationServices } from './app/composition/application-services';
import { loadEnvironment } from './app/config/environment';
import { createI18n } from './app/providers/i18n';
import { StartupError } from './shared/presentation/startup-error';
import './styles.css';

const container = document.querySelector('#root');

if (!container) {
  throw new Error('No se encontró el contenedor raíz de la aplicación.');
}

const root = createRoot(container);

async function bootstrap() {
  try {
    const environment = loadEnvironment();
    const [i18n, services] = await Promise.all([
      createI18n(),
      Promise.resolve(createApplicationServices(environment)),
    ]);

    root.render(
      <StrictMode>
        <ApplicationRoot i18n={i18n} services={services} />
      </StrictMode>,
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Ocurrió un error de configuración desconocido.';
    root.render(
      <StrictMode>
        <StartupError message={message} />
      </StrictMode>,
    );
  }
}

void bootstrap();
