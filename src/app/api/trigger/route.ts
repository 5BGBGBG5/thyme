import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const origin = request.nextUrl.origin;

    // Fire the scan route without waiting for completion.
    // The scan logs its results to the database — no need to block here.
    fetch(`${origin}/api/website-agent/scan`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    }).catch(err => {
      console.error('Scan fire-and-forget error:', err);
    });

    return NextResponse.json({
      triggered: true,
      agent: 'thyme',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Trigger failed: ${message}` },
      { status: 500 }
    );
  }
}
