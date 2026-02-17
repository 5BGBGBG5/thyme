import type { WebPage, MetaIssue, MetaAuditResult } from './types';

const TITLE_MAX_LENGTH = 60;
const TITLE_MIN_LENGTH = 30;
const META_MAX_LENGTH = 160;
const META_MIN_LENGTH = 70;

/**
 * Audit a single page's title and meta description against SEO best practices.
 */
export function auditPage(page: WebPage): MetaAuditResult {
  const issues: MetaIssue[] = [];

  // Check title
  if (!page.title || page.title.trim().length === 0) {
    issues.push('missing_title');
  } else {
    const titleLen = page.title.trim().length;
    if (titleLen > TITLE_MAX_LENGTH) issues.push('title_too_long');
    if (titleLen < TITLE_MIN_LENGTH) issues.push('title_too_short');
  }

  // Check meta description
  if (!page.meta_description || page.meta_description.trim().length === 0) {
    issues.push('missing_meta');
  } else {
    const metaLen = page.meta_description.trim().length;
    if (metaLen > META_MAX_LENGTH) issues.push('meta_too_long');
    if (metaLen < META_MIN_LENGTH) issues.push('meta_too_short');
  }

  return {
    url: page.url,
    issues,
    titleLength: page.title ? page.title.trim().length : null,
    metaDescriptionLength: page.meta_description ? page.meta_description.trim().length : null,
  };
}

/**
 * Find duplicate titles and meta descriptions across all pages.
 * Returns a map of url -> additional issues to add.
 */
export function findDuplicates(pages: WebPage[]): Map<string, MetaIssue[]> {
  const duplicateIssues = new Map<string, MetaIssue[]>();

  // Find duplicate titles
  const titleMap = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.title || page.title.trim().length === 0) continue;
    const normalized = page.title.trim().toLowerCase();
    const urls = titleMap.get(normalized) || [];
    urls.push(page.url);
    titleMap.set(normalized, urls);
  }

  for (const urls of titleMap.values()) {
    if (urls.length > 1) {
      for (const url of urls) {
        const existing = duplicateIssues.get(url) || [];
        existing.push('duplicate_title');
        duplicateIssues.set(url, existing);
      }
    }
  }

  // Find duplicate meta descriptions
  const metaMap = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.meta_description || page.meta_description.trim().length === 0) continue;
    const normalized = page.meta_description.trim().toLowerCase();
    const urls = metaMap.get(normalized) || [];
    urls.push(page.url);
    metaMap.set(normalized, urls);
  }

  for (const urls of metaMap.values()) {
    if (urls.length > 1) {
      for (const url of urls) {
        const existing = duplicateIssues.get(url) || [];
        existing.push('duplicate_meta');
        duplicateIssues.set(url, existing);
      }
    }
  }

  return duplicateIssues;
}

/**
 * Run a full meta audit across all pages.
 * Returns per-page audit results with all issues (including duplicates).
 */
export function runMetaAudit(pages: WebPage[]): MetaAuditResult[] {
  // Audit each page individually
  const results = pages.map(page => auditPage(page));

  // Find duplicates across all pages
  const duplicates = findDuplicates(pages);

  // Merge duplicate issues into individual results
  for (const result of results) {
    const dupIssues = duplicates.get(result.url);
    if (dupIssues) {
      result.issues.push(...dupIssues);
    }
  }

  return results;
}
