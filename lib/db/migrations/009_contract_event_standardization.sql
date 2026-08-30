-- Contract event standardization for issue #191.
-- Existing short names remain valid for historical rows and old deployments.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_sync_event_type') THEN
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'escrow_created';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'escrow_funded';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'milestone_submitted';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'milestone_approved';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'milestone_confirmed';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'payment_released';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'dispute_raised';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'refund_issued';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'dispute_resolved';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'milestone_expired';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'dispute_created';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'vote_cast';
    ALTER TYPE contract_sync_event_type ADD VALUE IF NOT EXISTS 'stake_claimed';
  END IF;
END;
$$;
