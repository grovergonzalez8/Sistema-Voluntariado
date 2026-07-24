import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      common: { retry: 'Try again', signOut: 'Sign out' },
      login: {
        description: 'Use the personal account provided by the organization.',
        email: 'Email',
        password: 'Password',
        submit: 'Sign in',
        submitting: 'Signing in…',
        title: 'Welcome back',
      },
      navigation: { profile: 'My profile' },
      profile: {
        description:
          'Only your display name and preferred language are editable.',
        displayName: 'Display name',
        emptyDescription: 'Ask an authorized person to provision your profile.',
        emptyTitle: 'Profile unavailable',
        errorTitle: 'We could not load your profile',
        eyebrow: 'Personal settings',
        loading: 'Loading profile…',
        preferredLocale: 'Preferred language',
        save: 'Save changes',
        saved: 'Profile updated.',
        saving: 'Saving…',
        title: 'My profile',
      },
      shell: { activeSession: 'Active personal session' },
      validation: {
        displayName: 'Enter between 1 and 100 characters.',
        email: 'Enter a valid email.',
        locale: 'Select a valid language.',
        password: 'The password must have at least 8 characters.',
      },
    },
  },
  es: {
    translation: {
      common: { retry: 'Reintentar', signOut: 'Cerrar sesión' },
      login: {
        description: 'Utiliza la cuenta personal provista por la organización.',
        email: 'Correo electrónico',
        password: 'Contraseña',
        submit: 'Iniciar sesión',
        submitting: 'Ingresando…',
        title: 'Bienvenido de nuevo',
      },
      navigation: { profile: 'Mi perfil' },
      profile: {
        description:
          'Solo puedes editar tu nombre visible y el idioma preferido.',
        displayName: 'Nombre visible',
        emptyDescription:
          'Solicita a una persona autorizada que habilite tu perfil.',
        emptyTitle: 'Perfil no disponible',
        errorTitle: 'No pudimos cargar tu perfil',
        eyebrow: 'Configuración personal',
        loading: 'Cargando perfil…',
        preferredLocale: 'Idioma preferido',
        save: 'Guardar cambios',
        saved: 'Perfil actualizado.',
        saving: 'Guardando…',
        title: 'Mi perfil',
      },
      shell: { activeSession: 'Sesión personal activa' },
      validation: {
        displayName: 'Escribe entre 1 y 100 caracteres.',
        email: 'Escribe un correo válido.',
        locale: 'Selecciona un idioma válido.',
        password: 'La contraseña debe tener al menos 8 caracteres.',
      },
    },
  },
} as const;

export async function createI18n(): Promise<i18n> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    fallbackLng: 'es',
    interpolation: { escapeValue: false },
    lng: 'es',
    resources,
  });
  return instance;
}
