import { supabase } from '../supabase';
import { emitSignal } from '../signals';

interface TrendData {
  totalTraffic: number;
  trafficChangePct: number;
  avgHealthScore: number;
  healthScoreDistribution: Record<string, number>;
  topDecliningPages: Array<{ url: string; change: number; score: number }>;
  topImprovingPages: Array<{ url: string; change: number; score: number }>;
  brokenLinksCount: number;
  newBrokenLinks: number;
  metaIssuesCount: number;
}

/**
 * Compute trends by comparing current data with previous periods.
 */
export async function computeTrends(): Promise<TrendData> {
  const today = new Date().toISOString().split('T')[0];

  // Get all pages with health scores
  const { data: pages } = await supabase
    .from('website_agent_pages')
    .select('url, health_score, has_broken_links, broken_link_count, meta_issues')
    .eq('is_active', true)
    .range(0, 1999);

  const allPages = pages || [];

  // Calculate health score distribution
  const distribution: Record<string, number> = {
    '0-20': 0,
    '21-40': 0,
    '41-60': 0,
    '61-80': 0,
    '81-100': 0,
  };

  let totalScore = 0;
  let scoredPages = 0;

  for (const page of allPages) {
    if (page.health_score !== null) {
      scoredPages++;
      totalScore += page.health_score;

      if (page.health_score <= 20) distribution['0-20']++;
      else if (page.health_score <= 40) distribution['21-40']++;
      else if (page.health_score <= 60) distribution['41-60']++;
      else if (page.health_score <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    }
  }

  const avgHealthScore = scoredPages > 0 ? totalScore / scoredPages : 0;

  // Get GA4 snapshots for traffic comparison
  const { data: currentGA4 } = await supabase
    .from('website_agent_ga4_snapshots')
    .select('page_url, active_users, traffic_change_pct')
    .eq('snapshot_date', today);

  const ga4Data = currentGA4 || [];
  const totalTraffic = ga4Data.reduce((sum, d) => sum + (d.active_users || 0), 0);

  // Find declining and improving pages
  const decliningPages = ga4Data
    .filter(d => d.traffic_change_pct !== null && d.traffic_change_pct < -10)
    .sort((a, b) => (a.traffic_change_pct || 0) - (b.traffic_change_pct || 0))
    .slice(0, 5)
    .map(d => {
      const page = allPages.find(p => p.url === d.page_url);
      return {
        url: d.page_url,
        change: d.traffic_change_pct || 0,
        score: page?.health_score || 0,
      };
    });

  const improvingPages = ga4Data
    .filter(d => d.traffic_change_pct !== null && d.traffic_change_pct > 10)
    .sort((a, b) => (b.traffic_change_pct || 0) - (a.traffic_change_pct || 0))
    .slice(0, 5)
    .map(d => {
      const page = allPages.find(p => p.url === d.page_url);
      return {
        url: d.page_url,
        change: d.traffic_change_pct || 0,
        score: page?.health_score || 0,
      };
    });

  // Count broken links and meta issues
  const brokenLinksCount = allPages.reduce((sum, p) => sum + (p.broken_link_count || 0), 0);
  const metaIssuesCount = allPages.filter(p => p.meta_issues && (p.meta_issues as string[]).length > 0).length;

  // Count new broken links (detected today)
  const { count: newBrokenLinks } = await supabase
    .from('website_agent_link_health')
    .select('id', { count: 'exact', head: true })
    .eq('is_broken', true)
    .gte('first_detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  // Get previous trend for traffic comparison
  const { data: prevTrend } = await supabase
    .from('website_agent_trend_snapshots')
    .select('total_traffic')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const prevTraffic = prevTrend?.total_traffic || totalTraffic;
  const trafficChangePct = prevTraffic > 0
    ? ((totalTraffic - prevTraffic) / prevTraffic) * 100
    : 0;

  return {
    totalTraffic,
    trafficChangePct,
    avgHealthScore,
    healthScoreDistribution: distribution,
    topDecliningPages: decliningPages,
    topImprovingPages: improvingPages,
    brokenLinksCount,
    newBrokenLinks: newBrokenLinks || 0,
    metaIssuesCount,
  };
}

/**
 * Generate and store a trend snapshot.
 */
export async function generateTrendSnapshot(
  period: 'daily' | 'weekly' = 'weekly'
): Promise<TrendData> {
  const trends = await computeTrends();
  const today = new Date().toISOString().split('T')[0];

  await supabase.from('website_agent_trend_snapshots').insert({
    snapshot_date: today,
    period,
    total_traffic: trends.totalTraffic,
    traffic_change_pct: trends.trafficChangePct,
    avg_health_score: trends.avgHealthScore,
    health_score_distribution: trends.healthScoreDistribution,
    top_declining_pages: trends.topDecliningPages,
    top_improving_pages: trends.topImprovingPages,
    broken_links_count: trends.brokenLinksCount,
    new_broken_links: trends.newBrokenLinks,
    meta_issues_count: trends.metaIssuesCount,
  });

  return trends;
}

/**
 * Emit trend-based signals for cross-agent awareness.
 */
export async function emitTrendSignals(trends: TrendData): Promise<void> {
  // Broken links signal
  if (trends.newBrokenLinks > 0) {
    await emitSignal('broken_links_detected', {
      count: trends.newBrokenLinks,
      totalBroken: trends.brokenLinksCount,
    });
  }

  // Traffic trend signal
  if (trends.trafficChangePct < -15) {
    await emitSignal('page_traffic_drop', {
      siteWide: true,
      totalTraffic: trends.totalTraffic,
      changePct: trends.trafficChangePct,
      topDeclining: trends.topDecliningPages.slice(0, 3),
    });
  }
}
