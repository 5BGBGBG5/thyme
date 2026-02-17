import { supabase } from '../supabase';
import { getSearchAnalytics } from './search-console-client';
import type { KeywordCoverageGap } from './types';

/**
 * Check keyword-to-page coverage.
 * Consumes Saffron's signals to find keywords being paid for that have no organic page.
 */
export async function checkKeywordCoverage(): Promise<KeywordCoverageGap[]> {
  const gaps: KeywordCoverageGap[] = [];

  // Pull relevant signals from Saffron
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: signals } = await supabase
    .from('shared_agent_signals')
    .select('event_type, payload, created_at')
    .eq('source_agent', 'saffron')
    .in('event_type', ['trending_search_term', 'high_cpc_alert'])
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!signals || signals.length === 0) return gaps;

  // Extract unique keywords from signals
  const keywordSet = new Map<string, { spend: number | null; cpc: number | null }>();

  for (const signal of signals) {
    const payload = signal.payload as Record<string, unknown>;
    const keyword = (payload.keyword as string) || (payload.searchTerm as string);
    if (!keyword) continue;

    const normalized = keyword.toLowerCase().trim();
    if (!keywordSet.has(normalized)) {
      keywordSet.set(normalized, {
        spend: (payload.monthlySpend as number) || (payload.cost as number) || null,
        cpc: (payload.cpc as number) || (payload.currentCpc as number) || null,
      });
    }
  }

  // Check Search Console for each keyword
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  for (const [keyword, meta] of keywordSet) {
    try {
      const searchData = await getSearchAnalytics({
        startDate,
        endDate,
        dimensions: ['query', 'page'],
        dimensionFilterGroups: [
          {
            filters: [
              { dimension: 'query', operator: 'contains', expression: keyword },
            ],
          },
        ],
        rowLimit: 5,
      });

      const rows = searchData.rows || [];
      const hasOrganicPage = rows.length > 0;
      const bestRow = rows[0];

      gaps.push({
        keyword,
        monthlySpend: meta.spend,
        cpc: meta.cpc,
        hasOrganicPage,
        bestRankingPage: bestRow ? bestRow.keys[1] : null,
        position: bestRow ? bestRow.position : null,
      });
    } catch {
      // Search Console query failed — record gap with unknown organic status
      gaps.push({
        keyword,
        monthlySpend: meta.spend,
        cpc: meta.cpc,
        hasOrganicPage: false,
        bestRankingPage: null,
        position: null,
      });
    }
  }

  // Return only gaps (keywords without good organic coverage)
  return gaps.filter(g => !g.hasOrganicPage || (g.position !== null && g.position > 20));
}
