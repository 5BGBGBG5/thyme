'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, FileText, AlertTriangle, Search, Zap, Target,
  RefreshCw, ChevronDown, ChevronUp, ExternalLink, Check, X,
  Activity, Link2, Type,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

export const dynamic = 'force-dynamic';

// ============================================================================
// Types
// ============================================================================

interface OverviewData {
  totalPages: number;
  avgHealthScore: number;
  criticalPages: number;
  findingsThisWeek: number;
  pendingRecommendations: number;
  brokenLinksCount: number;
  metaIssuesCount: number;
  conversionHealth: string;
  recentActivity: Array<{ action_type: string; action_detail: string; created_at: string }>;
  topIssues: Array<{
    id: string; finding_type: string; severity: string; title: string;
    page_url: string; health_score: number; status: string; created_at: string;
  }>;
}

interface PageData {
  id: string; url: string; title: string; page_type: string;
  health_score: number; health_score_breakdown: Record<string, number> | null;
  has_form: boolean; has_broken_links: boolean; broken_link_count: number;
  meta_issues: string[] | null; last_updated_at: string; content_age_days: number;
  meta_description: string; title_length: number; meta_description_length: number;
}

interface FindingData {
  id: string; finding_type: string; severity: string; title: string; description: string;
  page_url: string; health_score: number; status: string; business_impact: string;
  agent_investigation_summary: string; agent_loop_iterations: number;
  agent_loop_tools_used: string[]; created_at: string;
}

interface DecisionData {
  id: string; finding_id: string; action_type: string; action_summary: string;
  severity: string; confidence: number; risk_level: string; priority: number;
  status: string; agent_investigation_summary: string;
}

interface TrendData {
  snapshot_date: string; total_traffic: number; traffic_change_pct: number;
  avg_health_score: number; broken_links_count: number; meta_issues_count: number;
}

interface ConversionAuditData {
  tracking_health: string; ga4_key_events_count: number; ga4_key_events: Array<{ name: string }>;
  hubspot_forms_count: number; hubspot_forms: Array<{ name: string; submission_count: number }>;
  coverage_gaps: Array<{ formName: string; reason: string }>;
  recommendations: Array<{ priority: string; title: string; description: string }>;
  audit_date: string;
}

interface DigestData {
  digest_date: string; summary_narrative: string; pages_scanned: number;
  findings_count: number; recommendations_count: number;
  broken_links_summary: Record<string, unknown>; meta_audit_summary: Record<string, unknown>;
  keyword_coverage_gaps: Array<Record<string, unknown>>;
}

// ============================================================================
// Tabs
// ============================================================================

const TABS = [
  { id: 'overview', label: 'Overview', icon: TrendingUp },
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'findings', label: 'Findings', icon: AlertTriangle },
  { id: 'seo', label: 'SEO', icon: Search },
  { id: 'speed', label: 'Speed', icon: Zap },
  { id: 'conversions', label: 'Conversions', icon: Target },
  { id: 'digest', label: 'Digest', icon: FileText },
] as const;

type TabId = typeof TABS[number]['id'];

// ============================================================================
// Helper Components
// ============================================================================

function MetricCard({ label, value, icon: Icon, color = 'text-accent-primary' }: {
  label: string; value: string | number; icon: typeof TrendingUp; color?: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-secondary">{label}</span>
        <Icon size={18} className={color} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[severity] || colors.low}`}>
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-400',
    approved: 'bg-green-500/20 text-green-400',
    rejected: 'bg-red-500/20 text-red-400',
    new: 'bg-cyan-500/20 text-cyan-400',
    recommendation_drafted: 'bg-purple-500/20 text-purple-400',
    completed: 'bg-green-500/20 text-green-400',
    skipped: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function HealthBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-text-secondary text-sm">N/A</span>;
  const color = score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : score >= 30 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-background-hover rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-mono">{score}</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="animate-spin text-accent-primary" size={24} />
      <span className="ml-3 text-text-secondary">Loading...</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-text-secondary">{message}</div>
  );
}

function ExpandableText({ text, maxLength = 150 }: { text: string; maxLength?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text || text.length <= maxLength) return <span>{text}</span>;
  return (
    <span>
      {expanded ? text : `${text.slice(0, maxLength)}...`}
      <button onClick={() => setExpanded(!expanded)} className="ml-1 text-accent-primary text-xs hover:underline">
        {expanded ? 'less' : 'more'}
      </button>
    </span>
  );
}

// ============================================================================
// Tab Content Components
// ============================================================================

function OverviewTab({ data }: { data: OverviewData | null }) {
  if (!data) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Pages Monitored" value={data.totalPages} icon={FileText} />
        <MetricCard label="Avg Health Score" value={`${data.avgHealthScore}/100`} icon={TrendingUp}
          color={data.avgHealthScore >= 60 ? 'text-accent-success' : 'text-accent-error'} />
        <MetricCard label="Findings This Week" value={data.findingsThisWeek} icon={AlertTriangle}
          color={data.findingsThisWeek > 0 ? 'text-amber-400' : 'text-accent-success'} />
        <MetricCard label="Pending Reviews" value={data.pendingRecommendations} icon={Target}
          color={data.pendingRecommendations > 0 ? 'text-purple-400' : 'text-text-secondary'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Critical Pages" value={data.criticalPages} icon={AlertTriangle}
          color={data.criticalPages > 0 ? 'text-red-400' : 'text-accent-success'} />
        <MetricCard label="Broken Links" value={data.brokenLinksCount} icon={Link2}
          color={data.brokenLinksCount > 0 ? 'text-orange-400' : 'text-accent-success'} />
        <MetricCard label="Meta Issues" value={data.metaIssuesCount} icon={Type}
          color={data.metaIssuesCount > 0 ? 'text-yellow-400' : 'text-accent-success'} />
        <MetricCard label="Conversion Tracking" value={data.conversionHealth} icon={Target}
          color={data.conversionHealth === 'healthy' ? 'text-accent-success' : 'text-accent-error'} />
      </div>

      {data.topIssues.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">Top Issues</h3>
          <div className="space-y-3">
            {data.topIssues.map(issue => (
              <div key={issue.id} className="flex items-center justify-between p-3 rounded-lg bg-background-hover/50">
                <div className="flex items-center gap-3">
                  <SeverityBadge severity={issue.severity} />
                  <span className="text-sm">{issue.title}</span>
                </div>
                <HealthBar score={issue.health_score} />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recentActivity.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-2">
            {data.recentActivity.map((activity, i) => (
              <div key={i} className="flex items-start gap-3 p-2 text-sm">
                <Activity size={14} className="text-text-secondary mt-1 shrink-0" />
                <div>
                  <span className="text-text-primary">{activity.action_detail}</span>
                  <span className="text-text-secondary ml-2 text-xs">
                    {new Date(activity.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PagesTab({ pages, loading }: { pages: PageData[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) return <LoadingState />;
  if (pages.length === 0) return <EmptyState message="No pages in inventory yet. Trigger a scan to populate." />;

  return (
    <div className="glass-table">
      <table className="w-full">
        <thead>
          <tr>
            <th>Page</th>
            <th>Type</th>
            <th>Health</th>
            <th>Issues</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pages.map(page => (
            <>
              <tr key={page.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === page.id ? null : page.id)}>
                <td className="max-w-xs">
                  <div className="truncate font-medium">{page.title || page.url}</div>
                  <div className="text-xs text-text-secondary truncate">{page.url}</div>
                </td>
                <td><span className="text-xs px-2 py-0.5 rounded bg-background-hover">{page.page_type}</span></td>
                <td><HealthBar score={page.health_score} /></td>
                <td>
                  <div className="flex gap-1">
                    {page.has_broken_links && <span className="text-xs text-red-400" title="Broken links">BL</span>}
                    {page.meta_issues && page.meta_issues.length > 0 && <span className="text-xs text-yellow-400" title="Meta issues">MI</span>}
                    {page.has_form && <span className="text-xs text-cyan-400" title="Has form">FM</span>}
                  </div>
                </td>
                <td className="text-xs text-text-secondary">
                  {page.last_updated_at ? new Date(page.last_updated_at).toLocaleDateString() : 'Unknown'}
                </td>
                <td>{expandedId === page.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
              </tr>
              {expandedId === page.id && (
                <tr key={`${page.id}-detail`}>
                  <td colSpan={6} className="!p-4 bg-background-primary/50">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {page.health_score_breakdown && Object.entries(page.health_score_breakdown).map(([key, value]) => (
                        key !== 'total' && (
                          <div key={key} className="flex justify-between">
                            <span className="text-text-secondary">{key.replace(/_/g, ' ')}</span>
                            <span className="font-mono">{value as number}</span>
                          </div>
                        )
                      ))}
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Content Age</span>
                        <span>{page.content_age_days ? `${page.content_age_days}d` : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Broken Links</span>
                        <span>{page.broken_link_count || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-secondary">Meta Issues</span>
                        <span>{page.meta_issues?.join(', ') || 'None'}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <a href={page.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-accent-primary flex items-center gap-1 hover:underline">
                        Visit page <ExternalLink size={12} />
                      </a>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FindingsTab({ findings, decisions, loading, onDecide }: {
  findings: FindingData[]; decisions: DecisionData[]; loading: boolean;
  onDecide: (id: string, action: 'approve' | 'reject') => void;
}) {
  if (loading) return <LoadingState />;
  if (findings.length === 0) return <EmptyState message="No findings yet. Trigger a scan to detect issues." />;

  return (
    <div className="space-y-4">
      {findings.map(finding => {
        const decision = decisions.find(d => d.finding_id === finding.id);
        return (
          <div key={finding.id} className="glass-card p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <SeverityBadge severity={finding.severity} />
                <StatusBadge status={finding.status} />
                <span className="text-xs text-text-secondary">
                  {finding.finding_type.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-xs text-text-secondary">
                {new Date(finding.created_at).toLocaleDateString()}
              </span>
            </div>

            <h4 className="font-semibold mb-2">{finding.title}</h4>
            <p className="text-sm text-text-secondary mb-2">
              <ExpandableText text={finding.description} maxLength={200} />
            </p>

            {finding.business_impact && (
              <p className="text-sm text-amber-400 mb-2">Impact: {finding.business_impact}</p>
            )}

            {finding.page_url && (
              <a href={finding.page_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-accent-primary flex items-center gap-1 mb-2 hover:underline">
                {finding.page_url} <ExternalLink size={12} />
              </a>
            )}

            {finding.agent_investigation_summary && (
              <div className="mt-3 p-3 rounded-lg bg-background-primary/50 text-sm">
                <div className="text-xs text-text-secondary mb-1">
                  Agent Investigation ({finding.agent_loop_iterations} iterations, tools: {finding.agent_loop_tools_used?.join(', ') || 'none'})
                </div>
                <ExpandableText text={finding.agent_investigation_summary} maxLength={300} />
              </div>
            )}

            {decision && decision.status === 'pending' && (
              <div className="mt-4 flex items-center gap-3 pt-3 border-t border-border-secondary">
                <span className="text-sm text-text-secondary">Recommendation: {decision.action_summary}</span>
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => onDecide(decision.id, 'approve')}
                    className="btn-primary px-3 py-1.5 text-sm flex items-center gap-1">
                    <Check size={14} /> Approve
                  </button>
                  <button onClick={() => onDecide(decision.id, 'reject')}
                    className="btn-secondary px-3 py-1.5 text-sm flex items-center gap-1">
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SEOTab({ trends, loading }: { trends: TrendData[]; loading: boolean }) {
  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {trends.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">Traffic Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="snapshot_date" stroke="#8B949E" tick={{ fontSize: 12 }} />
              <YAxis stroke="#8B949E" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 8 }} />
              <Line type="monotone" dataKey="total_traffic" stroke="#22D3EE" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {trends.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">Health Score Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="snapshot_date" stroke="#8B949E" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#8B949E" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 8 }} />
              <Line type="monotone" dataKey="avg_health_score" stroke="#34D399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {trends.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">Meta Issues Over Time</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
              <XAxis dataKey="snapshot_date" stroke="#8B949E" tick={{ fontSize: 12 }} />
              <YAxis stroke="#8B949E" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: 8 }} />
              <Bar dataKey="meta_issues_count" fill="#EAB308" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {trends.length === 0 && <EmptyState message="No SEO data yet. Run a scan to populate trends." />}
    </div>
  );
}

function SpeedTab({ pages, loading }: { pages: PageData[]; loading: boolean }) {
  if (loading) return <LoadingState />;

  const pagesWithScore = pages.filter(p => p.health_score_breakdown?.page_speed !== undefined);
  if (pagesWithScore.length === 0) return <EmptyState message="No speed data yet. PageSpeed tests run during scans." />;

  return (
    <div className="space-y-6">
      <div className="glass-card p-5">
        <h3 className="text-lg font-semibold mb-4">Page Speed Scores</h3>
        <div className="glass-table">
          <table className="w-full">
            <thead>
              <tr>
                <th>Page</th>
                <th>Speed Score</th>
                <th>Page Type</th>
              </tr>
            </thead>
            <tbody>
              {pagesWithScore
                .sort((a, b) => (a.health_score_breakdown?.page_speed || 0) - (b.health_score_breakdown?.page_speed || 0))
                .slice(0, 20)
                .map(page => (
                  <tr key={page.id}>
                    <td className="max-w-xs">
                      <div className="truncate text-sm">{page.title || page.url}</div>
                      <div className="text-xs text-text-secondary truncate">{page.url}</div>
                    </td>
                    <td>
                      <span className={`font-mono text-sm ${
                        (page.health_score_breakdown?.page_speed || 0) >= 15 ? 'text-green-400' :
                        (page.health_score_breakdown?.page_speed || 0) >= 8 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {page.health_score_breakdown?.page_speed || 0}/20
                      </span>
                    </td>
                    <td><span className="text-xs px-2 py-0.5 rounded bg-background-hover">{page.page_type}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ConversionsTab({ audit, loading }: { audit: ConversionAuditData | null; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (!audit) return <EmptyState message="No conversion audit data yet. Run a weekly scan." />;

  const healthColors: Record<string, string> = {
    healthy: 'text-green-400 bg-green-500/20 border-green-500/30',
    degraded: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
    broken: 'text-red-400 bg-red-500/20 border-red-500/30',
    not_configured: 'text-red-400 bg-red-500/20 border-red-500/30',
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-8 text-center">
        <div className={`inline-block px-6 py-3 rounded-xl text-2xl font-bold border ${healthColors[audit.tracking_health] || healthColors.broken}`}>
          {audit.tracking_health.replace('_', ' ').toUpperCase()}
        </div>
        <p className="text-text-secondary mt-3">
          GA4 Key Events: {audit.ga4_key_events_count} | HubSpot Forms: {audit.hubspot_forms_count}
        </p>
        <p className="text-xs text-text-secondary mt-1">Last audit: {audit.audit_date}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">GA4 Key Events</h3>
          {audit.ga4_key_events.length === 0 ? (
            <p className="text-red-400 text-sm">No key events configured in GA4</p>
          ) : (
            <ul className="space-y-2">
              {audit.ga4_key_events.map((event, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-400" />
                  {event.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">HubSpot Forms</h3>
          {audit.hubspot_forms.length === 0 ? (
            <p className="text-text-secondary text-sm">No forms found</p>
          ) : (
            <ul className="space-y-2">
              {audit.hubspot_forms.slice(0, 10).map((form, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>{form.name}</span>
                  <span className="font-mono text-text-secondary">{form.submission_count} submissions</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {audit.coverage_gaps.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4 text-amber-400">Coverage Gaps</h3>
          <ul className="space-y-2">
            {audit.coverage_gaps.map((gap, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <AlertTriangle size={14} className="text-amber-400" />
                <span>{gap.formName}: {gap.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit.recommendations.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
          <div className="space-y-3">
            {audit.recommendations.map((rec, i) => (
              <div key={i} className="p-3 rounded-lg bg-background-hover/50">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={rec.priority} />
                  <span className="font-medium text-sm">{rec.title}</span>
                </div>
                <p className="text-xs text-text-secondary">{rec.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DigestTab({ digests, loading }: { digests: DigestData[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (digests.length === 0) return <EmptyState message="No weekly digests yet. Wait for the Sunday analysis." />;

  return (
    <div className="space-y-6">
      {digests.map((digest, i) => (
        <div key={i} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Week of {digest.digest_date}</h3>
            <div className="flex gap-3 text-sm text-text-secondary">
              <span>{digest.pages_scanned} pages</span>
              <span>{digest.findings_count} findings</span>
              <span>{digest.recommendations_count} recommendations</span>
            </div>
          </div>

          {digest.summary_narrative && (
            <div className="prose prose-invert max-w-none text-sm text-text-primary whitespace-pre-wrap">
              {digest.summary_narrative}
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-background-hover/50">
              <span className="text-text-secondary">Broken Links</span>
              <div className="font-mono mt-1">{(digest.broken_links_summary as Record<string, number>)?.count || 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-background-hover/50">
              <span className="text-text-secondary">Meta Issues</span>
              <div className="font-mono mt-1">{(digest.meta_audit_summary as Record<string, number>)?.issueCount || 0}</div>
            </div>
            <div className="p-3 rounded-lg bg-background-hover/50">
              <span className="text-text-secondary">Keyword Gaps</span>
              <div className="font-mono mt-1">{digest.keyword_coverage_gaps?.length || 0}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Dashboard
// ============================================================================

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);

  // Data state
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [findings, setFindings] = useState<FindingData[]>([]);
  const [decisions, setDecisions] = useState<DecisionData[]>([]);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [conversionAudit, setConversionAudit] = useState<ConversionAuditData | null>(null);
  const [digests, setDigests] = useState<DigestData[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const responses = await Promise.allSettled([
        fetch('/api/website-agent/overview').then(r => r.json()),
        fetch('/api/website-agent/pages?limit=100').then(r => r.json()),
        fetch('/api/website-agent/findings?limit=50').then(r => r.json()),
        fetch('/api/website-agent/trends').then(r => r.json()),
        fetch('/api/website-agent/conversion-audit').then(r => r.json()),
      ]);

      if (responses[0].status === 'fulfilled') setOverview(responses[0].value);
      if (responses[1].status === 'fulfilled') setPages(responses[1].value.pages || []);
      if (responses[2].status === 'fulfilled') {
        setFindings(responses[2].value.findings || []);
        setDecisions(responses[2].value.decisions || []);
      }
      if (responses[3].status === 'fulfilled') setTrends(responses[3].value.trends || []);
      if (responses[4].status === 'fulfilled') setConversionAudit(responses[4].value.audit || null);

      // Fetch digests separately (not critical path)
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(
          process.env.NEXT_PUBLIC_AIEO_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_AIEO_SUPABASE_ANON_KEY || ''
        );
        const { data } = await sb
          .from('website_agent_weekly_digest')
          .select('*')
          .order('digest_date', { ascending: false })
          .limit(5);
        setDigests((data as DigestData[]) || []);
      } catch {
        // Digest fetch failed — not critical
      }
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDecide = async (id: string, action: 'approve' | 'reject') => {
    try {
      await fetch('/api/website-agent/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      // Refresh data
      fetchData();
    } catch (err) {
      console.error('Decision failed:', err);
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-glow">Thyme</h1>
          <p className="text-text-secondary mt-1">Website Health & Performance Agent</p>
        </div>
        <button onClick={fetchData} className="btn-secondary flex items-center gap-2 text-sm"
          disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-hover'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && <OverviewTab data={overview} />}
          {activeTab === 'pages' && <PagesTab pages={pages} loading={loading} />}
          {activeTab === 'findings' && (
            <FindingsTab findings={findings} decisions={decisions} loading={loading} onDecide={handleDecide} />
          )}
          {activeTab === 'seo' && <SEOTab trends={trends} loading={loading} />}
          {activeTab === 'speed' && <SpeedTab pages={pages} loading={loading} />}
          {activeTab === 'conversions' && <ConversionsTab audit={conversionAudit} loading={loading} />}
          {activeTab === 'digest' && <DigestTab digests={digests} loading={loading} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
