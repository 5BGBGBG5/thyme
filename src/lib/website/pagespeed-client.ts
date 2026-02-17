const PSI_API_BASE = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function getApiKey(): string {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) throw new Error('Missing PAGESPEED_API_KEY');
  return key;
}

export interface PageSpeedResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  performanceScore: number;
  accessibilityScore: number;
  seoScore: number;
  bestPracticesScore: number;
  lcpMs: number | null;
  fidMs: number | null;
  cls: number | null;
  inpMs: number | null;
  opportunities: Array<{ id: string; title: string; description: string; savings?: string }>;
}

/**
 * Run PageSpeed Insights test for a URL.
 */
export async function getPageSpeedScore(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile'
): Promise<PageSpeedResult> {
  const apiKey = getApiKey();

  // PSI API supports multiple category params — build URL manually
  const queryUrl = `${PSI_API_BASE}?url=${encodeURIComponent(url)}&key=${apiKey}&strategy=${strategy.toUpperCase()}&category=PERFORMANCE&category=ACCESSIBILITY&category=SEO&category=BEST_PRACTICES`;

  const res = await fetch(queryUrl, {
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PageSpeed API error: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  const lighthouse = data.lighthouseResult;

  if (!lighthouse) {
    throw new Error(`No Lighthouse result for ${url}`);
  }

  const categories = lighthouse.categories || {};
  const audits = lighthouse.audits || {};

  // Extract Core Web Vitals
  const lcpAudit = audits['largest-contentful-paint'];
  const fidAudit = audits['max-potential-fid'];
  const clsAudit = audits['cumulative-layout-shift'];
  const inpAudit = audits['interaction-to-next-paint'];

  // Extract improvement opportunities
  const opportunities: PageSpeedResult['opportunities'] = [];
  for (const [id, audit] of Object.entries(audits)) {
    const a = audit as Record<string, unknown>;
    if (a.details && (a.details as Record<string, unknown>).type === 'opportunity' && (a.score as number) < 1) {
      opportunities.push({
        id,
        title: a.title as string,
        description: a.description as string,
        savings: (a.details as Record<string, unknown>).overallSavingsMs
          ? `${(a.details as Record<string, unknown>).overallSavingsMs}ms`
          : undefined,
      });
    }
  }

  return {
    url,
    strategy,
    performanceScore: Math.round((categories.performance?.score || 0) * 100),
    accessibilityScore: Math.round((categories.accessibility?.score || 0) * 100),
    seoScore: Math.round((categories.seo?.score || 0) * 100),
    bestPracticesScore: Math.round((categories['best-practices']?.score || 0) * 100),
    lcpMs: lcpAudit?.numericValue ?? null,
    fidMs: fidAudit?.numericValue ?? null,
    cls: clsAudit?.numericValue ?? null,
    inpMs: inpAudit?.numericValue ?? null,
    opportunities: opportunities.slice(0, 10),
  };
}
