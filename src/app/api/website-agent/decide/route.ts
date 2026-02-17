import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action, notes } = body as {
      id: string;
      action: 'approve' | 'reject';
      notes?: string;
    };

    if (!id || !action) {
      return NextResponse.json(
        { error: 'Missing id or action' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'Action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    // Update decision queue item
    const { data: item, error } = await supabase
      .from('website_agent_decision_queue')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewed_by: 'human',
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .single();

    if (error || !item) {
      return NextResponse.json(
        { error: 'Decision queue item not found or already reviewed' },
        { status: 404 }
      );
    }

    // Update associated finding status
    if (item.finding_id) {
      await supabase
        .from('website_agent_findings')
        .update({
          status: action === 'approve' ? 'approved' : 'expired',
        })
        .eq('id', item.finding_id);
    }

    // Log the decision
    await supabase.from('website_agent_change_log').insert({
      action_type: action === 'approve' ? 'recommendation_approved' : 'recommendation_rejected',
      action_detail: `${action === 'approve' ? 'Approved' : 'Rejected'}: ${item.action_summary}`,
      data_used: { decision_queue_id: id, finding_id: item.finding_id },
      reason: notes || null,
      outcome: action === 'approve' ? 'approved' : 'rejected',
      executed_by: 'human',
      executed_at: new Date().toISOString(),
    });

    // Create notification
    await supabase.from('website_agent_notifications').insert({
      notification_type: `recommendation_${action}ed`,
      severity: action === 'approve' ? 'success' : 'info',
      title: `Recommendation ${action}ed`,
      message: item.action_summary,
      related_entity_type: 'decision_queue',
      related_entity_id: id,
    });

    return NextResponse.json({
      success: true,
      id,
      action,
      status: action === 'approve' ? 'approved' : 'rejected',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Decision failed: ${message}` },
      { status: 500 }
    );
  }
}
