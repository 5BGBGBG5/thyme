import { supabase } from '../supabase';
import { getKeyEvents } from './ga4-client';
import { getAllFormsWithCounts } from './hubspot-cms-client';
import type { TrackingHealth } from './types';

interface ConversionAuditReport {
  ga4KeyEvents: Array<{ name: string; countingMethod: string }>;
  ga4KeyEventsCount: number;
  hubspotForms: Array<{ id: string; name: string; submission_count: number }>;
  hubspotFormsCount: number;
  coverageGaps: Array<{ formId: string; formName: string; reason: string }>;
  trackingHealth: TrackingHealth;
  recommendations: Array<{ priority: string; title: string; description: string }>;
}

/**
 * Run a comprehensive conversion audit.
 * Cross-references GA4 key events with HubSpot forms to identify tracking gaps.
 */
export async function runConversionAudit(): Promise<ConversionAuditReport> {
  // Pull data from both sources
  const [ga4Events, hubspotForms] = await Promise.all([
    getKeyEvents(),
    getAllFormsWithCounts(),
  ]);

  // Identify coverage gaps
  const coverageGaps: ConversionAuditReport['coverageGaps'] = [];
  const eventNames = new Set(ga4Events.map(e => e.name.toLowerCase()));

  for (const form of hubspotForms) {
    // Check if this form has a corresponding GA4 event
    const formNameNormalized = form.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const hasEvent = eventNames.has(formNameNormalized) ||
      eventNames.has(`form_submit_${formNameNormalized}`) ||
      eventNames.has('form_submit') ||
      eventNames.has('generate_lead');

    if (!hasEvent) {
      coverageGaps.push({
        formId: form.id,
        formName: form.name,
        reason: 'No corresponding GA4 key event found',
      });
    }
  }

  // Determine tracking health
  const trackingHealth = determineTrackingHealth(
    ga4Events.length,
    hubspotForms.length,
    coverageGaps.length
  );

  // Generate recommendations
  const recommendations = generateRecommendations(
    ga4Events.length,
    hubspotForms.length,
    coverageGaps.length,
    hubspotForms
  );

  const report: ConversionAuditReport = {
    ga4KeyEvents: ga4Events,
    ga4KeyEventsCount: ga4Events.length,
    hubspotForms: hubspotForms.map(f => ({
      id: f.id,
      name: f.name,
      submission_count: f.submission_count,
    })),
    hubspotFormsCount: hubspotForms.length,
    coverageGaps,
    trackingHealth,
    recommendations,
  };

  // Store audit results
  const today = new Date().toISOString().split('T')[0];
  await supabase.from('website_agent_conversion_audit').insert({
    audit_date: today,
    ga4_key_events: ga4Events,
    ga4_key_events_count: ga4Events.length,
    hubspot_forms: hubspotForms,
    hubspot_forms_count: hubspotForms.length,
    coverage_gaps: coverageGaps,
    tracking_health: trackingHealth,
    recommendations,
  });

  return report;
}

function determineTrackingHealth(
  ga4EventCount: number,
  hubspotFormCount: number,
  gapCount: number
): TrackingHealth {
  if (ga4EventCount === 0) return 'not_configured';
  if (gapCount === 0) return 'healthy';
  if (gapCount < hubspotFormCount) return 'degraded';
  return 'broken';
}

function generateRecommendations(
  ga4EventCount: number,
  hubspotFormCount: number,
  gapCount: number,
  forms: Array<{ name: string; submission_count: number }>
): ConversionAuditReport['recommendations'] {
  const recs: ConversionAuditReport['recommendations'] = [];

  if (ga4EventCount === 0) {
    const totalSubmissions = forms.reduce((sum, f) => sum + f.submission_count, 0);
    recs.push({
      priority: 'critical',
      title: 'GA4 has zero conversion events configured',
      description: `GA4 has no key events set up. HubSpot recorded ${totalSubmissions} form submissions. You have no page-level conversion attribution. Set up form_submit as a GA4 key event and configure GTM to fire it on HubSpot form completions.`,
    });
  }

  if (gapCount > 0 && ga4EventCount > 0) {
    recs.push({
      priority: 'high',
      title: `${gapCount} HubSpot forms lack GA4 tracking`,
      description: `${gapCount} out of ${hubspotFormCount} forms have no corresponding GA4 key event. Create GA4 events for each form or use a generic form_submit event with form ID parameters.`,
    });
  }

  if (hubspotFormCount === 0) {
    recs.push({
      priority: 'medium',
      title: 'No HubSpot forms found',
      description: 'No forms detected on the site. If the site has non-HubSpot forms, consider migrating them or setting up manual conversion tracking.',
    });
  }

  return recs;
}
