import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const findingType = searchParams.get('type');
    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('website_agent_findings')
      .select('*', { count: 'exact' });

    if (findingType) query = query.eq('finding_type', findingType);
    if (severity) query = query.eq('severity', severity);
    if (status) query = query.eq('status', status);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get decision queue items for findings with recommendations
    const findingIds = (data || []).map(f => f.id);
    let decisions: Record<string, unknown>[] = [];
    if (findingIds.length > 0) {
      const { data: dqItems } = await supabase
        .from('website_agent_decision_queue')
        .select('*')
        .in('finding_id', findingIds);
      decisions = dqItems || [];
    }

    return NextResponse.json({
      findings: data || [],
      decisions,
      total: count || 0,
      offset,
      limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
