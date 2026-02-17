import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';
import { emitSignal } from '@/lib/signals';
import { getAccessToken } from '@/lib/website/google-auth';
import { getPageMetrics } from '@/lib/website/ga4-client';
import { getPageSearchDataWithComparison } from '@/lib/website/search-console-client';
import { runConversionAudit } from '@/lib/website/conversion-audit';
import { fetchSitemap, checkUrl } from '@/lib/website/link-checker';
import { runMetaAudit } from '@/lib/website/meta-auditor';
import { checkKeywordCoverage } from '@/lib/website/keyword-coverage';
import { generateTrendSnapshot, emitTrendSignals } from '@/lib/website/trends';
import type { WebPage, KeywordCoverageGap } from '@/lib/website/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const anthropic = new Anthropic();

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // ── Step 1: Refresh token + load config ──
    await getAccessToken();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const prevWeekStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // ── Step 2: Pull full week of data ──
    let searchData = [];
    let ga4Data = [];
    try {
      [searchData, ga4Data] = await Promise.all([
        getPageSearchDataWithComparison(weekStartStr, todayStr, prevWeekStart, weekStartStr),
        getPageMetrics(weekStartStr, todayStr, prevWeekStart, weekStartStr),
      ]);
    } catch (err) {
      console.error('Data pull failed:', err);
    }

    // ── Step 3: Conversion audit ──
    let conversionAudit = null;
    try {
      conversionAudit = await runConversionAudit();
    } catch (err) {
      console.error('Conversion audit failed:', err);
    }

    // ── Step 4: Full sitemap crawl for broken links ──
    let brokenLinksCount = 0;
    try {
      const sitemapUrls = await fetchSitemap('https://www.inecta.com');

      for (const url of sitemapUrls) {
        const result = await checkUrl(url);

        if (result.isBroken) {
          brokenLinksCount++;

          const { data: existing } = await supabase
            .from('website_agent_link_health')
            .select('id')
            .eq('target_url', url)
            .limit(1)
            .single();

          if (existing) {
            await supabase.from('website_agent_link_health').update({
              http_status: result.status,
              is_broken: true,
              error_message: result.errorMessage,
              last_checked_at: new Date().toISOString(),
            }).eq('id', existing.id);
          } else {
            await supabase.from('website_agent_link_health').insert({
              source_page_url: url,
              target_url: url,
              link_type: 'internal',
              http_status: result.status,
              is_broken: true,
              error_message: result.errorMessage,
            });
          }
        } else {
          // Mark previously broken links as resolved
          await supabase.from('website_agent_link_health').update({
            is_broken: false,
            is_resolved: true,
            resolved_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          }).eq('target_url', url).eq('is_broken', true);
        }
      }
    } catch (err) {
      console.error('Full link crawl failed:', err);
    }

    // ── Step 5: Full meta/title audit ──
    const { data: allPagesData } = await supabase
      .from('website_agent_pages')
      .select('*')
      .eq('is_active', true);

    const allPages = (allPagesData as WebPage[]) || [];
    let metaIssuesCount = 0;

    try {
      const auditResults = runMetaAudit(allPages);
      for (const audit of auditResults) {
        await supabase.from('website_agent_pages').update({
          meta_issues: audit.issues.length > 0 ? audit.issues : null,
          title_length: audit.titleLength,
          meta_description_length: audit.metaDescriptionLength,
        }).eq('url', audit.url);

        if (audit.issues.length > 0) metaIssuesCount++;
      }
    } catch (err) {
      console.error('Full meta audit failed:', err);
    }

    // ── Step 6: Keyword-to-page coverage ──
    let keywordGaps: KeywordCoverageGap[] = [];
    try {
      keywordGaps = await checkKeywordCoverage();
    } catch (err) {
      console.error('Keyword coverage check failed:', err);
    }

    // ── Step 7: Content freshness sweep ──
    const stalePages = allPages.filter(p => {
      if (!p.last_updated_at) return true;
      const daysSince = Math.floor((Date.now() - new Date(p.last_updated_at).getTime()) / (1000 * 60 * 60 * 24));
      return daysSince > 180; // 6+ months
    });

    // ── Step 8: Trend comparison ──
    let trends = null;
    try {
      trends = await generateTrendSnapshot('weekly');
      await emitTrendSignals(trends);
    } catch (err) {
      console.error('Trend computation failed:', err);
    }

    // ── Step 9: Generate weekly digest narrative ──
    const { data: recentFindings } = await supabase
      .from('website_agent_findings')
      .select('*')
      .gte('created_at', weekStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    const { data: recentDecisions } = await supabase
      .from('website_agent_decision_queue')
      .select('*')
      .gte('created_at', weekStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    let summaryNarrative = '';
    try {
      const digestPrompt = buildDigestPrompt({
        pagesScanned: allPages.length,
        avgHealthScore: trends?.avgHealthScore || 0,
        findings: recentFindings || [],
        decisions: recentDecisions || [],
        conversionAudit,
        brokenLinksCount,
        metaIssuesCount,
        stalePages: stalePages.length,
        keywordGaps,
        searchDataCount: searchData.length,
        ga4DataCount: ga4Data.length,
        trends,
      });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        messages: [{ role: 'user', content: digestPrompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      summaryNarrative = textBlock ? (textBlock as { type: 'text'; text: string }).text : '';
    } catch (err) {
      console.error('Digest narrative generation failed:', err);
      summaryNarrative = `Weekly scan completed. ${allPages.length} pages monitored, ${brokenLinksCount} broken links, ${metaIssuesCount} meta issues.`;
    }

    // ── Step 10: Write digest + emit signals ──
    await supabase.from('website_agent_weekly_digest').insert({
      digest_date: todayStr,
      digest_week_start: weekStartStr,
      digest_week_end: todayStr,
      summary_narrative: summaryNarrative,
      pages_scanned: allPages.length,
      findings_count: (recentFindings || []).length,
      recommendations_count: (recentDecisions || []).length,
      top_findings: (recentFindings || []).slice(0, 5),
      trend_summary: trends,
      conversion_audit_summary: conversionAudit,
      keyword_coverage_gaps: keywordGaps,
      broken_links_summary: { count: brokenLinksCount },
      meta_audit_summary: { issueCount: metaIssuesCount },
    });

    await emitSignal('weekly_analysis_complete', {
      digestDate: todayStr,
      topFindings: (recentFindings || []).slice(0, 3).map((f: Record<string, unknown>) => ({
        type: f.finding_type,
        severity: f.severity,
        title: f.title,
      })),
      trendDirection: trends?.trafficChangePct && trends.trafficChangePct > 0 ? 'improving' : 'declining',
    });

    await supabase.from('website_agent_change_log').insert({
      action_type: 'weekly_analysis',
      action_detail: `Weekly analysis completed. ${allPages.length} pages, ${brokenLinksCount} broken links, ${metaIssuesCount} meta issues, ${keywordGaps.length} keyword gaps`,
      data_used: {
        duration_ms: Date.now() - startTime,
        pages_scanned: allPages.length,
        broken_links: brokenLinksCount,
        meta_issues: metaIssuesCount,
        keyword_gaps: keywordGaps.length,
        stale_pages: stalePages.length,
        conversion_health: conversionAudit?.trackingHealth,
      },
      outcome: 'executed',
    });

    return NextResponse.json({
      success: true,
      pagesScanned: allPages.length,
      brokenLinks: brokenLinksCount,
      metaIssues: metaIssuesCount,
      keywordGaps: keywordGaps.length,
      stalePages: stalePages.length,
      conversionHealth: conversionAudit?.trackingHealth || 'unknown',
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Weekly analysis failed:', message);

    return NextResponse.json(
      { error: `Weekly analysis failed: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

// ============================================================================
// Digest Prompt Builder
// ============================================================================

function buildDigestPrompt(data: {
  pagesScanned: number;
  avgHealthScore: number;
  findings: Record<string, unknown>[];
  decisions: Record<string, unknown>[];
  conversionAudit: { trackingHealth: string; ga4KeyEventsCount: number; hubspotFormsCount: number } | null;
  brokenLinksCount: number;
  metaIssuesCount: number;
  stalePages: number;
  keywordGaps: Array<{ keyword: string; hasOrganicPage: boolean }>;
  searchDataCount: number;
  ga4DataCount: number;
  trends: { avgHealthScore: number; trafficChangePct: number; topDecliningPages: Array<{ url: string; change: number }> } | null;
}): string {
  return `You are Thyme, the website health agent for Inecta (food & beverage ERP). Write a concise weekly digest (3-5 paragraphs) summarizing the website's health this week.

## Data
- Pages monitored: ${data.pagesScanned}
- Average health score: ${data.avgHealthScore.toFixed(1)}/100
- Traffic trend: ${data.trends?.trafficChangePct ? `${data.trends.trafficChangePct > 0 ? '+' : ''}${data.trends.trafficChangePct.toFixed(1)}%` : 'N/A'}
- Findings this week: ${data.findings.length}
- Pending recommendations: ${data.decisions.filter(d => d.status === 'pending').length}
- Conversion tracking: ${data.conversionAudit?.trackingHealth || 'unknown'} (GA4 events: ${data.conversionAudit?.ga4KeyEventsCount || 0}, HubSpot forms: ${data.conversionAudit?.hubspotFormsCount || 0})
- Broken links: ${data.brokenLinksCount}
- Pages with meta issues: ${data.metaIssuesCount}
- Stale pages (>6 months): ${data.stalePages}
- Keyword coverage gaps: ${data.keywordGaps.length}

${data.trends?.topDecliningPages?.length ? `Top declining pages:\n${data.trends.topDecliningPages.map(p => `- ${p.url}: ${p.change.toFixed(1)}%`).join('\n')}` : ''}

${data.findings.length > 0 ? `Recent findings:\n${data.findings.slice(0, 5).map((f: Record<string, unknown>) => `- [${f.severity}] ${f.title}`).join('\n')}` : 'No new findings this week.'}

## Instructions
- Start with the overall health status
- Highlight the most important findings or trends
- If conversion tracking is broken/not_configured, make it the top priority
- Mention any keyword coverage gaps (keywords being paid for with no organic page)
- End with 2-3 prioritized action items
- Keep it concise and actionable — this is for the marketing team`;
}
