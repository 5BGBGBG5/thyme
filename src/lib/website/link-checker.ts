import type { LinkCheckResult } from './types';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY_LIMIT = 5;

/**
 * Fetch and parse the sitemap to get all page URLs.
 */
export async function fetchSitemap(siteUrl: string): Promise<string[]> {
  const sitemapUrl = `${siteUrl.replace(/\/$/, '')}/sitemap.xml`;

  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Thyme-SALT-Agent/1.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const xml = await res.text();

    // Parse <loc> tags from sitemap XML
    const urls: string[] = [];
    const locRegex = /<loc>(.*?)<\/loc>/g;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      urls.push(match[1]);
    }

    return urls;
  } catch {
    return [];
  }
}

/**
 * Check a single URL for HTTP status, redirects, and broken links.
 */
export async function checkUrl(url: string): Promise<LinkCheckResult> {
  const redirectChain: string[] = [url];
  let currentUrl = url;
  let finalStatus: number | null = null;

  try {
    for (let i = 0; i < MAX_REDIRECTS; i++) {
      const res = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'Thyme-SALT-Agent/1.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      finalStatus = res.status;

      // Follow redirects manually to track the chain
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) break;

        // Resolve relative URLs
        const nextUrl = location.startsWith('http')
          ? location
          : new URL(location, currentUrl).toString();

        currentUrl = nextUrl;
        redirectChain.push(nextUrl);
        continue;
      }

      break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      url,
      status: null,
      isRedirect: false,
      redirectChain: [],
      isBroken: true,
      errorMessage: message,
    };
  }

  const isRedirect = redirectChain.length > 1;
  const isBroken = finalStatus !== null && (finalStatus >= 400 || finalStatus === 0);

  return {
    url,
    status: finalStatus,
    isRedirect,
    redirectChain: isRedirect ? redirectChain : [],
    isBroken,
    errorMessage: isBroken ? `HTTP ${finalStatus}` : null,
  };
}

/**
 * Extract internal links from HTML content.
 */
export function extractInternalLinks(html: string, baseDomain: string): string[] {
  const links: Set<string> = new Set();
  const hrefRegex = /href=["'](.*?)["']/g;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];

    // Skip non-http links, anchors, mailto, tel, javascript
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      continue;
    }

    // Resolve relative URLs
    try {
      const resolved = href.startsWith('http')
        ? href
        : new URL(href, `https://${baseDomain}`).toString();

      // Only include internal links (same domain)
      const urlObj = new URL(resolved);
      if (urlObj.hostname === baseDomain || urlObj.hostname === `www.${baseDomain}`) {
        links.add(resolved.split('#')[0]); // Remove anchors
      }
    } catch {
      // Invalid URL — skip
    }
  }

  return Array.from(links);
}

/**
 * Check a page and all its internal links for broken links.
 */
export async function checkPageLinks(
  pageUrl: string,
  baseDomain: string
): Promise<Array<{ sourceUrl: string; targetUrl: string; result: LinkCheckResult }>> {
  const results: Array<{ sourceUrl: string; targetUrl: string; result: LinkCheckResult }> = [];

  try {
    // Fetch the page content
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Thyme-SALT-Agent/1.0' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return results;

    const html = await res.text();
    const internalLinks = extractInternalLinks(html, baseDomain);

    // Check links with concurrency limit
    for (let i = 0; i < internalLinks.length; i += CONCURRENCY_LIMIT) {
      const batch = internalLinks.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map(link => checkUrl(link))
      );

      for (let j = 0; j < batch.length; j++) {
        results.push({
          sourceUrl: pageUrl,
          targetUrl: batch[j],
          result: batchResults[j],
        });
      }
    }
  } catch {
    // Page fetch failed — skip
  }

  return results;
}

/**
 * Batch check a list of URLs with concurrency limit.
 */
export async function runLinkCheck(urls: string[]): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = [];

  for (let i = 0; i < urls.length; i += CONCURRENCY_LIMIT) {
    const batch = urls.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(batch.map(url => checkUrl(url)));
    results.push(...batchResults);
  }

  return results;
}
