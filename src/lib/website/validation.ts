import { supabase } from '../supabase';
import type { Guardrail } from './types';

interface ValidationResult {
  passes: boolean;
  violations: Array<{ rule: string; message: string; action: string }>;
  warnings: Array<{ rule: string; message: string }>;
}

/**
 * Load active guardrails from Supabase.
 */
export async function loadGuardrails(): Promise<Guardrail[]> {
  const { data } = await supabase
    .from('website_agent_guardrails')
    .select('*')
    .eq('is_active', true);

  return (data as Guardrail[]) || [];
}

/**
 * Validate a recommendation against active guardrails.
 */
export async function validateRecommendation(recommendation: {
  action_type: string;
  action_summary: string;
  severity: string;
  confidence: number;
}): Promise<ValidationResult> {
  const guardrails = await loadGuardrails();
  const violations: ValidationResult['violations'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // Check minimum confidence for high-risk actions
  if (recommendation.confidence < 0.3) {
    violations.push({
      rule: 'min_confidence',
      message: `Confidence ${recommendation.confidence} is below minimum threshold of 0.3`,
      action: 'block',
    });
  }

  // Check severity matches action type
  if (recommendation.severity === 'low' && recommendation.action_type === 'fix_content') {
    warnings.push({
      rule: 'severity_action_mismatch',
      message: 'Low severity finding with fix_content action — consider if this warrants a recommendation',
    });
  }

  // Check guardrail-specific rules
  for (const guardrail of guardrails) {
    if (guardrail.rule_category === 'anti_drift' && guardrail.rule_type === 'rule') {
      // Anti-drift rules are checked at the scan level, not per-recommendation
      continue;
    }

    if (guardrail.config_json) {
      const config = guardrail.config_json as Record<string, unknown>;

      // Check if action type is blocked
      if (config.blocked_action_types && Array.isArray(config.blocked_action_types)) {
        if ((config.blocked_action_types as string[]).includes(recommendation.action_type)) {
          violations.push({
            rule: guardrail.rule_name,
            message: `Action type "${recommendation.action_type}" is blocked by guardrail: ${guardrail.description || guardrail.rule_name}`,
            action: guardrail.violation_action,
          });
        }
      }

      // Check minimum confidence per guardrail
      if (config.min_confidence && recommendation.confidence < (config.min_confidence as number)) {
        const entry = {
          rule: guardrail.rule_name,
          message: `Confidence ${recommendation.confidence} below guardrail threshold ${config.min_confidence}`,
        };
        if (guardrail.violation_action === 'block') {
          violations.push({ ...entry, action: 'block' });
        } else {
          warnings.push(entry);
        }
      }
    }
  }

  const hasBlockingViolation = violations.some(v => v.action === 'block');

  return {
    passes: !hasBlockingViolation,
    violations,
    warnings,
  };
}
