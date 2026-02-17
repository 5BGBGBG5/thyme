import { getAccessToken } from './google-auth';

const SC_API_BASE = 'https://www.googleapis.com/webmasters/v3';

function getSiteUrl(): string {
  const url = process.env.SEARCH_CONSOLE_SITE_URL;
  if (!url) throw new Error('Missing SEARCH_CONSOLE_SITE_URL');
  return url;
}

interface SearchAnalyticsRequest {
  startDate: string;
  endDate: string;
  dimensions: string[];
  type?: string;
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: Array<{
    filters: Array<{
      dimension: string;
      operator: string;
      expression: string;
    }>;
  }>;
}

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsResponse {
  rows?: SearchAnalyticsRow[];
  responseAggregationType?: string;
}

/**
 * Query Search Console search analytics data.
 */
export async function getSearchAnalytics(
  request: SearchAnalyticsRequest
): Promise<SearchAnalyticsResponse> {
  const accessToken = await getAccessToken();
  const siteUrl = getSiteUrl();
  const encodedSiteUrl = encodeURIComponent(siteUrl);

  const res = await fetch(
    `${SC_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...request,
        type: request.type || 'web',
        rowLimit: request.rowLimit || 1000,
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Search Console API error: ${res.status} ${errorText}`);
  }

  return res.json();
}

/**
 * Get search data per page for a date range.
 * Returns per-page aggregated clicks, impressions, CTR, and average position.
 */
export async function getPageSearchData(
  startDate: string,
  endDate: string
): Promise<Array<{
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>> {
  const response = await getSearchAnalytics({
    startDate,
    endDate,
    dimensions: ['page'],
    rowLimit: 1000,
  });

  return (response.rows || []).map(row => ({
    pageUrl: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

/**
 * Get search queries for a specific page.
 * Returns the queries that drive traffic to this page with their metrics.
 */
export async function getPageQueries(
  pageUrl: string,
  startDate: string,
  endDate: string
): Promise<Array<{
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}>> {
  const response = await getSearchAnalytics({
    startDate,
    endDate,
    dimensions: ['query'],
    rowLimit: 50,
    dimensionFilterGroups: [
      {
        filters: [
          {
            dimension: 'page',
            operator: 'equals',
            expression: pageUrl,
          },
        ],
      },
    ],
  });

  return (response.rows || []).map(row => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));
}

/**
 * Get search data per page for both current and previous periods.
 * Used for comparison and trend detection.
 */
export async function getPageSearchDataWithComparison(
  startDate: string,
  endDate: string,
  previousStartDate: string,
  previousEndDate: string
): Promise<Array<{
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number;
  previousImpressions: number;
  previousPosition: number;
  positionChange: number;
}>> {
  const [current, previous] = await Promise.all([
    getPageSearchData(startDate, endDate),
    getPageSearchData(previousStartDate, previousEndDate),
  ]);

  const prevMap = new Map(previous.map(p => [p.pageUrl, p]));

  return current.map(page => {
    const prev = prevMap.get(page.pageUrl);
    return {
      ...page,
      previousClicks: prev?.clicks || 0,
      previousImpressions: prev?.impressions || 0,
      previousPosition: prev?.position || 0,
      positionChange: prev ? prev.position - page.position : 0, // positive = improved
    };
  });
}

/**
 * Get detailed search data for a single page (used by agent loop tool).
 */
export async function getDetailedPageSearchData(
  pageUrl: string,
  startDate: string,
  endDate: string
): Promise<{
  pageUrl: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
}> {
  const [pageData, queries] = await Promise.all([
    getSearchAnalytics({
      startDate,
      endDate,
      dimensions: ['page'],
      dimensionFilterGroups: [
        {
          filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }],
        },
      ],
    }),
    getPageQueries(pageUrl, startDate, endDate),
  ]);

  const row = pageData.rows?.[0];

  return {
    pageUrl,
    totalClicks: row?.clicks || 0,
    totalImpressions: row?.impressions || 0,
    avgCtr: row?.ctr || 0,
    avgPosition: row?.position || 0,
    queries,
  };
}
