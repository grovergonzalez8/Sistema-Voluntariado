import { z } from 'zod';

const environmentSchema = z.object({
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SUPABASE_URL: z.url(),
});

export interface Environment {
  readonly supabaseAnonKey: string;
  readonly supabaseUrl: string;
}

export function loadEnvironment(): Environment {
  const viteEnvironment: unknown = import.meta.env;
  const rawEnvironment =
    typeof viteEnvironment === 'object' && viteEnvironment !== null
      ? (viteEnvironment as Record<string, unknown>)
      : {};
  const result = environmentSchema.safeParse({
    VITE_SUPABASE_ANON_KEY: rawEnvironment['VITE_SUPABASE_ANON_KEY'],
    VITE_SUPABASE_URL: rawEnvironment['VITE_SUPABASE_URL'],
  });

  if (!result.success) {
    throw new Error(
      'Configuración incompleta: define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
    );
  }

  return {
    supabaseAnonKey: result.data.VITE_SUPABASE_ANON_KEY,
    supabaseUrl: result.data.VITE_SUPABASE_URL,
  };
}
