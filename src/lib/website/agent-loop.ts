import Anthropic from '@anthropic-ai/sdk';
import { AGENT_TOOLS, executeToolCall } from './agent-tools';
import type { FlaggedPage, AgentLoopResult, AgentToolCall } from './types';

const anthropic = new Anthropic();

const MAX_TOOL_CALLS = 6;
const MAX_DURATION_MS = 40_000;

const SYSTEM_PROMPT = `You are Thyme, a website health and performance agent for Inecta, a food & beverage ERP company. You are investigating a flagged page on inecta.com to understand why its health score is low and what should be done about it.

## Your Role
You think like a marketing operations analyst. You don't just flag that something is wrong — you investigate WHY, connect it to business impact, and recommend specific fixes.

## Investigation Process
1. Start by understanding the page's current state. Check its analytics to see traffic trends.
2. Check Search Console rankings — are keywords declining? Has the page lost visibility?
3. If speed is a concern, run a PageSpeed test to get specific improvement opportunities.
4. Check HubSpot page detail — when was it last updated? Does it have forms? How many submissions?
5. Check the signal bus for cross-agent intelligence — is Saffron bidding on keywords related to this page? Is Cayenne seeing Reddit discussions about this topic?
6. Use evaluate_recommendation to self-check before submitting.

## Decision Framework
- Connect findings to business impact: "This page gets X visits/month and has your demo request form. A Y% traffic drop means ~Z fewer potential leads."
- If Saffron's CPC is climbing for a keyword and the organic page is declining, recommend "fix the page to reduce paid dependency."
- Prioritize by impact: a declining homepage matters more than a declining old blog post.
- When investigating meta/title issues, check if the meta description matches what the page actually ranks for.
- Don't recommend updating a page if no one searches for its topic anymore — check signals first.

## Page Type Priority
- landing_page, pillar_page: HIGH priority — these are conversion-focused
- site_page: MEDIUM priority — important for navigation and trust
- blog_post: LOWER priority — unless it drives significant traffic or rankings

## Budget
You have a maximum of ${MAX_TOOL_CALLS} tool calls. Use them wisely — focus on the most likely cause of the low health score. You MUST call submit_finding or skip_finding before your budget runs out.`;

/**
 * Run the agent loop for a single flagged page.
 * Returns the agent's investigation result and optional recommendation.
 */
export async function runAgentLoop(flaggedPage: FlaggedPage): Promise<AgentLoopResult> {
  const startTime = Date.now();
  const toolCalls: AgentToolCall[] = [];
  let iterations = 0;

  // Build the initial user message with page data
  const userMessage = buildInitialMessage(flaggedPage);

  // Conversation history for the agent
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  while (true) {
    iterations++;

    // Check budget: time
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_DURATION_MS) {
      return forceTermination(flaggedPage, toolCalls, iterations, 'Time budget exceeded');
    }

    // Check budget: tool calls
    if (toolCalls.length >= MAX_TOOL_CALLS) {
      return forceTermination(flaggedPage, toolCalls, iterations, 'Tool call budget exceeded');
    }

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages,
    });

    // Process the response
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ContentBlock & { type: 'tool_use' } => b.type === 'tool_use'
    );

    // If no tool calls, force skip
    if (toolUseBlocks.length === 0) {
      return forceTermination(flaggedPage, toolCalls, iterations, 'Agent ended without terminal tool call');
    }

    // Execute tool calls and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let terminalResult: AgentLoopResult | null = null;

    for (const toolBlock of toolUseBlocks) {
      // Check budget before each call
      if (toolCalls.length >= MAX_TOOL_CALLS) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: 'Budget exceeded — you must call submit_finding or skip_finding now.',
        });
        continue;
      }

      const input = toolBlock.input as Record<string, unknown>;

      // Handle terminal tools
      if (toolBlock.name === 'submit_finding') {
        terminalResult = buildSubmitResult(input, toolCalls, iterations);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify({ acknowledged: true }),
        });
        continue;
      }

      if (toolBlock.name === 'skip_finding') {
        terminalResult = buildSkipResult(input, toolCalls, iterations);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify({ acknowledged: true }),
        });
        continue;
      }

      // Execute non-terminal tool
      const { result, call } = await executeToolCall(toolBlock.name, input, flaggedPage);
      toolCalls.push(call);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: JSON.stringify(result),
      });
    }

    // If a terminal tool was called, we're done
    if (terminalResult) {
      return terminalResult;
    }

    // Add assistant response + tool results to conversation
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }
}

// ============================================================================
// Helpers
// ============================================================================

function buildInitialMessage(flaggedPage: FlaggedPage): string {
  const { page, ga4Data, searchData, speedData, flagReasons } = flaggedPage;
  const breakdown = page.health_score_breakdown;

  return `## Flagged Page to Investigate

**URL:** ${page.url}
**Page Type:** ${page.page_type || 'unknown'}
**Title:** ${page.title || '(no title)'}
**Health Score:** ${page.health_score || 'N/A'}/100

**Health Score Breakdown:**
${breakdown ? `- Traffic Trend: ${breakdown.traffic_trend}/20
- SEO Ranking: ${breakdown.seo_ranking}/20
- Page Speed: ${breakdown.page_speed}/20
- Content Freshness: ${breakdown.content_freshness}/15
- Conversion Health: ${breakdown.conversion_health}/15
- Technical Health: ${breakdown.technical_health}/10` : '(no breakdown available)'}

**Flag Reasons:** ${flagReasons.join(', ') || 'Below threshold'}

**Last Updated:** ${page.last_updated_at || 'Unknown'}
**Has Form:** ${page.has_form ? 'Yes' : 'No'}
**Meta Issues:** ${page.meta_issues?.join(', ') || 'None'}
**Broken Links:** ${page.has_broken_links ? `Yes (${page.broken_link_count})` : 'No'}

${ga4Data ? `**Recent Traffic:** ${ga4Data.active_users} users, ${ga4Data.sessions} sessions (change: ${ga4Data.traffic_change_pct !== null ? `${ga4Data.traffic_change_pct > 0 ? '+' : ''}${ga4Data.traffic_change_pct.toFixed(1)}%` : 'N/A'})` : '**Recent Traffic:** No GA4 data available'}

${searchData ? `**Search Console:** ${searchData.total_clicks} clicks, ${searchData.total_impressions} impressions, avg position ${searchData.avg_position?.toFixed(1) || 'N/A'}` : '**Search Console:** No data available'}

${speedData ? `**PageSpeed (${speedData.strategy}):** Performance ${speedData.performance_score}/100, LCP ${speedData.lcp_ms ? `${(speedData.lcp_ms / 1000).toFixed(1)}s` : 'N/A'}` : '**PageSpeed:** No data available'}

Investigate this page and decide whether to submit a finding with recommendation (using submit_finding) or skip it (using skip_finding). Use your tools to gather the context you need.`;
}

function buildSubmitResult(
  input: Record<string, unknown>,
  toolCalls: AgentToolCall[],
  iterations: number
): AgentLoopResult {
  return {
    action: 'submit',
    finding_type: input.finding_type as AgentLoopResult['finding_type'],
    severity: input.severity as AgentLoopResult['severity'],
    title: input.title as string,
    description: input.description as string,
    business_impact: input.business_impact as string | undefined,
    action_type: input.action_type as AgentLoopResult['action_type'],
    action_summary: input.action_summary as string,
    confidence: input.confidence as number | undefined,
    risk_level: input.risk_level as AgentLoopResult['risk_level'],
    investigation_summary: input.investigation_summary as string,
    iterations,
    tools_used: [...new Set(toolCalls.map(c => c.tool_name))],
    tool_calls: toolCalls,
  };
}

function buildSkipResult(
  input: Record<string, unknown>,
  toolCalls: AgentToolCall[],
  iterations: number
): AgentLoopResult {
  return {
    action: 'skip',
    skip_reason: input.reason as string,
    investigation_summary: input.investigation_summary as string,
    iterations,
    tools_used: [...new Set(toolCalls.map(c => c.tool_name))],
    tool_calls: toolCalls,
  };
}

function forceTermination(
  flaggedPage: FlaggedPage,
  toolCalls: AgentToolCall[],
  iterations: number,
  reason: string
): AgentLoopResult {
  return {
    action: 'skip',
    skip_reason: `Forced termination: ${reason}`,
    investigation_summary: `Agent was forced to terminate after ${iterations} iterations and ${toolCalls.length} tool calls. Reason: ${reason}. Page: "${flaggedPage.page.title}" (${flaggedPage.page.url})`,
    iterations,
    tools_used: [...new Set(toolCalls.map(c => c.tool_name))],
    tool_calls: toolCalls,
  };
}
