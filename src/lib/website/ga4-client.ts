import { getAccessToken } from './google-auth';

const GA4_API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

function getPropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error('Missing GA4_PROPERTY_ID');
  return id;
}

interface GA4ReportRequest {
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dateRanges: Array<{ startDate: string; endDate: string; name?: string }>;
  dimensionFilter?: Record<string, unknown>;
  limit?: number;
  orderBys?: Array<Record<string, unknown>>;
}

interface GA4Row {
  dimensionValues?: Array<{ value: string }>;
  metricValues?: Array<{ value: string }>;
}

interface GA4ReportResponse {
  rows?: GA4Row[];
  rowCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Run a GA4 report query.
 */
export async function runGA4Report(request: GA4ReportRequest): Promise<GA4ReportResponse> {
  const accessToken = await getAccessToken();
  const propertyId = getPropertyId();

  const res = await fetch(`${GA4_API_BASE}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GA4 API error: ${res.status} ${errorText}`);
  }

  return res.json();
}

/**
 * Get page-level metrics for a date range.
 * Returns: per page — active users, sessions, page views, bounce rate, session duration, traffic sources.
 */
export async function getPageMetrics(
  startDate: string,
  endDate: string,
  previousStartDate: string,
  previousEndDate: string
): Promise<Array<{
  pagePath: string;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;
  avgSessionDuration: number;
  previousUsers: number;
  previousSessions: number;
}>> {
  const response = await runGA4Report({
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    dateRanges: [
      { startDate, endDate, name: 'current' },
      { startDate: previousStartDate, endDate: previousEndDate, name: 'previous' },
    ],
    limit: 500,
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
  });

  const rows = response.rows || [];
  const pageMap = new Map<string, {
    pagePath: string;
    activeUsers: number;
    sessions: number;
    pageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
    previousUsers: number;
    previousSessions: number;
  }>();

  for (const row of rows) {
    const pagePath = row.dimensionValues?.[0]?.value || '';
    const metrics = row.metricValues || [];

    // GA4 returns rows for each date range — first set is current, second set is comparison
    // When using 2 date ranges, metrics are doubled (current metrics first, then previous)
    if (!pageMap.has(pagePath)) {
      pageMap.set(pagePath, {
        pagePath,
        activeUsers: parseInt(metrics[0]?.value || '0'),
        sessions: parseInt(metrics[1]?.value || '0'),
        pageViews: parseInt(metrics[2]?.value || '0'),
        bounceRate: parseFloat(metrics[3]?.value || '0'),
        avgSessionDuration: parseFloat(metrics[4]?.value || '0'),
        previousUsers: parseInt(metrics[5]?.value || '0'),
        previousSessions: parseInt(metrics[6]?.value || '0'),
      });
    }
  }

  return Array.from(pageMap.values());
}

/**
 * Get traffic sources breakdown for a page.
 */
export async function getPageTrafficSources(
  pagePath: string,
  startDate: string,
  endDate: string
): Promise<{ organic: number; paid: number; direct: number; referral: number; social: number }> {
  const response = await runGA4Report({
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }],
    dateRanges: [{ startDate, endDate }],
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: { value: pagePath, matchType: 'EXACT' },
      },
    },
  });

  const sources = { organic: 0, paid: 0, direct: 0, referral: 0, social: 0 };

  for (const row of response.rows || []) {
    const channel = (row.dimensionValues?.[0]?.value || '').toLowerCase();
    const sessions = parseInt(row.metricValues?.[0]?.value || '0');

    if (channel.includes('organic')) sources.organic += sessions;
    else if (channel.includes('paid')) sources.paid += sessions;
    else if (channel.includes('direct')) sources.direct += sessions;
    else if (channel.includes('referral')) sources.referral += sessions;
    else if (channel.includes('social')) sources.social += sessions;
  }

  return sources;
}

/**
 * Get configured key events (conversions) from GA4.
 */
export async function getKeyEvents(): Promise<Array<{ name: string; countingMethod: string }>> {
  const accessToken = await getAccessToken();
  const propertyId = getPropertyId();

  const res = await fetch(
    `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/keyEvents`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    // If no key events exist or API returns error, return empty
    return [];
  }

  const data = await res.json();
  return (data.keyEvents || []).map((e: Record<string, unknown>) => ({
    name: e.eventName as string,
    countingMethod: e.countingMethod as string,
  }));
}

/**
 * Get detailed page analytics for a specific page path.
 * Used by the agent loop's get_page_analytics tool.
 */
export async function getDetailedPageAnalytics(
  pagePath: string,
  startDate: string,
  endDate: string
): Promise<{
  activeUsers: number;
  sessions: number;
  pageViews: number;
  bounceRate: number;
  avgSessionDuration: number;
  sources: { organic: number; paid: number; direct: number; referral: number; social: number };
}> {
  const [metricsResponse, sources] = await Promise.all([
    runGA4Report({
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'pagePath',
          stringFilter: { value: pagePath, matchType: 'EXACT' },
        },
      },
    }),
    getPageTrafficSources(pagePath, startDate, endDate),
  ]);

  const row = metricsResponse.rows?.[0];
  const metrics = row?.metricValues || [];

  return {
    activeUsers: parseInt(metrics[0]?.value || '0'),
    sessions: parseInt(metrics[1]?.value || '0'),
    pageViews: parseInt(metrics[2]?.value || '0'),
    bounceRate: parseFloat(metrics[3]?.value || '0'),
    avgSessionDuration: parseFloat(metrics[4]?.value || '0'),
    sources,
  };
}
