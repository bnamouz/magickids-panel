import { createClient, SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

// Browser client (anon, RLS enforced). Lazy-initialized on first use.
let _public: SupabaseClient | null = null;
export function getSupabasePublic() {
  if (!_public) {
    _public = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    );
  }
  return _public;
}

// Keep old export name for backward compatibility, using Proxy for lazy init.
export const supabasePublic = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabasePublic() as any)[prop];
  },
});

// Server client (service role, bypasses RLS – use only in API routes)
export function getSupabaseAdmin() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

// Server client with parent_token context (RLS enforced via SET)
export async function getSupabaseWithParentToken(token: string) {
  const client = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
  await client.rpc('set_config', {
    setting_name: 'app.parent_token',
    new_value: token,
    is_local: true,
  });
  return client;
}
