const allowedLocalSupabaseOrigins = new Set([
  'http://127.0.0.1:54321',
  'http://localhost:54321',
]);

export function assertLocalSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('E2E requires a valid local Supabase URL.');
  }

  if (
    !allowedLocalSupabaseOrigins.has(url.origin) ||
    url.pathname !== '/' ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error(
      'E2E refuses non-local Supabase URLs. Use http://127.0.0.1:54321 or http://localhost:54321.',
    );
  }

  return url.origin;
}
