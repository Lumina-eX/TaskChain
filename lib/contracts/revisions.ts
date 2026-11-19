import { sql } from '@/lib/db'

export interface MilestoneSnapshot {
  id: string
  title: string
  description: string | null
  amount: string
  currency: string
  due_date: string | null
  status: string
  sort_order: number
}

export interface ContractSnapshot {
  contract: {
    total_amount: string
    currency: string
    terms: string | null
  }
  milestones: MilestoneSnapshot[]
}

export type ChangeField = 'budget' | 'deadline' | 'scope' | 'status' | 'currency'

export interface FieldChange {
  field: ChangeField
  from: string | null
  to: string | null
}

export interface MilestoneChange {
  id: string
  title: string
  kind: 'added' | 'removed' | 'changed'
  changes: FieldChange[]
}

export interface RevisionDiff {
  contract: FieldChange[]
  milestones: MilestoneChange[]
}

export interface ContractRevision {
  id: string
  revision_number: number
  change_type: 'baseline' | 'update'
  created_at: string
  author: {
    display_name: string | null
    username: string | null
    wallet_address: string | null
  } | null
  snapshot: ContractSnapshot
  /** Null for the first (baseline) revision, which has nothing before it. */
  changes: RevisionDiff | null
}

function toIso(value: unknown): string | null {
  if (!value) return null
  const date = new Date(value as string)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

function sameAmount(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return Number(a) === Number(b)
}

function sameText(a: string | null, b: string | null): boolean {
  return (a ?? '') === (b ?? '')
}

export function diffSnapshots(
  previous: ContractSnapshot,
  current: ContractSnapshot,
): RevisionDiff {
  const contract: FieldChange[] = []

  if (!sameAmount(previous.contract.total_amount, current.contract.total_amount)) {
    contract.push({
      field: 'budget',
      from: previous.contract.total_amount,
      to: current.contract.total_amount,
    })
  }
  if (!sameText(previous.contract.currency, current.contract.currency)) {
    contract.push({ field: 'currency', from: previous.contract.currency, to: current.contract.currency })
  }
  if (!sameText(previous.contract.terms, current.contract.terms)) {
    contract.push({ field: 'scope', from: previous.contract.terms, to: current.contract.terms })
  }

  const before = new Map(previous.milestones.map((m) => [m.id, m]))
  const after = new Map(current.milestones.map((m) => [m.id, m]))
  const milestones: MilestoneChange[] = []

  for (const [id, next] of after) {
    const prev = before.get(id)
    if (!prev) {
      milestones.push({ id, title: next.title, kind: 'added', changes: [] })
      continue
    }

    const changes: FieldChange[] = []
    if (!sameAmount(prev.amount, next.amount)) {
      changes.push({ field: 'budget', from: prev.amount, to: next.amount })
    }
    if ((toIso(prev.due_date) ?? '') !== (toIso(next.due_date) ?? '')) {
      changes.push({ field: 'deadline', from: toIso(prev.due_date), to: toIso(next.due_date) })
    }
    if (!sameText(prev.title, next.title)) {
      changes.push({ field: 'scope', from: prev.title, to: next.title })
    }
    if (!sameText(prev.description, next.description)) {
      changes.push({ field: 'scope', from: prev.description, to: next.description })
    }
    if (prev.status !== next.status) {
      changes.push({ field: 'status', from: prev.status, to: next.status })
    }

    if (changes.length > 0) {
      milestones.push({ id, title: next.title, kind: 'changed', changes })
    }
  }

  for (const [id, prev] of before) {
    if (!after.has(id)) {
      milestones.push({ id, title: prev.title, kind: 'removed', changes: [] })
    }
  }

  return { contract, milestones }
}

async function loadSnapshot(contractId: string): Promise<ContractSnapshot | null> {
  const [contract] = (await sql`
    SELECT total_amount, currency, terms
    FROM contracts
    WHERE id = ${contractId}
    LIMIT 1
  `) as Array<{ total_amount: string; currency: string; terms: string | null }>
  if (!contract) return null

  const milestones = (await sql`
    SELECT id, title, description, amount, currency, due_date, status, sort_order
    FROM milestones
    WHERE contract_id = ${contractId}
    ORDER BY sort_order ASC, due_date ASC
  `) as Array<{
    id: string
    title: string
    description: string | null
    amount: string
    currency: string
    due_date: string | Date | null
    status: string
    sort_order: number
  }>

  return {
    contract: {
      total_amount: contract.total_amount,
      currency: contract.currency,
      terms: contract.terms,
    },
    milestones: milestones.map((m) => ({
      id: String(m.id),
      title: m.title,
      description: m.description,
      amount: String(m.amount),
      currency: m.currency,
      due_date: toIso(m.due_date),
      status: m.status,
      sort_order: m.sort_order,
    })),
  }
}

/**
 * Guarantees a first revision exists so the update that follows has a
 * previous state to diff against. No-op once any revision is recorded.
 */
export async function ensureBaselineRevision(contractId: string): Promise<void> {
  const [existing] = (await sql`
    SELECT id FROM contract_revisions WHERE contract_id = ${contractId} LIMIT 1
  `) as Array<{ id: string }>
  if (existing) return

  const snapshot = await loadSnapshot(contractId)
  if (!snapshot) return

  await sql`
    INSERT INTO contract_revisions (contract_id, snapshot, change_type)
    VALUES (${contractId}, ${JSON.stringify(snapshot)}::jsonb, 'baseline')
  `
}

export async function recordContractRevision(
  contractId: string,
  author: { id: string; walletAddress: string },
): Promise<void> {
  const snapshot = await loadSnapshot(contractId)
  if (!snapshot) return

  await sql`
    INSERT INTO contract_revisions (contract_id, snapshot, change_type, author_id, author_wallet)
    VALUES (${contractId}, ${JSON.stringify(snapshot)}::jsonb, 'update', ${author.id}, ${author.walletAddress})
  `
}

export async function listContractRevisions(contractId: string): Promise<ContractRevision[]> {
  const rows = (await sql`
    SELECT r.id, r.snapshot, r.change_type, r.author_wallet, r.created_at,
           u.display_name, u.username, u.wallet_address
    FROM contract_revisions r
    LEFT JOIN users u ON u.id = r.author_id
    WHERE r.contract_id = ${contractId}
    ORDER BY r.created_at ASC, r.id ASC
  `) as Array<{
    id: string
    snapshot: ContractSnapshot
    change_type: 'baseline' | 'update'
    author_wallet: string | null
    created_at: string | Date
    display_name: string | null
    username: string | null
    wallet_address: string | null
  }>

  return rows.map((row, index) => {
    const previous = index > 0 ? rows[index - 1].snapshot : null
    return {
      id: String(row.id),
      revision_number: index + 1,
      change_type: row.change_type,
      created_at: toIso(row.created_at) ?? String(row.created_at),
      author: row.display_name || row.username || row.wallet_address || row.author_wallet
        ? {
            display_name: row.display_name ?? null,
            username: row.username ?? null,
            wallet_address: row.wallet_address ?? row.author_wallet ?? null,
          }
        : null,
      snapshot: row.snapshot,
      changes: previous ? diffSnapshots(previous, row.snapshot) : null,
    }
  })
}
