import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const origin = request.nextUrl.origin;

    // Forward the trigger to the scan route
    const res = await fetch(`${origin}/api/website-agent/scan`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Scan trigger failed: ${errorText}` },
        { status: res.status }
      );
    }

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
