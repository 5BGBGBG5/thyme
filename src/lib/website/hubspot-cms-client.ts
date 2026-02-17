import type { HubSpotPage, HubSpotForm, PageType } from './types';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

function getToken(): string {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) throw new Error('Missing HUBSPOT_PRIVATE_APP_TOKEN');
  return token;
}

async function hubspotGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = getToken();
  const url = new URL(`${HUBSPOT_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HubSpot API error: ${res.status} ${errorText}`);
  }

  return res.json();
}

/**
 * Fetch all site pages from HubSpot CMS.
 */
async function fetchSitePages(): Promise<HubSpotPage[]> {
  const pages: HubSpotPage[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = { limit: '100' };
    if (after) params.after = after;

    const data = await hubspotGet<{
      results: Array<Record<string, unknown>>;
      paging?: { next?: { after: string } };
    }>('/cms/v3/pages/site-pages', params);

    for (const page of data.results) {
      pages.push(mapHubSpotPage(page, 'site_page'));
    }

    after = data.paging?.next?.after;
  } while (after);

  return pages;
}

/**
 * Fetch all landing pages from HubSpot CMS.
 */
async function fetchLandingPages(): Promise<HubSpotPage[]> {
  const pages: HubSpotPage[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = { limit: '100' };
    if (after) params.after = after;

    const data = await hubspotGet<{
      results: Array<Record<string, unknown>>;
      paging?: { next?: { after: string } };
    }>('/cms/v3/pages/landing-pages', params);

    for (const page of data.results) {
      pages.push(mapHubSpotPage(page, 'landing_page'));
    }

    after = data.paging?.next?.after;
  } while (after);

  return pages;
}

/**
 * Fetch all blog posts from HubSpot CMS.
 */
async function fetchBlogPosts(): Promise<HubSpotPage[]> {
  const pages: HubSpotPage[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = { limit: '100' };
    if (after) params.after = after;

    const data = await hubspotGet<{
      results: Array<Record<string, unknown>>;
      paging?: { next?: { after: string } };
    }>('/cms/v3/blogs/posts', params);

    for (const page of data.results) {
      pages.push(mapHubSpotPage(page, 'blog_post'));
    }

    after = data.paging?.next?.after;
  } while (after);

  return pages;
}

function mapHubSpotPage(raw: Record<string, unknown>, pageType: PageType): HubSpotPage {
  const domain = (raw.domain as string) || 'www.inecta.com';
  const slug = (raw.slug as string) || '';
  const url = `https://${domain}/${slug}`.replace(/\/+$/, '');

  return {
    id: String(raw.id),
    slug,
    title: (raw.htmlTitle as string) || (raw.name as string) || '',
    meta_description: (raw.metaDescription as string) || null,
    url,
    state: (raw.state as string) || 'PUBLISHED',
    page_type: pageType,
    published_at: (raw.publishDate as string) || (raw.created as string) || null,
    updated_at: (raw.updated as string) || null,
    form_ids: extractFormIds(raw),
    cta_ids: extractCtaIds(raw),
  };
}

function extractFormIds(page: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const widgets = page.widgets as Record<string, Record<string, unknown>> | undefined;
  if (widgets) {
    for (const widget of Object.values(widgets)) {
      if (widget.type === 'form' && widget.body) {
        const body = widget.body as Record<string, unknown>;
        if (body.form_id) ids.push(String(body.form_id));
      }
    }
  }
  return ids;
}

function extractCtaIds(page: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const widgets = page.widgets as Record<string, Record<string, unknown>> | undefined;
  if (widgets) {
    for (const widget of Object.values(widgets)) {
      if (widget.type === 'cta' && widget.body) {
        const body = widget.body as Record<string, unknown>;
        if (body.cta_id) ids.push(String(body.cta_id));
      }
    }
  }
  return ids;
}

/**
 * Get all pages from HubSpot CMS (site pages + landing pages + blog posts).
 */
export async function getAllPages(): Promise<HubSpotPage[]> {
  const [sitePages, landingPages, blogPosts] = await Promise.all([
    fetchSitePages(),
    fetchLandingPages(),
    fetchBlogPosts(),
  ]);

  return [...sitePages, ...landingPages, ...blogPosts];
}

/**
 * Get a single page by ID from HubSpot CMS.
 */
export async function getPageDetail(pageId: string, pageType: PageType = 'site_page'): Promise<HubSpotPage> {
  const endpoint = pageType === 'blog_post'
    ? `/cms/v3/blogs/posts/${pageId}`
    : pageType === 'landing_page'
      ? `/cms/v3/pages/landing-pages/${pageId}`
      : `/cms/v3/pages/site-pages/${pageId}`;

  const data = await hubspotGet<Record<string, unknown>>(endpoint);
  return mapHubSpotPage(data, pageType);
}

/**
 * Get all forms from HubSpot.
 */
export async function getAllForms(): Promise<HubSpotForm[]> {
  const forms: HubSpotForm[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = { limit: '100' };
    if (after) params.after = after;

    const data = await hubspotGet<{
      results: Array<Record<string, unknown>>;
      paging?: { next?: { after: string } };
    }>('/marketing/v3/forms', params);

    for (const form of data.results) {
      forms.push({
        id: String(form.id),
        name: (form.name as string) || '',
        submission_count: 0, // Will be populated separately
        created_at: (form.createdAt as string) || '',
        updated_at: (form.updatedAt as string) || '',
      });
    }

    after = data.paging?.next?.after;
  } while (after);

  return forms;
}

/**
 * Get form submission count for a specific form.
 */
export async function getFormSubmissionCount(formId: string): Promise<number> {
  try {
    const data = await hubspotGet<{
      results: Array<Record<string, unknown>>;
      total: number;
    }>(`/form-integrations/v1/submissions/forms/${formId}`, { limit: '1' });

    return data.total || 0;
  } catch {
    return 0;
  }
}

/**
 * Get all forms with their submission counts.
 */
export async function getAllFormsWithCounts(): Promise<HubSpotForm[]> {
  const forms = await getAllForms();

  // Fetch submission counts in batches (concurrency limit of 5)
  const batchSize = 5;
  for (let i = 0; i < forms.length; i += batchSize) {
    const batch = forms.slice(i, i + batchSize);
    const counts = await Promise.all(
      batch.map(form => getFormSubmissionCount(form.id))
    );
    for (let j = 0; j < batch.length; j++) {
      batch[j].submission_count = counts[j];
    }
  }

  return forms;
}
