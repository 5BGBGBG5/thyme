import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { emitSignal } from '@/lib/signals';
import { getAccessToken } from '@/lib/website/google-auth';
import { getPageMetrics } from '@/lib/website/ga4-client';
import { getPageSearchDataWithComparison } from '@/lib/website/search-console-client';
import { getPageSpeedScore } from '@/lib/website/pagespeed-client';
import { getAllPages } from '@/lib/website/hubspot-cms-client';
import { checkUrl, fetchSitemap } from '@/lib/website/link-checker';
import { runMetaAudit } from '@/lib/website/meta-auditor';
import { computeHealthScore } from '@/lib/website/scoring';
import { runLayer2Analysis } from '@/lib/website/analysis';
import type { WebPage, FlaggedPage, Finding, GA4Snapshot, SearchConsoleSnapshot, PageSpeedScore } from '@/lib/website/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // ── Step 1: Refresh token + load config + load page inventory ──
    await getAccessToken(); // Ensures token is valid

    const { data: existingPages } = await supabase
      .from('website_agent_pages')
      .select('*')
      .eq('is_active', true);

    const pageInventory: WebPage[] = (existingPages as WebPage[]) || [];
    const today = new Date().toISOString().split('T')[0];

    // Date ranges for comparison
    const endDate = today;
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevEndDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const prevStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ── Step 2: Pull Search Console data (batch) ──
    let searchData: Array<{ pageUrl: string; clicks: number; impressions: number; ctr: number; position: number; previousClicks: number; previousImpressions: number; previousPosition: number; positionChange: number }> = [];
    try {
      searchData = await getPageSearchDataWithComparison(startDate, endDate, prevStartDate, prevEndDate);
    } catch (err) {
      console.error('Search Console pull failed:', err);
    }

    // Store Search Console snapshots
    const scSnapshots: SearchConsoleSnapshot[] = [];
    for (const sc of searchData) {
      const snapshot: Partial<SearchConsoleSnapshot> = {
        page_url: sc.pageUrl,
        snapshot_date: today,
        total_clicks: sc.clicks,
        total_impressions: sc.impressions,
        avg_ctr: sc.ctr,
        avg_position: sc.position,
        clicks_previous_period: sc.previousClicks,
        impressions_previous_period: sc.previousImpressions,
        position_change: sc.positionChange,
      };

      await supabase.from('website_agent_search_console_snapshots').insert(snapshot);
      scSnapshots.push(snapshot as SearchConsoleSnapshot);
    }

    // ── Step 3: Pull GA4 data (batch) ──
    let ga4Data: Array<{ pagePath: string; activeUsers: number; sessions: number; pageViews: number; bounceRate: number; avgSessionDuration: number; previousUsers: number; previousSessions: number }> = [];
    try {
      ga4Data = await getPageMetrics(startDate, endDate, prevStartDate, prevEndDate);
    } catch (err) {
      console.error('GA4 pull failed:', err);
    }

    // Store GA4 snapshots
    const ga4Snapshots: GA4Snapshot[] = [];
    for (const ga4 of ga4Data) {
      const changePct = ga4.previousUsers > 0
        ? ((ga4.activeUsers - ga4.previousUsers) / ga4.previousUsers) * 100
        : 0;

      const snapshot: Partial<GA4Snapshot> = {
        page_url: ga4.pagePath,
        snapshot_date: today,
        active_users: ga4.activeUsers,
        sessions: ga4.sessions,
        page_views: ga4.pageViews,
        bounce_rate: ga4.bounceRate,
        avg_session_duration: ga4.avgSessionDuration,
        users_previous_period: ga4.previousUsers,
        sessions_previous_period: ga4.previousSessions,
        traffic_change_pct: changePct,
      };

      await supabase.from('website_agent_ga4_snapshots').insert(snapshot);
      ga4Snapshots.push(snapshot as GA4Snapshot);
    }

    // ── Step 4: PageSpeed spot checks (3-5 worst/untested pages) ──
    const speedScores: PageSpeedScore[] = [];
    const pagesToTest = selectPagesForSpeedTest(pageInventory, 5);

    for (const page of pagesToTest) {
      try {
        const result = await getPageSpeedScore(page.url, 'mobile');
        const speedSnapshot: Partial<PageSpeedScore> = {
          page_url: page.url,
          test_date: today,
          strategy: 'mobile',
          performance_score: result.performanceScore,
          accessibility_score: result.accessibilityScore,
          seo_score: result.seoScore,
          best_practices_score: result.bestPracticesScore,
          lcp_ms: result.lcpMs,
          fid_ms: result.fidMs,
          cls: result.cls,
          inp_ms: result.inpMs,
          opportunities: result.opportunities,
        };

        await supabase.from('website_agent_page_speed_scores').insert(speedSnapshot);
        speedScores.push(speedSnapshot as PageSpeedScore);
      } catch (err) {
        console.error(`PageSpeed test failed for ${page.url}:`, err);
      }
    }

    // ── Step 5: HubSpot CMS sync ──
    let syncedPages = 0;
    try {
      const hubspotPages = await getAllPages();
      for (const hp of hubspotPages) {
        const existing = pageInventory.find(p => p.url === hp.url);

        const contentAgeDays = hp.updated_at
          ? Math.floor((Date.now() - new Date(hp.updated_at).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        if (existing) {
          await supabase.from('website_agent_pages').update({
            title: hp.title,
            meta_description: hp.meta_description,
            slug: hp.slug,
            page_type: hp.page_type,
            hubspot_page_id: hp.id,
            has_form: hp.form_ids.length > 0,
            form_ids: hp.form_ids.length > 0 ? hp.form_ids : null,
            has_cta: hp.cta_ids.length > 0,
            cta_ids: hp.cta_ids.length > 0 ? hp.cta_ids : null,
            published_at: hp.published_at,
            last_updated_at: hp.updated_at,
            content_age_days: contentAgeDays,
            title_length: hp.title ? hp.title.length : null,
            meta_description_length: hp.meta_description ? hp.meta_description.length : null,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
        } else {
          await supabase.from('website_agent_pages').insert({
            url: hp.url,
            slug: hp.slug,
            title: hp.title,
            meta_description: hp.meta_description,
            page_type: hp.page_type,
            hubspot_page_id: hp.id,
            has_form: hp.form_ids.length > 0,
            form_ids: hp.form_ids.length > 0 ? hp.form_ids : null,
            has_cta: hp.cta_ids.length > 0,
            cta_ids: hp.cta_ids.length > 0 ? hp.cta_ids : null,
            published_at: hp.published_at,
            last_updated_at: hp.updated_at,
            content_age_days: contentAgeDays,
            title_length: hp.title ? hp.title.length : null,
            meta_description_length: hp.meta_description ? hp.meta_description.length : null,
          });
          syncedPages++;
        }
      }
    } catch (err) {
      console.error('HubSpot CMS sync failed:', err);
    }

    // Reload pages after sync
    const { data: refreshedPages } = await supabase
      .from('website_agent_pages')
      .select('*')
      .eq('is_active', true);

    const allPages = (refreshedPages as WebPage[]) || pageInventory;

    // ── Step 6: Broken link check (rotating subset) ──
    let brokenLinksFound = 0;
    try {
      const sitemapUrls = await fetchSitemap('https://www.inecta.com');
      const urlsToCheck = selectUrlsForLinkCheck(sitemapUrls, allPages, 15);

      for (const url of urlsToCheck) {
        const result = await checkUrl(url);

        if (result.isBroken || result.isRedirect) {
          // Check if already tracked
          const { data: existing } = await supabase
            .from('website_agent_link_health')
            .select('id')
            .eq('target_url', url)
            .limit(1)
            .single();

          if (existing) {
            await supabase.from('website_agent_link_health').update({
              http_status: result.status,
              is_broken: result.isBroken,
              is_redirect: result.isRedirect,
              redirect_chain: result.redirectChain.length > 0 ? result.redirectChain : null,
              redirect_count: result.redirectChain.length,
              error_message: result.errorMessage,
              last_checked_at: new Date().toISOString(),
              is_resolved: !result.isBroken,
            }).eq('id', existing.id);
          } else {
            await supabase.from('website_agent_link_health').insert({
              source_page_url: url,
              target_url: url,
              link_type: 'internal',
              http_status: result.status,
              is_broken: result.isBroken,
              is_redirect: result.isRedirect,
              redirect_chain: result.redirectChain.length > 0 ? result.redirectChain : null,
              redirect_count: result.redirectChain.length,
              error_message: result.errorMessage,
            });
          }

          if (result.isBroken) brokenLinksFound++;
        }
      }
    } catch (err) {
      console.error('Link check failed:', err);
    }

    // ── Step 7: Meta/title audit ──
    let metaIssuesFound = 0;
    try {
      const auditResults = runMetaAudit(allPages);
      for (const audit of auditResults) {
        if (audit.issues.length > 0) {
          metaIssuesFound++;
          await supabase.from('website_agent_pages').update({
            meta_issues: audit.issues,
            title_length: audit.titleLength,
            meta_description_length: audit.metaDescriptionLength,
          }).eq('url', audit.url);
        }
      }
    } catch (err) {
      console.error('Meta audit failed:', err);
    }

    // ── Step 8: Layer 1 — Compute health scores ──
    const flaggedPages: FlaggedPage[] = [];

    for (const page of allPages) {
      const ga4 = ga4Snapshots.find(s => page.url.includes(s.page_url)) || null;
      const sc = scSnapshots.find(s => s.page_url === page.url) || null;
      const speed = speedScores.find(s => s.page_url === page.url) || null;

      // Also check for existing speed data if not tested this run
      let speedToUse = speed;
      if (!speedToUse) {
        const { data: existingSpeed } = await supabase
          .from('website_agent_page_speed_scores')
          .select('*')
          .eq('page_url', page.url)
          .eq('strategy', 'mobile')
          .order('test_date', { ascending: false })
          .limit(1)
          .single();
        if (existingSpeed) speedToUse = existingSpeed as PageSpeedScore;
      }

      const breakdown = computeHealthScore(page, ga4, sc, speedToUse);

      // Update page with health score
      await supabase.from('website_agent_pages').update({
        health_score: breakdown.total,
        health_score_breakdown: breakdown,
        last_health_check_at: new Date().toISOString(),
      }).eq('id', page.id);

      // Flag pages below threshold
      if (breakdown.total < 50) {
        const flagReasons: string[] = [];
        if (breakdown.traffic_trend < 10) flagReasons.push('traffic_decline');
        if (breakdown.seo_ranking < 10) flagReasons.push('low_rankings');
        if (breakdown.page_speed < 10) flagReasons.push('slow_speed');
        if (breakdown.content_freshness < 5) flagReasons.push('stale_content');
        if (breakdown.conversion_health < 5) flagReasons.push('conversion_issues');
        if (breakdown.technical_health < 5) flagReasons.push('technical_issues');

        const updatedPage = { ...page, health_score: breakdown.total, health_score_breakdown: breakdown };

        flaggedPages.push({
          page: updatedPage,
          ga4Data: ga4,
          searchData: sc,
          speedData: speedToUse,
          flagReasons,
        });
      }
    }

    // ── Step 9: Rank flagged pages, pick top 3 ──
    flaggedPages.sort((a, b) => (a.page.health_score || 0) - (b.page.health_score || 0));

    // ── Step 10: Layer 2 — Agent loop for top 3 ──
    let layer2Result: { processed: number; findings: Finding[]; skipped: number } = { processed: 0, findings: [], skipped: 0 };
    if (flaggedPages.length > 0) {
      try {
        layer2Result = await runLayer2Analysis(flaggedPages);
      } catch (err) {
        console.error('Layer 2 analysis failed:', err);
      }
    }

    // ── Step 11: Write summary + emit signals ──
    const elapsed = Date.now() - startTime;

    await supabase.from('website_agent_change_log').insert({
      action_type: 'health_scan',
      action_detail: `Scanned ${allPages.length} pages, found ${flaggedPages.length} flagged, investigated ${layer2Result.processed}, ${layer2Result.findings.length} findings`,
      data_used: {
        pages_scanned: allPages.length,
        pages_flagged: flaggedPages.length,
        findings_created: layer2Result.findings.length,
        skipped: layer2Result.skipped,
        broken_links_found: brokenLinksFound,
        meta_issues_found: metaIssuesFound,
        pages_synced: syncedPages,
        speed_tests: speedScores.length,
        duration_ms: elapsed,
      },
      outcome: 'executed',
    });

    await emitSignal('health_scan_complete', {
      pagesScanned: allPages.length,
      findingsCount: layer2Result.findings.length,
      avgHealthScore: allPages.reduce((sum, p) => sum + (p.health_score || 0), 0) / (allPages.length || 1),
      brokenLinksFound,
      metaIssuesFound,
    });

    return NextResponse.json({
      success: true,
      pagesScanned: allPages.length,
      pagesFlagged: flaggedPages.length,
      findingsCreated: layer2Result.findings.length,
      brokenLinksFound,
      metaIssuesFound,
      durationMs: elapsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Scan failed:', message);

    return NextResponse.json(
      { error: `Scan failed: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

// ============================================================================
// Helpers
// ============================================================================

function selectPagesForSpeedTest(pages: WebPage[], count: number): WebPage[] {
  // Prioritize: 1) never tested, 2) worst scores, 3) high-traffic pages
  const neverTested = pages.filter(p => !p.last_health_check_at);
  const lowScore = pages
    .filter(p => p.health_score !== null && p.health_score < 50)
    .sort((a, b) => (a.health_score || 0) - (b.health_score || 0));
  const landingPages = pages.filter(p => p.page_type === 'landing_page');

  const selected = new Set<string>();
  const result: WebPage[] = [];

  for (const list of [neverTested, lowScore, landingPages, pages]) {
    for (const page of list) {
      if (result.length >= count) break;
      if (!selected.has(page.url)) {
        selected.add(page.url);
        result.push(page);
      }
    }
    if (result.length >= count) break;
  }

  return result;
}

function selectUrlsForLinkCheck(
  sitemapUrls: string[],
  pages: WebPage[],
  count: number
): string[] {
  // Prioritize pages with previously found broken links
  const withBrokenLinks = pages
    .filter(p => p.has_broken_links)
    .map(p => p.url);

  // High-traffic landing pages
  const landingPages = pages
    .filter(p => p.page_type === 'landing_page')
    .map(p => p.url);

  const selected = new Set<string>();
  const result: string[] = [];

  for (const list of [withBrokenLinks, landingPages, sitemapUrls]) {
    for (const url of list) {
      if (result.length >= count) break;
      if (!selected.has(url)) {
        selected.add(url);
        result.push(url);
      }
    }
    if (result.length >= count) break;
  }

  return result;
}
