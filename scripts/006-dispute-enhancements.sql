-- Enhance existing disputes table with evidence and comments support
-- Migration 006: dispute-enhancements

-- Add missing columns to existing disputes table
ALTER TABLE disputes 
ADD COLUMN IF NOT EXISTS evidence_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS contract_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS contract_state VARCHAR(255);
-- Create dispute evidence table
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50),
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dispute comments table
CREATE TABLE IF NOT EXISTS dispute_comments (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  is_admin_comment BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create dispute resolution log
CREATE TABLE IF NOT EXISTS dispute_resolution_log (
  id SERIAL PRIMARY KEY,
  dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  contract_id VARCHAR(255),
  previous_state VARCHAR(20),
  new_state VARCHAR(20) NOT NULL,
  resolution TEXT NOT NULL,
  resolved_by INTEGER NOT NULL REFERENCES users(id),
  resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_comments_dispute ON dispute_comments(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_resolution_log_dispute ON dispute_resolution_log(dispute_id);