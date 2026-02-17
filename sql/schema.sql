-- ============================================================================
-- Thyme — Website Health & Performance Agent
-- All tables in shared AiEO Supabase project (zqvyaxexfbgyvebfnudz)
-- Prefix: website_agent_
-- ============================================================================

-- 1. Agent configuration
CREATE TABLE IF NOT EXISTS website_agent_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Google OAuth tokens (GA4 + Search Console)
CREATE TABLE IF NOT EXISTS website_agent_google_auth (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Master page inventory (populated from HubSpot CMS + crawl)
CREATE TABLE IF NOT EXISTS website_agent_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  slug TEXT,
  title TEXT,
  meta_description TEXT,
  page_type TEXT CHECK (page_type IN ('landing_page', 'site_page', 'blog_post', 'pillar_page')),
  hubspot_page_id TEXT,
  has_form BOOLEAN DEFAULT FALSE,
  form_ids TEXT[],
  has_cta BOOLEAN DEFAULT FALSE,
  cta_ids TEXT[],
  published_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,
  content_age_days INT,
  is_indexed BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  health_score INT,
  health_score_breakdown JSONB,
  last_health_check_at TIMESTAMPTZ,
  -- Meta/title audit fields
  title_length INT,
  meta_description_length INT,
  meta_issues JSONB,
  -- Link health fields
  has_broken_links BOOLEAN DEFAULT FALSE,
  broken_link_count INT DEFAULT 0,
  last_link_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_pages_url ON website_agent_pages(url);
CREATE INDEX IF NOT EXISTS idx_website_agent_pages_health_score ON website_agent_pages(health_score);
CREATE INDEX IF NOT EXISTS idx_website_agent_pages_page_type ON website_agent_pages(page_type);

-- 4. Search Console data per page per period
CREATE TABLE IF NOT EXISTS website_agent_search_console_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  queries JSONB,
  total_clicks INT DEFAULT 0,
  total_impressions INT DEFAULT 0,
  avg_ctr NUMERIC,
  avg_position NUMERIC,
  clicks_previous_period INT,
  impressions_previous_period INT,
  position_change NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_sc_snapshots_url ON website_agent_search_console_snapshots(page_url);
CREATE INDEX IF NOT EXISTS idx_website_agent_sc_snapshots_date ON website_agent_search_console_snapshots(snapshot_date DESC);

-- 5. GA4 data per page per period
CREATE TABLE IF NOT EXISTS website_agent_ga4_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  active_users INT DEFAULT 0,
  sessions INT DEFAULT 0,
  page_views INT DEFAULT 0,
  bounce_rate NUMERIC,
  avg_session_duration NUMERIC,
  traffic_sources JSONB,
  users_previous_period INT,
  sessions_previous_period INT,
  traffic_change_pct NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_ga4_snapshots_url ON website_agent_ga4_snapshots(page_url);
CREATE INDEX IF NOT EXISTS idx_website_agent_ga4_snapshots_date ON website_agent_ga4_snapshots(snapshot_date DESC);

-- 6. PageSpeed results per page
CREATE TABLE IF NOT EXISTS website_agent_page_speed_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT NOT NULL,
  test_date DATE NOT NULL,
  strategy TEXT CHECK (strategy IN ('mobile', 'desktop')),
  performance_score INT,
  accessibility_score INT,
  seo_score INT,
  best_practices_score INT,
  lcp_ms NUMERIC,
  fid_ms NUMERIC,
  cls NUMERIC,
  inp_ms NUMERIC,
  opportunities JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_psi_url ON website_agent_page_speed_scores(page_url);
CREATE INDEX IF NOT EXISTS idx_website_agent_psi_date ON website_agent_page_speed_scores(test_date DESC);

-- 7. 404 and broken link tracking
CREATE TABLE IF NOT EXISTS website_agent_link_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_page_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  link_type TEXT CHECK (link_type IN ('internal', 'external')),
  http_status INT,
  is_broken BOOLEAN DEFAULT FALSE,
  is_redirect BOOLEAN DEFAULT FALSE,
  redirect_chain TEXT[],
  redirect_count INT DEFAULT 0,
  error_message TEXT,
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_link_health_source ON website_agent_link_health(source_page_url);
CREATE INDEX IF NOT EXISTS idx_website_agent_link_health_broken ON website_agent_link_health(is_broken) WHERE is_broken = TRUE;

-- 8. Conversion tracking health
CREATE TABLE IF NOT EXISTS website_agent_conversion_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_date DATE NOT NULL,
  ga4_key_events JSONB,
  ga4_key_events_count INT DEFAULT 0,
  hubspot_forms JSONB,
  hubspot_forms_count INT DEFAULT 0,
  coverage_gaps JSONB,
  tracking_health TEXT CHECK (tracking_health IN ('healthy', 'degraded', 'broken', 'not_configured')),
  recommendations JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_conversion_audit_date ON website_agent_conversion_audit(audit_date DESC);

-- 9. Issues detected and investigated
CREATE TABLE IF NOT EXISTS website_agent_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_url TEXT,
  page_id UUID REFERENCES website_agent_pages(id),
  finding_type TEXT CHECK (finding_type IN (
    'traffic_decline', 'ranking_loss', 'speed_degradation', 'content_stale',
    'conversion_broken', 'keyword_gap', 'crawl_error', 'mobile_issue',
    'content_missing', 'conversion_audit', 'broken_link', 'meta_issue'
  )),
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  health_score INT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  business_impact TEXT,
  -- Agent loop metadata
  agent_loop_iterations INT,
  agent_loop_tools_used TEXT[],
  agent_investigation_summary TEXT,
  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'recommendation_drafted', 'approved', 'completed', 'expired', 'skipped')),
  skip_reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_findings_status ON website_agent_findings(status);
CREATE INDEX IF NOT EXISTS idx_website_agent_findings_type ON website_agent_findings(finding_type);
CREATE INDEX IF NOT EXISTS idx_website_agent_findings_created ON website_agent_findings(created_at DESC);

-- 10. Pending recommendations for human approval
CREATE TABLE IF NOT EXISTS website_agent_decision_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_id UUID REFERENCES website_agent_findings(id),
  page_url TEXT,
  action_type TEXT CHECK (action_type IN (
    'fix_content', 'fix_technical', 'fix_tracking', 'create_page',
    'update_meta', 'improve_speed', 'fix_broken_link', 'investigate_further'
  )),
  action_summary TEXT NOT NULL,
  action_detail JSONB,
  finding_type TEXT,
  severity TEXT,
  confidence FLOAT,
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  priority INT CHECK (priority >= 1 AND priority <= 10),
  quality_check JSONB,
  -- Agent loop metadata
  agent_loop_iterations INT,
  agent_loop_tools_used TEXT[],
  agent_investigation_summary TEXT,
  -- Review
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_dq_status ON website_agent_decision_queue(status);
CREATE INDEX IF NOT EXISTS idx_website_agent_dq_created ON website_agent_decision_queue(created_at DESC);

-- 11. Audit trail
CREATE TABLE IF NOT EXISTS website_agent_change_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  action_detail TEXT,
  data_used JSONB,
  reason TEXT,
  outcome TEXT CHECK (outcome IN ('pending', 'approved', 'rejected', 'executed')),
  executed_by TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_changelog_type ON website_agent_change_log(action_type);
CREATE INDEX IF NOT EXISTS idx_website_agent_changelog_created ON website_agent_change_log(created_at DESC);

-- 12. Alerts
CREATE TABLE IF NOT EXISTS website_agent_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'success', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_notifications_read ON website_agent_notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_website_agent_notifications_created ON website_agent_notifications(created_at DESC);

-- 13. Safety rules
CREATE TABLE IF NOT EXISTS website_agent_guardrails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_name TEXT NOT NULL UNIQUE,
  rule_type TEXT CHECK (rule_type IN ('threshold', 'rule', 'trend')),
  rule_category TEXT CHECK (rule_category IN (
    'traffic', 'seo', 'speed', 'content', 'conversion', 'technical', 'links', 'meta', 'anti_drift'
  )),
  threshold_value NUMERIC,
  config_json JSONB,
  violation_action TEXT CHECK (violation_action IN ('warn', 'block', 'alert')),
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Weekly summaries
CREATE TABLE IF NOT EXISTS website_agent_weekly_digest (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  digest_date DATE NOT NULL,
  digest_week_start DATE NOT NULL,
  digest_week_end DATE NOT NULL,
  summary_narrative TEXT,
  pages_scanned INT DEFAULT 0,
  findings_count INT DEFAULT 0,
  recommendations_count INT DEFAULT 0,
  top_findings JSONB,
  trend_summary JSONB,
  conversion_audit_summary JSONB,
  keyword_coverage_gaps JSONB,
  broken_links_summary JSONB,
  meta_audit_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_digest_date ON website_agent_weekly_digest(digest_date DESC);

-- 15. Site-wide trends over time
CREATE TABLE IF NOT EXISTS website_agent_trend_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  period TEXT CHECK (period IN ('daily', 'weekly')),
  total_traffic INT DEFAULT 0,
  traffic_change_pct NUMERIC,
  avg_health_score NUMERIC,
  health_score_distribution JSONB,
  top_declining_pages JSONB,
  top_improving_pages JSONB,
  ranking_changes JSONB,
  speed_summary JSONB,
  content_freshness_summary JSONB,
  broken_links_count INT DEFAULT 0,
  new_broken_links INT DEFAULT 0,
  meta_issues_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_agent_trends_date ON website_agent_trend_snapshots(snapshot_date DESC);
