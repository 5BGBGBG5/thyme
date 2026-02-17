import { supabase } from '../supabase';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

/**
 * Get a valid Google OAuth2 access token.
 * Loads from Supabase, refreshes if expired (with 60s buffer).
 */
export async function getAccessToken(): Promise<string> {
  const { data: row, error } = await supabase
    .from('website_agent_google_auth')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !row) {
    throw new Error('No Google auth tokens found. Complete OAuth flow first.');
  }

  // Check if token is still valid (with 60s buffer)
  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return row.access_token;
  }

  // Token expired — refresh it
  return refreshAccessToken(row.refresh_token);
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to refresh Google token: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Google may or may not return a new refresh token — keep the old one if not
  const newRefreshToken = data.refresh_token || refreshToken;

  await storeTokens(data.access_token, newRefreshToken, expiresAt, data.scope);

  return data.access_token;
}

async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  scopes: string
): Promise<void> {
  // Delete all existing rows and insert fresh (single-row pattern)
  await supabase
    .from('website_agent_google_auth')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  await supabase.from('website_agent_google_auth').insert({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scopes,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Build the Google OAuth2 authorization URL for initial setup.
 */
export function getAuthorizationUrl(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI');
  }

  const scopes = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens (used by OAuth callback route).
 */
export async function exchangeCodeForTokens(code: string): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth environment variables');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to exchange code for tokens: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  if (!data.refresh_token) {
    throw new Error('No refresh token received. Make sure prompt=consent is set.');
  }

  await storeTokens(data.access_token, data.refresh_token, expiresAt, data.scope);
}
