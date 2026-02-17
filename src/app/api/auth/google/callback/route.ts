import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/website/google-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json(
      { error: `OAuth error: ${error}` },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: 'Missing authorization code' },
      { status: 400 }
    );
  }

  try {
    await exchangeCodeForTokens(code);

    // Redirect to dashboard on success
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to exchange code: ${message}` },
      { status: 500 }
    );
  }
}
