import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

interface SupabaseBrowserEnvironment {
  readonly supabaseAnonKey: string;
  readonly supabaseUrl: string;
}

export function createSupabaseBrowserClient(
  environment: SupabaseBrowserEnvironment,
): SupabaseClient<Database> {
  return createClient<Database>(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    },
  );
}
