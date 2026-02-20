export type ChangeType = 'feature' | 'fix' | 'improvement';

export interface ChangelogEntry {
  date: string;
  type: ChangeType;
  title: string;
  description: string;
}

// Newest first. To add an entry, prepend to this array.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    date: '2026-02-20',
    type: 'feature',
    title: 'Auto-resolution tracking for findings',
    description:
      'Findings are now automatically resolved when their underlying condition clears. Each scan checks open findings against current page data — meta fixes, broken link repairs, content updates, and speed improvements are detected without anyone marking them done. The dashboard shows before/after health score deltas.',
  },
  {
    date: '2026-02-20',
    type: 'fix',
    title: 'Fix Supabase 1000-row default limit on page queries',
    description:
      'Page inventory queries now explicitly request up to 2000 rows instead of relying on the Supabase default limit of 1000, which was silently truncating results for larger sites.',
  },
  {
    date: '2026-02-19',
    type: 'improvement',
    title: 'Optimize weekly route for 120s Vercel timeout',
    description:
      'Restructured the weekly analysis route with time-budgeted steps: 40s for link checks, 70s for keyword coverage, 95s for Claude narrative generation. Batched all DB operations to reduce round trips.',
  },
  {
    date: '2026-02-18',
    type: 'improvement',
    title: 'Reduce PSI tests to 2 + batch HubSpot sync',
    description:
      'Reduced PageSpeed Insights spot checks from 5 to 2 pages per scan and batched HubSpot CMS sync operations (50 concurrent updates, 100-row inserts) to fit within the scan time budget.',
  },
  {
    date: '2026-02-17',
    type: 'fix',
    title: 'Fix Vercel timeout with fire-and-forget trigger',
    description:
      'Changed the trigger endpoint to a fire-and-forget pattern so the scan runs asynchronously without blocking the HTTP response within the 120s Vercel Hobby plan limit.',
  },
  {
    date: '2026-02-16',
    type: 'improvement',
    title: 'Reduce agent loop to 1 candidate per scan',
    description:
      'Limited the Layer 2 agent loop to investigate 1 flagged page per scan instead of 3, ensuring the full scan completes within the 120-second time budget on Vercel.',
  },
  {
    date: '2026-02-15',
    type: 'feature',
    title: 'Initial launch — Thyme website health agent',
    description:
      'Full website health monitoring agent for inecta.com. Pulls data from GA4, Search Console, PageSpeed Insights, and HubSpot CMS. Computes 6-dimension health scores, runs AI-powered investigation on flagged pages, and surfaces prioritized recommendations via a decision queue.',
  },
];
