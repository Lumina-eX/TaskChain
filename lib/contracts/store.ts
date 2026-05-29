import { sql } from '@/lib/db'

export interface MilestoneInput {
  title: string
  description?: string
  amount: string
  dueDate?: string
}

export interface CreateContractParams {
  jobId: number
  clientId: number
  freelancerId: number
  totalAmount: string
  currency: string
  terms?: string
  contractAddress: string
  txHash: string
  networkPassphrase: string
}

export interface ContractRow {
  id: number
  job_id: number
  client_id: number
  freelancer_id: number
  total_amount: string
  currency: string
  terms: string | null
  contract_address: string | null
  contract_tx_hash: string | null
  network_passphrase: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface JobRow {
  id: number
  client_id: number
  freelancer_id: number | null
  title: string
  status: string
  escrow_contract_id: string | null
}

export interface UserRow {
  id: number
  wallet_address: string
  user_type: string
}

export async function getJobById(jobId: number): Promise<JobRow | null> {
  const rows = (await sql`
    SELECT id, client_id, freelancer_id, title, status, escrow_contract_id
      FROM jobs
     WHERE id = ${jobId}
     LIMIT 1
  `) as JobRow[]
  return rows[0] ?? null
}

export async function getExistingContract(jobId: number): Promise<ContractRow | null> {
  const rows = (await sql`
    SELECT * FROM contracts WHERE job_id = ${jobId} LIMIT 1
  `) as ContractRow[]
  return rows[0] ?? null
}

export async function getUserById(userId: number): Promise<UserRow | null> {
  const rows = (await sql`
    SELECT id, wallet_address, user_type FROM users WHERE id = ${userId} LIMIT 1
  `) as UserRow[]
  return rows[0] ?? null
}

export async function getUserIdByWalletAddress(walletAddress: string): Promise<number | null> {
  const rows = (await sql`
    SELECT id FROM users WHERE wallet_address = ${walletAddress} LIMIT 1
  `) as { id: number }[]
  return rows[0]?.id ?? null
}

export async function createContract(params: CreateContractParams): Promise<ContractRow> {
  const rows = (await sql`
    INSERT INTO contracts (
      job_id, client_id, freelancer_id,
      total_amount, currency, terms,
      contract_address, contract_tx_hash, network_passphrase,
      status
    )
    VALUES (
      ${params.jobId},
      ${params.clientId},
      ${params.freelancerId},
      ${params.totalAmount},
      ${params.currency},
      ${params.terms ?? null},
      ${params.contractAddress},
      ${params.txHash},
      ${params.networkPassphrase},
      'pending'
    )
    RETURNING *
  `) as ContractRow[]
  return rows[0]
}

export async function createMilestones(
  jobId: number,
  contractId: number,
  milestones: MilestoneInput[]
): Promise<void> {
  for (const m of milestones) {
    await sql`
      INSERT INTO milestones (job_id, contract_id, title, description, amount, due_date, status)
      VALUES (
        ${jobId},
        ${contractId},
        ${m.title},
        ${m.description ?? null},
        ${m.amount},
        ${m.dueDate ?? null},
        'pending'
      )
    `
  }
}

export async function linkJobToContract(
  jobId: number,
  contractAddress: string
): Promise<void> {
  await sql`
    UPDATE jobs
       SET escrow_contract_id = ${contractAddress},
           escrow_status      = 'pending',
           updated_at         = CURRENT_TIMESTAMP
     WHERE id = ${jobId}
  `
}
