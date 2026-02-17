import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const pageType = searchParams.get('type');
    const minScore = searchParams.get('minScore');
    const maxScore = searchParams.get('maxScore');
    const hasForm = searchParams.get('hasForm');
    const hasBrokenLinks = searchParams.get('hasBrokenLinks');
    const sortBy = searchParams.get('sortBy') || 'health_score';
    const sortDir = searchParams.get('sortDir') || 'asc';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('website_agent_pages')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    if (pageType) query = query.eq('page_type', pageType);
    if (minScore) query = query.gte('health_score', parseInt(minScore));
    if (maxScore) query = query.lte('health_score', parseInt(maxScore));
    if (hasForm === 'true') query = query.eq('has_form', true);
    if (hasBrokenLinks === 'true') query = query.eq('has_broken_links', true);

    query = query
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      pages: data || [],
      total: count || 0,
      offset,
      limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
