// ============================================================================
// Page & Inventory Types
// ============================================================================

export type PageType = 'landing_page' | 'site_page' | 'blog_post' | 'pillar_page';

export interface WebPage {
  id: string;
  url: string;
  slug: string | null;
  title: string | null;
  meta_description: string | null;
  page_type: PageType | null;
  hubspot_page_id: string | null;
  has_form: boolean;
  form_ids: string[] | null;
  has_cta: boolean;
  cta_ids: string[] | null;
  published_at: string | null;
  last_updated_at: string | null;
  content_age_days: number | null;
  is_indexed: boolean;
  is_active: boolean;
  health_score: number | null;
  health_score_breakdown: HealthScoreBreakdown | null;
  last_health_check_at: string | null;
  title_length: number | null;
  meta_description_length: number | null;
  meta_issues: string[] | null;
  has_broken_links: boolean;
  broken_link_count: number;
  last_link_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthScoreBreakdown {
  traffic_trend: number;
  seo_ranking: number;
  page_speed: number;
  content_freshness: number;
  conversion_health: number;
  technical_health: number;
  total: number;
}

// ============================================================================
// Data Snapshot Types
// ============================================================================

export interface SearchConsoleQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleSnapshot {
  id: string;
  page_url: string;
  snapshot_date: string;
  queries: SearchConsoleQuery[] | null;
  total_clicks: number;
  total_impressions: number;
  avg_ctr: number | null;
  avg_position: number | null;
  clicks_previous_period: number | null;
  impressions_previous_period: number | null;
  position_change: number | null;
  created_at: string;
}

export interface TrafficSources {
  organic: number;
  paid: number;
  direct: number;
  referral: number;
  social: number;
}

export interface GA4Snapshot {
  id: string;
  page_url: string;
  snapshot_date: string;
  active_users: number;
  sessions: number;
  page_views: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
  traffic_sources: TrafficSources | null;
  users_previous_period: number | null;
  sessions_previous_period: number | null;
  traffic_change_pct: number | null;
  created_at: string;
}

export interface PageSpeedScore {
  id: string;
  page_url: string;
  test_date: string;
  strategy: 'mobile' | 'desktop';
  performance_score: number | null;
  accessibility_score: number | null;
  seo_score: number | null;
  best_practices_score: number | null;
  lcp_ms: number | null;
  fid_ms: number | null;
  cls: number | null;
  inp_ms: number | null;
  opportunities: Record<string, unknown>[] | null;
  created_at: string;
}

// ============================================================================
// Link Health Types
// ============================================================================

export interface LinkHealthRecord {
  id: string;
  source_page_url: string;
  target_url: string;
  link_type: 'internal' | 'external';
  http_status: number | null;
  is_broken: boolean;
  is_redirect: boolean;
  redirect_chain: string[] | null;
  redirect_count: number;
  error_message: string | null;
  first_detected_at: string;
  last_checked_at: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface LinkCheckResult {
  url: string;
  status: number | null;
  isRedirect: boolean;
  redirectChain: string[];
  isBroken: boolean;
  errorMessage: string | null;
}

// ============================================================================
// Meta Audit Types
// ============================================================================

export type MetaIssue =
  | 'missing_meta'
  | 'missing_title'
  | 'title_too_long'
  | 'title_too_short'
  | 'meta_too_long'
  | 'meta_too_short'
  | 'duplicate_title'
  | 'duplicate_meta';

export interface MetaAuditResult {
  url: string;
  issues: MetaIssue[];
  titleLength: number | null;
  metaDescriptionLength: number | null;
}

// ============================================================================
// Conversion Audit Types
// ============================================================================

export type TrackingHealth = 'healthy' | 'degraded' | 'broken' | 'not_configured';

export interface ConversionAuditResult {
  id: string;
  audit_date: string;
  ga4_key_events: Record<string, unknown>[] | null;
  ga4_key_events_count: number;
  hubspot_forms: Record<string, unknown>[] | null;
  hubspot_forms_count: number;
  coverage_gaps: Record<string, unknown>[] | null;
  tracking_health: TrackingHealth;
  recommendations: Record<string, unknown>[] | null;
  created_at: string;
}

// ============================================================================
// Findings & Decision Queue Types
// ============================================================================

export type FindingType =
  | 'traffic_decline'
  | 'ranking_loss'
  | 'speed_degradation'
  | 'content_stale'
  | 'conversion_broken'
  | 'keyword_gap'
  | 'crawl_error'
  | 'mobile_issue'
  | 'content_missing'
  | 'conversion_audit'
  | 'broken_link'
  | 'meta_issue';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export type FindingStatus = 'new' | 'recommendation_drafted' | 'approved' | 'completed' | 'expired' | 'skipped' | 'resolved';

export interface Finding {
  id: string;
  page_url: string | null;
  page_id: string | null;
  finding_type: FindingType;
  severity: FindingSeverity;
  health_score: number | null;
  title: string;
  description: string;
  business_impact: string | null;
  agent_loop_iterations: number | null;
  agent_loop_tools_used: string[] | null;
  agent_investigation_summary: string | null;
  status: FindingStatus;
  skip_reason: string | null;
  expires_at: string | null;
  // Auto-resolution tracking
  check_type: string | null;
  check_target: string | null;
  health_score_at_detection: number | null;
  health_score_at_resolution: number | null;
  resolved_at: string | null;
  resolution_method: 'auto' | 'manual' | null;
  created_at: string;
}

export type ActionType =
  | 'fix_content'
  | 'fix_technical'
  | 'fix_tracking'
  | 'create_page'
  | 'update_meta'
  | 'improve_speed'
  | 'fix_broken_link'
  | 'investigate_further';

export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface DecisionQueueItem {
  id: string;
  finding_id: string | null;
  page_url: string | null;
  action_type: ActionType;
  action_summary: string;
  action_detail: Record<string, unknown> | null;
  finding_type: string | null;
  severity: string | null;
  confidence: number | null;
  risk_level: 'low' | 'medium' | 'high';
  priority: number;
  quality_check: Record<string, unknown> | null;
  agent_loop_iterations: number | null;
  agent_loop_tools_used: string[] | null;
  agent_investigation_summary: string | null;
  status: DecisionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  expires_at: string | null;
  created_at: string;
}

// ============================================================================
// Change Log & Notifications
// ============================================================================

export interface ChangeLogEntry {
  id: string;
  action_type: string;
  action_detail: string | null;
  data_used: Record<string, unknown> | null;
  reason: string | null;
  outcome: string | null;
  executed_by: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  notification_type: string;
  severity: 'info' | 'warning' | 'success' | 'critical';
  title: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ============================================================================
// Guardrails
// ============================================================================

export interface Guardrail {
  id: string;
  rule_name: string;
  rule_type: 'threshold' | 'rule' | 'trend';
  rule_category: string;
  threshold_value: number | null;
  config_json: Record<string, unknown> | null;
  violation_action: 'warn' | 'block' | 'alert';
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Weekly Digest & Trends
// ============================================================================

export interface WeeklyDigest {
  id: string;
  digest_date: string;
  digest_week_start: string;
  digest_week_end: string;
  summary_narrative: string | null;
  pages_scanned: number;
  findings_count: number;
  recommendations_count: number;
  top_findings: Record<string, unknown>[] | null;
  trend_summary: Record<string, unknown> | null;
  conversion_audit_summary: Record<string, unknown> | null;
  keyword_coverage_gaps: Record<string, unknown>[] | null;
  broken_links_summary: Record<string, unknown> | null;
  meta_audit_summary: Record<string, unknown> | null;
  created_at: string;
}

export interface TrendSnapshot {
  id: string;
  snapshot_date: string;
  period: 'daily' | 'weekly';
  total_traffic: number;
  traffic_change_pct: number | null;
  avg_health_score: number | null;
  health_score_distribution: Record<string, number> | null;
  top_declining_pages: Record<string, unknown>[] | null;
  top_improving_pages: Record<string, unknown>[] | null;
  ranking_changes: Record<string, unknown> | null;
  speed_summary: Record<string, unknown> | null;
  content_freshness_summary: Record<string, unknown> | null;
  broken_links_count: number;
  new_broken_links: number;
  meta_issues_count: number;
  created_at: string;
}

// ============================================================================
// Agent Loop Types
// ============================================================================

export interface AgentToolCall {
  tool_name: string;
  input: Record<string, unknown>;
  output: unknown;
  duration_ms: number;
}

export interface AgentLoopResult {
  action: 'submit' | 'skip';
  finding_type?: FindingType;
  severity?: FindingSeverity;
  title?: string;
  description?: string;
  business_impact?: string;
  action_type?: ActionType;
  action_summary?: string;
  action_detail?: Record<string, unknown>;
  confidence?: number;
  risk_level?: 'low' | 'medium' | 'high';
  skip_reason?: string;
  investigation_summary: string;
  iterations: number;
  tools_used: string[];
  tool_calls: AgentToolCall[];
}

export interface FlaggedPage {
  page: WebPage;
  ga4Data: GA4Snapshot | null;
  searchData: SearchConsoleSnapshot | null;
  speedData: PageSpeedScore | null;
  flagReasons: string[];
}

// ============================================================================
// Keyword Coverage Types
// ============================================================================

export interface KeywordCoverageGap {
  keyword: string;
  monthlySpend: number | null;
  cpc: number | null;
  hasOrganicPage: boolean;
  bestRankingPage: string | null;
  position: number | null;
}

// ============================================================================
// HubSpot CMS Types
// ============================================================================

export interface HubSpotPage {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  url: string;
  state: string;
  page_type: PageType;
  published_at: string | null;
  updated_at: string | null;
  form_ids: string[];
  cta_ids: string[];
}

export interface HubSpotForm {
  id: string;
  name: string;
  submission_count: number;
  created_at: string;
  updated_at: string;
}
