-- Persist the on-chain deadline lifecycle and its audit events.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'milestone_status') THEN
    ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'disputed';
    ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'refunded';
    ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'auto_expired';
    ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'expired';
    ALTER TYPE milestone_status ADD VALUE IF NOT EXISTS 'extended';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_sync_event_type') THEN
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'deadline_set';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'deadline_expired';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'deadline_extended';
  END IF;
END;
$$;
