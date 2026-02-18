import { supabase } from '../supabase';
import { emitSignal } from '../signals';
import { runAgentLoop } from './agent-loop';
import type { FlaggedPage, Finding, AgentLoopResult } from './types';

const MAX_FINDINGS_PER_RUN = 1;

/**
 * Run Layer 2 analysis on flagged pages.
 * Investigates up to MAX_FINDINGS_PER_RUN pages via agent loop.
 */
export async function runLayer2Analysis(
  flaggedPages: FlaggedPage[]
): Promise<{ processed: number; findings: Finding[]; skipped: number }> {
  const toProcess = flaggedPages.slice(0, MAX_FINDINGS_PER_RUN);
  const findings: Finding[] = [];
  let skipped = 0;

  for (const flaggedPage of toProcess) {
    try {
      // Check for duplicate findings — don't re-investigate if pending/approved finding exists
      const { data: existingFinding } = await supabase
        .from('website_agent_findings')
        .select('id')
        .eq('page_url', flaggedPage.page.url)
        .in('status', ['new', 'recommendation_drafted', 'approved'])
        .limit(1)
        .single();

      if (existingFinding) {
        skipped++;
        continue;
      }

      // Run the agent loop
      const result = await runAgentLoop(flaggedPage);

      // Log investigation to change log
      await supabase.from('website_agent_change_log').insert({
        action_type: 'agent_investigation',
        action_detail: `Investigated "${flaggedPage.page.title}" (${flaggedPage.page.url})`,
        data_used: {
          page_url: flaggedPage.page.url,
          health_score: flaggedPage.page.health_score,
          flag_reasons: flaggedPage.flagReasons,
          iterations: result.iterations,
          tools_used: result.tools_used,
          tool_calls: result.tool_calls,
          action: result.action,
        },
        reason: result.action === 'skip' ? result.skip_reason : result.investigation_summary,
        outcome: result.action === 'submit' ? 'pending' : 'rejected',
      });

      if (result.action === 'skip') {
        skipped++;

        // Create finding with skipped status for audit trail
        await supabase.from('website_agent_findings').insert({
          page_url: flaggedPage.page.url,
          page_id: flaggedPage.page.id,
          finding_type: 'traffic_decline', // Default for skipped
          severity: 'low',
          health_score: flaggedPage.page.health_score,
          title: `Skipped: ${flaggedPage.page.title || flaggedPage.page.url}`,
          description: result.skip_reason || 'Agent decided not to submit a finding.',
          agent_loop_iterations: result.iterations,
          agent_loop_tools_used: result.tools_used,
          agent_investigation_summary: result.investigation_summary,
          status: 'skipped',
          skip_reason: result.skip_reason,
        });
        continue;
      }

      // Submit path — create finding + recommendation
      const finding = await createFinding(flaggedPage, result);
      if (finding) {
        findings.push(finding);
        await createRecommendation(finding, result);

        // Emit signals for important findings
        await emitFindingSignals(flaggedPage, result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Agent loop failed for ${flaggedPage.page.url}:`, message);

      await supabase.from('website_agent_change_log').insert({
        action_type: 'agent_investigation',
        action_detail: `Agent loop failed for "${flaggedPage.page.title}" (${flaggedPage.page.url})`,
        data_used: { error: message, page_url: flaggedPage.page.url },
        reason: `Error: ${message}`,
        outcome: 'rejected',
      });
    }
  }

  return { processed: toProcess.length, findings, skipped };
}

async function createFinding(
  flaggedPage: FlaggedPage,
  result: AgentLoopResult
): Promise<Finding | null> {
  const { data, error } = await supabase
    .from('website_agent_findings')
    .insert({
      page_url: flaggedPage.page.url,
      page_id: flaggedPage.page.id,
      finding_type: result.finding_type || 'traffic_decline',
      severity: result.severity || 'medium',
      health_score: flaggedPage.page.health_score,
      title: result.title || `Issue found: ${flaggedPage.page.url}`,
      description: result.description || result.investigation_summary,
      business_impact: result.business_impact,
      agent_loop_iterations: result.iterations,
      agent_loop_tools_used: result.tools_used,
      agent_investigation_summary: result.investigation_summary,
      status: 'recommendation_drafted',
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h expiry
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create finding:', error);
    return null;
  }

  return data as Finding;
}

async function createRecommendation(
  finding: Finding,
  result: AgentLoopResult
): Promise<void> {
  const priority = result.severity === 'critical' ? 10
    : result.severity === 'high' ? 8
    : result.severity === 'medium' ? 5
    : 3;

  await supabase.from('website_agent_decision_queue').insert({
    finding_id: finding.id,
    page_url: finding.page_url,
    action_type: result.action_type || 'investigate_further',
    action_summary: result.action_summary || result.investigation_summary,
    action_detail: {
      finding_type: result.finding_type,
      business_impact: result.business_impact,
      investigation_summary: result.investigation_summary,
    },
    finding_type: finding.finding_type,
    severity: finding.severity,
    confidence: result.confidence || 0.7,
    risk_level: result.risk_level || 'low',
    priority,
    agent_loop_iterations: result.iterations,
    agent_loop_tools_used: result.tools_used,
    agent_investigation_summary: result.investigation_summary,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });

  // Create notification
  await supabase.from('website_agent_notifications').insert({
    notification_type: 'new_recommendation',
    severity: finding.severity === 'critical' ? 'critical' : 'warning',
    title: `New finding: ${finding.title}`,
    message: result.action_summary || result.investigation_summary,
    related_entity_type: 'finding',
    related_entity_id: finding.id,
  });
}

async function emitFindingSignals(
  flaggedPage: FlaggedPage,
  result: AgentLoopResult
): Promise<void> {
  const pageUrl = flaggedPage.page.url;
  const healthScore = flaggedPage.page.health_score || 0;

  // Emit based on finding type
  if (result.finding_type === 'traffic_decline') {
    await emitSignal('page_traffic_drop', {
      pageUrl,
      trafficBefore: flaggedPage.ga4Data?.users_previous_period,
      trafficAfter: flaggedPage.ga4Data?.active_users,
      pctChange: flaggedPage.ga4Data?.traffic_change_pct,
      possibleCause: result.investigation_summary,
    });
  }

  if (result.finding_type === 'ranking_loss') {
    await emitSignal('page_ranking_loss', {
      pageUrl,
      positionChange: flaggedPage.searchData?.position_change,
      investigation: result.investigation_summary,
    });
  }

  if (result.finding_type === 'speed_degradation') {
    await emitSignal('page_speed_alert', {
      pageUrl,
      score: flaggedPage.speedData?.performance_score,
      lcp: flaggedPage.speedData?.lcp_ms,
      cls: flaggedPage.speedData?.cls,
      strategy: flaggedPage.speedData?.strategy,
    });
  }

  // Critical health score alert
  if (healthScore < 30) {
    await emitSignal('page_health_critical', {
      pageUrl,
      healthScore,
      breakdown: flaggedPage.page.health_score_breakdown,
      pageType: flaggedPage.page.page_type,
    });
  }
}
