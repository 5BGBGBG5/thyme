import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const period = searchParams.get('period') || 'weekly';
    const limit = parseInt(searchParams.get('limit') || '12');

    const { data, error } = await supabase
      .from('website_agent_trend_snapshots')
      .select('*')
      .eq('period', period)
      .order('snapshot_date', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      trends: (data || []).reverse(), // Chronological order
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
