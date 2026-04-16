import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseKey = (
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim() ||
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim() ||
  ''
).trim();

/**
 * En Docker/PaaS, NEXT_PUBLIC_* se resuelve en build. Si el build no recibió esos ARG,
 * el bundle queda con strings vacíos y createClient('', '') puede tirar la app al
 * importar la página de sesión (useRealtimeAttendance).
 */
function createDisabledSupabaseClient(): SupabaseClient {
  const noopChannel = {
    on: () => noopChannel,
    subscribe: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  };
  return {
    channel: () => noopChannel as never,
    removeChannel: () => {},
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : createDisabledSupabaseClient();
