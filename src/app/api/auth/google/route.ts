import { NextResponse } from 'next/server';
import { getAuthorizationUrl } from '@/lib/website/google-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const url = getAuthorizationUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
