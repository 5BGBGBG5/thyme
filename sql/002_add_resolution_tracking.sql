-- Migration: Add auto-resolution tracking to website_agent_findings
-- Run this in Supabase SQL Editor

-- Add new columns for resolution tracking
ALTER TABLE website_agent_findings
  ADD COLUMN IF NOT EXISTS check_type TEXT,
  ADD COLUMN IF NOT EXISTS check_target TEXT,
  ADD COLUMN IF NOT EXISTS health_score_at_detection INT,
  ADD COLUMN IF NOT EXISTS health_score_at_resolution INT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_method TEXT CHECK (resolution_method IN ('auto', 'manual'));

-- Expand the status enum to include 'resolved'
ALTER TABLE website_agent_findings
  DROP CONSTRAINT IF EXISTS website_agent_findings_status_check;

ALTER TABLE website_agent_findings
  ADD CONSTRAINT website_agent_findings_status_check
  CHECK (status IN ('new', 'recommendation_drafted', 'approved', 'completed', 'expired', 'skipped', 'resolved'));

-- Index for finding open findings to check during scans
CREATE INDEX IF NOT EXISTS idx_website_agent_findings_open
  ON website_agent_findings(status)
  WHERE status IN ('new', 'recommendation_drafted', 'approved');
