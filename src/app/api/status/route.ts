import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get last run from change log
    const { data: lastLog } = await supabase
      .from('website_agent_change_log')
      .select('action_type, action_detail, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get pending items count
    const { count: pendingItems } = await supabase
      .from('website_agent_decision_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    return NextResponse.json({
      agent: 'thyme',
      lastRun: lastLog?.created_at || null,
      lastAction: lastLog?.action_detail || null,
      pendingItems: pendingItems || 0,
      status: 'idle',
    });
  } catch {
    return NextResponse.json({
      agent: 'thyme',
      lastRun: null,
      lastAction: null,
      pendingItems: 0,
      status: 'error',
      errorMessage: 'Failed to fetch status',
    });
  }
}
