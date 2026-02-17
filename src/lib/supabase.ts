import { createClient } from '@supabase/supabase-js';

// Server client — used by API routes and cron jobs (service key, no session persistence)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_AIEO_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.AIEO_SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_AIEO_SUPABASE_ANON_KEY || 'placeholder',
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Browser client — cookie-based auth for cross-subdomain SSO on .inecta-salt.com
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_AIEO_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.NEXT_PUBLIC_AIEO_SUPABASE_ANON_KEY || 'placeholder',
  {
    auth: {
      flowType: 'pkce',
      storage: {
        getItem: (key) => {
          if (typeof document === 'undefined') return null;
          const match = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
          return match ? decodeURIComponent(match[1]) : null;
        },
        setItem: (key, value) => {
          if (typeof document === 'undefined') return;
          document.cookie = `${key}=${encodeURIComponent(value)}; domain=.inecta-salt.com; path=/; max-age=2592000; SameSite=Lax; Secure`;
        },
        removeItem: (key) => {
          if (typeof document === 'undefined') return;
          document.cookie = `${key}=; domain=.inecta-salt.com; path=/; max-age=0`;
        },
      },
    },
  }
);
