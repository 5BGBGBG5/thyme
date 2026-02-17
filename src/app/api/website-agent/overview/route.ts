import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Pages summary
    const { data: pages } = await supabase
      .from('website_agent_pages')
      .select('health_score, has_broken_links, broken_link_count, meta_issues')
      .eq('is_active', true);

    const allPages = pages || [];
    const totalPages = allPages.length;
    const avgHealthScore = totalPages > 0
      ? allPages.reduce((sum, p) => sum + (p.health_score || 0), 0) / totalPages
      : 0;
    const brokenLinksCount = allPages.reduce((sum, p) => sum + (p.broken_link_count || 0), 0);
    const metaIssuesCount = allPages.filter(p => p.meta_issues && (p.meta_issues as string[]).length > 0).length;
    const criticalPages = allPages.filter(p => p.health_score !== null && p.health_score < 30).length;

    // Findings this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: findingsThisWeek } = await supabase
      .from('website_agent_findings')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneWeekAgo);

    // Pending recommendations
    const { count: pendingRecommendations } = await supabase
      .from('website_agent_decision_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Recent activity
    const { data: recentActivity } = await supabase
      .from('website_agent_change_log')
      .select('action_type, action_detail, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    // Top issues (recent findings sorted by severity)
    const { data: topIssues } = await supabase
      .from('website_agent_findings')
      .select('id, finding_type, severity, title, page_url, health_score, status, created_at')
      .in('status', ['new', 'recommendation_drafted'])
      .order('created_at', { ascending: false })
      .limit(5);

    // Latest conversion audit
    const { data: conversionAudit } = await supabase
      .from('website_agent_conversion_audit')
      .select('tracking_health, ga4_key_events_count, hubspot_forms_count')
      .order('audit_date', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      totalPages,
      avgHealthScore: Math.round(avgHealthScore * 10) / 10,
      criticalPages,
      findingsThisWeek: findingsThisWeek || 0,
      pendingRecommendations: pendingRecommendations || 0,
      brokenLinksCount,
      metaIssuesCount,
      conversionHealth: conversionAudit?.tracking_health || 'unknown',
      recentActivity: recentActivity || [],
      topIssues: topIssues || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
