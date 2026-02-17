# Thyme — SALT Crew Website Health & Performance Agent

Website health and performance monitoring agent with AI-powered investigation (agent loop) for inecta.com, hosted on HubSpot CMS. Pulls data from GA4, Search Console, PageSpeed Insights, and HubSpot CMS to compute page health scores and surface prioritized recommendations.

## Stack

Next.js 15.5 (App Router) · React 18 · TypeScript · Tailwind CSS 4 · Supabase (AiEO project) · Claude Sonnet 4.5 · Google Analytics 4 · Google Search Console · PageSpeed Insights API · HubSpot CMS API · Vercel (Hobby plan) · Recharts · Framer Motion

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | Health check — returns `{ status, agent, timestamp }` |
| `/api/status` | GET | Agent status — last run, pending decisions |
| `/api/trigger` | POST | Manual trigger — runs main scan |
| `/api/website-agent/scan` | POST/GET | Cron 1 — MWF data pull + Layer 1 scoring + Layer 2 agent loop |
| `/api/website-agent/weekly` | POST/GET | Cron 2 — Sunday full analysis + conversion audit + digest |
| `/api/website-agent/decide` | POST | Approve/reject recommendations |
| `/api/website-agent/overview` | GET | Dashboard overview data |
| `/api/website-agent/pages` | GET | Page inventory with filtering |
| `/api/website-agent/findings` | GET | Findings list with filtering |
| `/api/website-agent/trends` | GET | Trend data for charts |
| `/api/website-agent/conversion-audit` | GET | Latest conversion audit results |
| `/api/auth/google/callback` | GET | Google OAuth callback |

## Database Tables (AiEO Supabase project: zqvyaxexfbgyvebfnudz)

- `website_agent_config` — Agent configuration (key-value)
- `website_agent_google_auth` — Google OAuth tokens (single row, rotated on refresh)
- `website_agent_pages` — Page inventory with health scores, meta status, link status
- `website_agent_search_console_snapshots` — Per-page search analytics (clicks, impressions, CTR, position)
- `website_agent_ga4_snapshots` — Per-page traffic data (users, sessions, pageviews, bounce rate)
- `website_agent_page_speed_scores` — PageSpeed + Core Web Vitals per page
- `website_agent_link_health` — Link status tracking (broken, redirects, chains)
- `website_agent_conversion_audit` — GA4 events vs HubSpot forms cross-reference
- `website_agent_findings` — Detected issues with agent investigation summaries
- `website_agent_decision_queue` — Pending recommendations for human approval
- `website_agent_change_log` — Audit trail of all actions
- `website_agent_notifications` — Alerts and messages
- `website_agent_guardrails` — Safety rules (confidence thresholds, blocked actions)
- `website_agent_weekly_digest` — Weekly summary narratives
- `website_agent_trend_snapshots` — Metric trends over time (weekly/monthly)

## Cron Schedule

| Schedule | Route | Description |
|----------|-------|-------------|
| `0 14 * * 1,3,5` | `/api/website-agent/scan` | 2 PM UTC Mon/Wed/Fri — Data pull + scoring + agent loop (top 3 flagged pages) |
| `0 14 * * 0` | `/api/website-agent/weekly` | 2 PM UTC Sunday — Full analysis + conversion audit + keyword gaps + digest |

## Architecture

### Two-Layer Analysis
- **Layer 1** (deterministic): Health scoring (0-100) across 6 dimensions. Threshold: 50 (flagged), 30 (critical).
- **Layer 2** (agent loop): Claude investigates top 3 flagged pages with 8 tools, max 6 calls, max 40s per page.

### Health Score Dimensions (0-100)
| Dimension | Weight | Source |
|-----------|--------|--------|
| Traffic trend | 0-20 | GA4 (current vs previous period) |
| SEO ranking | 0-20 | Search Console (best keyword position) |
| Page speed | 0-20 | PageSpeed Insights (mobile performance) |
| Content freshness | 0-15 | HubSpot CMS (days since last update) |
| Conversion health | 0-15 | HubSpot forms + GA4 events |
| Technical health | 0-10 | Crawl errors, index status, broken links, meta issues |

### Agent Loop Tools
| Tool | Purpose |
|------|---------|
| `get_page_analytics` | GA4 detail for one page |
| `get_page_rankings` | Search Console detail for one page |
| `get_page_speed_detail` | PageSpeed for one URL |
| `get_hubspot_page_detail` | HubSpot CMS data for one page |
| `check_keyword_page_gap` | Compare keyword vs existing pages |
| `check_signal_bus` | Cross-agent intelligence |
| `evaluate_recommendation` | Validate against guardrails |
| `submit_finding` | **Terminal** — submit finding with recommendation |
| `skip_finding` | **Terminal** — skip with reason |

### Scan Route Time Budget (120s max)
| Time | Step |
|------|------|
| 0-5s | Refresh Google token + load config + page inventory |
| 5-15s | Search Console data (7d vs prev 7d) |
| 15-25s | GA4 data (7d vs prev 7d) |
| 25-30s | PageSpeed spot checks (3-5 worst pages) |
| 30-35s | HubSpot CMS sync |
| 35-40s | Broken link check (10-15 rotating pages) |
| 40-45s | Meta/title audit |
| 45-55s | Layer 1: Compute health scores, flag pages <50 |
| 55-60s | Rank flagged pages, pick top 3 |
| 60-105s | Layer 2: Agent loop (~15s each) |
| 105-120s | Write findings + emit signals |

## Signal Bus Events

Thyme writes to `shared_agent_signals` with `source_agent: 'thyme'`:

| Event Type | Trigger |
|---|---|
| `website_health_alert` | Page health drops below 30 |
| `website_scan_complete` | Scan finished |
| `website_finding_critical` | Critical severity finding |
| `website_traffic_drop` | Significant traffic decline detected |
| `website_ranking_loss` | Major ranking position loss |
| `website_speed_alert` | PageSpeed score below threshold |
| `website_weekly_complete` | Weekly analysis finished |
| `website_broken_links` | New broken links detected |
| `website_conversion_issue` | Conversion tracking degraded/broken |
| `website_keyword_gap` | Keyword with ad spend but no organic page |

### Consumes

Thyme polls `shared_agent_signals` for signals from other agents:

| Event Type | From | Purpose |
|---|---|---|
| `trending_search_term` | Saffron | Check if organic pages exist for high-converting search terms |
| `high_cpc_alert` | Saffron | Prioritize keyword coverage gap analysis |

## Key Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Environment Variables

```bash
NEXT_PUBLIC_AIEO_SUPABASE_URL=      # AiEO Supabase project URL
NEXT_PUBLIC_AIEO_SUPABASE_ANON_KEY= # AiEO anon key (browser-side auth)
AIEO_SUPABASE_SERVICE_KEY=          # Service role key (server-side)
GOOGLE_CLIENT_ID=                   # Google OAuth2 client ID
GOOGLE_CLIENT_SECRET=               # Google OAuth2 client secret
GOOGLE_REDIRECT_URI=                # OAuth callback URL
GA4_PROPERTY_ID=371821357           # GA4 property ID for inecta.com
SEARCH_CONSOLE_SITE_URL=            # Search Console site URL
PAGESPEED_API_KEY=                  # PageSpeed Insights API key
HUBSPOT_PRIVATE_APP_TOKEN=          # HubSpot private app token (existing)
ANTHROPIC_API_KEY=                  # Claude API key
CRON_SECRET=                        # Vercel cron auth token
```

## Conventions

- This agent is part of the SALT Crew network. See salt-crew-core/ARCHITECTURE.md for shared SALT Crew conventions.
- Thyme reads/writes to the same AiEO Supabase project as Saffron and Cayenne — no separate database.
- All tables prefixed `website_agent_*`.
- `maxDuration = 120` on all cron routes (Vercel Hobby plan ceiling).
- Google APIs: native `fetch()`, zero SDK dependencies.
- Google tokens rotate on refresh — stored in Supabase, NOT env vars.
- Cookie-based SSO on `.inecta-salt.com` domain (shared with SALT hub, Saffron, and Cayenne).
- Human approval required for all recommendations via decision queue.
- Agent loop processes top 3 flagged pages per scan (tunable).
- Decision queue items expire after 48 hours.

## Gotchas

- **ESLint = build-breaking**: Vercel treats lint warnings as errors. Always `npm run lint` before push.
- **Hobby plan limits**: Max 2 crons (both used), 120s function timeout.
- **Google token rotation**: Refresh tokens from Google are long-lived but access tokens expire hourly. 60-second buffer on refresh.
- **PageSpeed rate limits**: PSI has per-second rate limits. Spot-check only 3-5 pages per scan, not full inventory.
- **HubSpot CMS pagination**: Site pages, landing pages, and blog posts are fetched separately with offset pagination (100/page).
- **Link checker concurrency**: Capped at 5 concurrent HEAD requests to avoid being blocked.
- **Dashboard is single-file**: ~650 lines. Handle with care.
- **No database migrations tool**: Schema changes are manual SQL. Check `sql/` for history.
- **Health score is composite**: 6 dimensions, each scored independently. Missing data dimensions score 0, not null.
- **Conversion audit cross-reference**: Matches GA4 key events to HubSpot forms by name similarity — not an exact join.
