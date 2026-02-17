import type { WebPage, GA4Snapshot, SearchConsoleSnapshot, PageSpeedScore, HealthScoreBreakdown } from './types';

/**
 * Compute the health score for a page across 6 dimensions (0-100).
 */
export function computeHealthScore(
  page: WebPage,
  ga4Data: GA4Snapshot | null,
  searchData: SearchConsoleSnapshot | null,
  speedData: PageSpeedScore | null
): HealthScoreBreakdown {
  const trafficTrend = scoreTrafficTrend(ga4Data);
  const seoRanking = scoreSeoRanking(searchData);
  const pageSpeed = scorePageSpeed(speedData);
  const contentFreshness = scoreContentFreshness(page);
  const conversionHealth = scoreConversionHealth(page);
  const technicalHealth = scoreTechnicalHealth(page);

  return {
    traffic_trend: trafficTrend,
    seo_ranking: seoRanking,
    page_speed: pageSpeed,
    content_freshness: contentFreshness,
    conversion_health: conversionHealth,
    technical_health: technicalHealth,
    total: trafficTrend + seoRanking + pageSpeed + contentFreshness + conversionHealth + technicalHealth,
  };
}

/**
 * Traffic Trend (0-20)
 * Stable/growing: 20, Minor decline (<10%): 15, Moderate (10-30%): 8, Severe (>30%): 0
 */
function scoreTrafficTrend(ga4Data: GA4Snapshot | null): number {
  if (!ga4Data || ga4Data.traffic_change_pct === null) return 10; // No data — neutral

  const changePct = ga4Data.traffic_change_pct;

  if (changePct >= 0) return 20;              // Stable or growing
  if (changePct > -10) return 15;             // Minor decline
  if (changePct > -30) return 8;              // Moderate decline
  return 0;                                    // Severe decline
}

/**
 * SEO Ranking (0-20)
 * Top 10: 20, Top 20: 15, Top 50: 8, Not ranking: 0
 */
function scoreSeoRanking(searchData: SearchConsoleSnapshot | null): number {
  if (!searchData || !searchData.avg_position) return 0; // No data

  const pos = searchData.avg_position;

  if (pos <= 10) return 20;
  if (pos <= 20) return 15;
  if (pos <= 50) return 8;
  return 0;
}

/**
 * Page Speed (0-20)
 * Score 90+: 20, 70-89: 15, 50-69: 8, <50: 0
 */
function scorePageSpeed(speedData: PageSpeedScore | null): number {
  if (!speedData || speedData.performance_score === null) return 10; // No data — neutral

  const score = speedData.performance_score;

  if (score >= 90) return 20;
  if (score >= 70) return 15;
  if (score >= 50) return 8;
  return 0;
}

/**
 * Content Freshness (0-15)
 * <3 months: 15, 3-6 months: 10, 6-12 months: 5, >12 months: 0
 */
function scoreContentFreshness(page: WebPage): number {
  if (!page.last_updated_at) return 0; // No update date — assume stale

  const lastUpdated = new Date(page.last_updated_at);
  const daysSinceUpdate = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSinceUpdate < 90) return 15;       // < 3 months
  if (daysSinceUpdate < 180) return 10;      // 3-6 months
  if (daysSinceUpdate < 365) return 5;       // 6-12 months
  return 0;                                   // > 12 months
}

/**
 * Conversion Health (0-15)
 * Has form + tracking: 15, Has form but no tracking: 5, No form (blog): 10, No form (landing): 0
 */
function scoreConversionHealth(page: WebPage): number {
  if (page.has_form) {
    // For now, we can't easily check tracking status per-page without GA4 event data
    // Default to 5 (has form but tracking status unknown — will be refined by conversion audit)
    return 5;
  }

  // No form — score based on page type
  if (page.page_type === 'blog_post') return 10;
  if (page.page_type === 'landing_page') return 0;
  return 8; // site_page, pillar_page — moderate expectation
}

/**
 * Technical Health (0-10)
 * Full marks if no issues. Deduct -2 per issue.
 */
function scoreTechnicalHealth(page: WebPage): number {
  let score = 10;

  // Deduct for meta issues
  const metaIssues = page.meta_issues || [];
  if (metaIssues.includes('missing_meta')) score -= 2;
  if (metaIssues.includes('missing_title')) score -= 2;
  if (metaIssues.some(i => i.includes('title_too'))) score -= 1;
  if (metaIssues.some(i => i.includes('duplicate'))) score -= 1;

  // Deduct for broken links
  if (page.has_broken_links) score -= 2;

  // Deduct for not indexed
  if (!page.is_indexed) score -= 2;

  return Math.max(0, score);
}

/**
 * Get flagged pages (health score below threshold).
 */
export function getFlaggedPages(
  pages: Array<{ page: WebPage; healthScore: number }>,
  threshold: number = 50
): Array<{ page: WebPage; healthScore: number }> {
  return pages
    .filter(p => p.healthScore < threshold)
    .sort((a, b) => a.healthScore - b.healthScore); // Worst first
}

/**
 * Get critical pages (health score below 30).
 */
export function getCriticalPages(
  pages: Array<{ page: WebPage; healthScore: number }>
): Array<{ page: WebPage; healthScore: number }> {
  return getFlaggedPages(pages, 30);
}
