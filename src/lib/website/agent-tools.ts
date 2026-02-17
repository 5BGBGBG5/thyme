import type Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase';
import { getDetailedPageAnalytics } from './ga4-client';
import { getDetailedPageSearchData } from './search-console-client';
import { getPageSpeedScore } from './pagespeed-client';
import { getPageDetail } from './hubspot-cms-client';
import { getFormSubmissionCount } from './hubspot-cms-client';
import type { FlaggedPage, AgentToolCall } from './types';

// ============================================================================
// Tool Definitions — Claude API tool schemas
// ============================================================================

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_page_analytics',
    description: 'Pull detailed GA4 analytics for a specific page — traffic trends, top traffic sources, user behavior metrics, comparison to previous period.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page_path: {
          type: 'string',
          description: 'The page path to analyze (e.g. /solutions/food-erp)',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back (default 7, max 30)',
        },
      },
      required: ['page_path'],
    },
  },
  {
    name: 'get_page_rankings',
    description: 'Pull Search Console data for a specific page — what queries it ranks for, position changes, impressions/clicks trend over time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page_url: {
          type: 'string',
          description: 'The full page URL to check rankings for',
        },
        days: {
          type: 'number',
          description: 'Number of days to look back (default 7, max 30)',
        },
      },
      required: ['page_url'],
    },
  },
  {
    name: 'get_page_speed_detail',
    description: 'Run PageSpeed Insights for a specific URL — full Core Web Vitals breakdown and specific improvement opportunities.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to test',
        },
        strategy: {
          type: 'string',
          enum: ['mobile', 'desktop'],
          description: 'Test strategy (default mobile — what Google ranks on)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_hubspot_page_detail',
    description: 'Pull HubSpot CMS data for a page — metadata, forms present, last updated date, CTA info, form submission counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page_url: {
          type: 'string',
          description: 'The page URL to look up in the page inventory',
        },
      },
      required: ['page_url'],
    },
  },
  {
    name: 'check_keyword_page_gap',
    description: 'Check if a keyword (from Saffron bidding data or trending terms) has a corresponding organic page. Returns ranking info if page exists.',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: 'The keyword to check for organic page coverage',
        },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'check_signal_bus',
    description: 'Query shared_agent_signals for recent signals from Saffron and Cayenne related to this topic/keyword. Cross-agent intelligence.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: 'Topic or keyword to search signals for',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'evaluate_recommendation',
    description: 'Self-check a draft recommendation against guardrails. If it fails, revise and re-evaluate before submitting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action_type: {
          type: 'string',
          enum: ['fix_content', 'fix_technical', 'fix_tracking', 'create_page', 'update_meta', 'improve_speed', 'fix_broken_link', 'investigate_further'],
          description: 'The type of action being recommended',
        },
        action_summary: {
          type: 'string',
          description: 'One-line summary of the recommended action',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Assessed severity of the finding',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0-1 in this recommendation',
        },
      },
      required: ['action_type', 'action_summary', 'severity', 'confidence'],
    },
  },
  {
    name: 'submit_finding',
    description: 'TERMINAL. Submit the investigated finding with a recommendation to the decision queue. The agent loop ends after this call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        finding_type: {
          type: 'string',
          enum: ['traffic_decline', 'ranking_loss', 'speed_degradation', 'content_stale', 'conversion_broken', 'keyword_gap', 'crawl_error', 'mobile_issue', 'content_missing', 'broken_link', 'meta_issue'],
          description: 'Classification of the finding',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Severity assessment',
        },
        title: {
          type: 'string',
          description: 'Short descriptive title for the finding',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what was found and why it matters',
        },
        business_impact: {
          type: 'string',
          description: 'How this issue impacts the business (traffic, leads, revenue)',
        },
        action_type: {
          type: 'string',
          enum: ['fix_content', 'fix_technical', 'fix_tracking', 'create_page', 'update_meta', 'improve_speed', 'fix_broken_link', 'investigate_further'],
          description: 'Recommended action type',
        },
        action_summary: {
          type: 'string',
          description: 'What should be done to fix this',
        },
        confidence: {
          type: 'number',
          description: 'Confidence in this recommendation (0-1)',
        },
        risk_level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Risk level of the recommended action',
        },
        investigation_summary: {
          type: 'string',
          description: 'Summary of what you investigated and what you learned',
        },
      },
      required: ['finding_type', 'severity', 'title', 'description', 'action_type', 'action_summary', 'investigation_summary'],
    },
  },
  {
    name: 'skip_finding',
    description: 'TERMINAL. Decide not to submit a finding for this page, with a reason. The agent loop ends after this call.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: {
          type: 'string',
          description: 'Why this page does not warrant a finding',
        },
        investigation_summary: {
          type: 'string',
          description: 'Summary of what you investigated before deciding to skip',
        },
      },
      required: ['reason', 'investigation_summary'],
    },
  },
];

// ============================================================================
// Tool Execution Handlers
// ============================================================================

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  context: FlaggedPage
): Promise<{ result: unknown; call: AgentToolCall }> {
  const startTime = Date.now();
  let result: unknown;

  switch (toolName) {
    case 'get_page_analytics': {
      const pagePath = (input.page_path as string) || new URL(context.page.url).pathname;
      const days = Math.min((input.days as number) || 7, 30);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      try {
        const analytics = await getDetailedPageAnalytics(pagePath, startDate, endDate);
        result = analytics;
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Failed to fetch analytics' };
      }
      break;
    }

    case 'get_page_rankings': {
      const pageUrl = (input.page_url as string) || context.page.url;
      const days = Math.min((input.days as number) || 7, 30);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      try {
        const searchData = await getDetailedPageSearchData(pageUrl, startDate, endDate);
        result = searchData;
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Failed to fetch rankings' };
      }
      break;
    }

    case 'get_page_speed_detail': {
      const url = (input.url as string) || context.page.url;
      const strategy = (input.strategy as 'mobile' | 'desktop') || 'mobile';

      try {
        const speedResult = await getPageSpeedScore(url, strategy);
        result = speedResult;
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Failed to run PageSpeed test' };
      }
      break;
    }

    case 'get_hubspot_page_detail': {
      const pageUrl = (input.page_url as string) || context.page.url;

      try {
        // Look up page in our inventory
        const { data: page } = await supabase
          .from('website_agent_pages')
          .select('*')
          .eq('url', pageUrl)
          .single();

        if (!page) {
          result = { error: 'Page not found in inventory' };
          break;
        }

        // If we have a HubSpot page ID, get fresh details
        let hubspotDetail = null;
        if (page.hubspot_page_id) {
          try {
            hubspotDetail = await getPageDetail(page.hubspot_page_id, page.page_type);
          } catch {
            // HubSpot lookup failed — use cached data
          }
        }

        // Get form submission counts if forms present
        let formSubmissions: Array<{ formId: string; count: number }> = [];
        if (page.form_ids && page.form_ids.length > 0) {
          formSubmissions = await Promise.all(
            page.form_ids.map(async (formId: string) => ({
              formId,
              count: await getFormSubmissionCount(formId),
            }))
          );
        }

        result = {
          url: page.url,
          title: hubspotDetail?.title || page.title,
          meta_description: hubspotDetail?.meta_description || page.meta_description,
          page_type: page.page_type,
          published_at: page.published_at,
          last_updated_at: hubspotDetail?.updated_at || page.last_updated_at,
          content_age_days: page.content_age_days,
          has_form: page.has_form,
          form_ids: page.form_ids,
          form_submissions: formSubmissions,
          has_cta: page.has_cta,
          health_score: page.health_score,
          meta_issues: page.meta_issues,
          has_broken_links: page.has_broken_links,
          broken_link_count: page.broken_link_count,
        };
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Failed to fetch page detail' };
      }
      break;
    }

    case 'check_keyword_page_gap': {
      const keyword = input.keyword as string;
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      try {
        const { getSearchAnalytics } = await import('./search-console-client');
        const searchData = await getSearchAnalytics({
          startDate,
          endDate,
          dimensions: ['query', 'page'],
          dimensionFilterGroups: [
            { filters: [{ dimension: 'query', operator: 'contains', expression: keyword }] },
          ],
          rowLimit: 10,
        });

        const rows = searchData.rows || [];
        result = {
          keyword,
          hasOrganicCoverage: rows.length > 0,
          pages: rows.map(r => ({
            page: r.keys[1],
            query: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            position: r.position,
          })),
        };
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Failed to check keyword coverage' };
      }
      break;
    }

    case 'check_signal_bus': {
      const topic = input.topic as string;
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from('shared_agent_signals')
        .select('source_agent, event_type, payload, created_at')
        .gte('created_at', oneWeekAgo)
        .order('created_at', { ascending: false })
        .limit(10);

      // Filter signals relevant to the topic
      const relevant = (data || []).filter(s => {
        const payloadStr = JSON.stringify(s.payload).toLowerCase();
        return payloadStr.includes(topic.toLowerCase());
      });

      result = { signals: relevant.slice(0, 5) };
      break;
    }

    case 'evaluate_recommendation': {
      const { validateRecommendation } = await import('./validation');
      const validation = await validateRecommendation({
        action_type: input.action_type as string,
        action_summary: input.action_summary as string,
        severity: input.severity as string,
        confidence: input.confidence as number,
      });
      result = validation;
      break;
    }

    case 'submit_finding':
    case 'skip_finding': {
      result = { acknowledged: true, action: toolName };
      break;
    }

    default:
      result = { error: `Unknown tool: ${toolName}` };
  }

  return {
    result,
    call: {
      tool_name: toolName,
      input,
      output: result,
      duration_ms: Date.now() - startTime,
    },
  };
}
