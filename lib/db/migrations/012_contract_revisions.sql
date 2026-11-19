-- Migration: Contract revision history
-- Append-only snapshots of a contract and its milestones. Each row is a
-- point-in-time record; diffs are computed at read time between consecutive
-- snapshots so the history stays cheap to write and impossible to rewrite.

CREATE TABLE IF NOT EXISTS contract_revisions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id    UUID        NOT NULL REFERENCES contracts (id) ON DELETE CASCADE,
  snapshot       JSONB       NOT NULL,
  change_type    VARCHAR(20) NOT NULL DEFAULT 'update'
                             CHECK (change_type IN ('baseline', 'update')),
  author_id      UUID        REFERENCES users (id) ON DELETE SET NULL,
  author_wallet  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_revisions_contract
  ON contract_revisions (contract_id, created_at);

-- Read-only history: existing rows may never be changed or removed.
CREATE OR REPLACE FUNCTION prevent_contract_revision_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contract_revisions is append-only; % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contract_revisions_immutable ON contract_revisions;
CREATE TRIGGER contract_revisions_immutable
  BEFORE UPDATE OR DELETE ON contract_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_contract_revision_mutation();

-- Baseline snapshot for contracts that already exist.
INSERT INTO contract_revisions (contract_id, snapshot, change_type, created_at)
SELECT
  c.id,
  jsonb_build_object(
    'contract', jsonb_build_object(
      'total_amount', c.total_amount,
      'currency', c.currency,
      'terms', c.terms
    ),
    'milestones', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'title', m.title,
          'description', m.description,
          'amount', m.amount,
          'currency', m.currency,
          'due_date', m.due_date,
          'status', m.status,
          'sort_order', m.sort_order
        )
        ORDER BY m.sort_order, m.due_date
      )
      FROM milestones m
      WHERE m.contract_id = c.id
    ), '[]'::jsonb)
  ),
  'baseline',
  c.created_at
FROM contracts c
WHERE NOT EXISTS (
  SELECT 1 FROM contract_revisions r WHERE r.contract_id = c.id
);

COMMENT ON TABLE contract_revisions IS
  'Append-only contract snapshots; used to render revision and change history';
