import { scValToNative, StrKey, xdr } from '@stellar/stellar-sdk'
import { normalizeSorobanEvent } from '@/lib/contract-sync/types'
import type { ParsedContractEvent, TxError } from './types'

/** Stable escrow contract error codes. See docs/soroban-contract-events.md. */
export const ESCROW_CONTRACT_ERRORS: Record<number, string> = {
  1: 'ERR_ALREADY_INITIALIZED',
  2: 'ERR_NOT_INITIALIZED',
  3: 'ERR_ALREADY_FUNDED',
  4: 'ERR_NOT_FUNDED',
  5: 'ERR_MILESTONE_NOT_FOUND',
  6: 'ERR_INVALID_STATE',
  7: 'ERR_UNAUTHORIZED',
  8: 'ERR_INVALID_AMOUNT',
  9: 'ERR_INSUFFICIENT_APPROVALS',
  10: 'ERR_ALREADY_APPROVED',
  11: 'ERR_DEADLINE_EXCEEDED',
  12: 'ERR_ALREADY_EXPIRED',
}

export function parseContractError(message: string): TxError {
  const match = message.match(/Error\(Contract,\s*#(\d+)\)/)
  if (!match) return { message }
  const contractCode = Number(match[1])
  const code = ESCROW_CONTRACT_ERRORS[contractCode]
  return {
    message: code ?? message,
    code,
    contractCode,
  }
}

export function parseContractEvent(event: xdr.ContractEvent): ParsedContractEvent | null {
  const body = event.body().value() as {
    topics(): xdr.ScVal[]
    data(): xdr.ScVal
  }
  const topics = body.topics().map((topic) => scValToNative(topic))
  const name = typeof topics[0] === 'string' ? normalizeSorobanEvent(topics[0]) : null
  if (!name) return null

  const data = scValToNative(body.data())
  const milestoneId = readMilestoneId(topics)
  const amount = readAmount(data)

  return {
    name,
    contractId: readContractId(event),
    topics,
    data,
    ...(milestoneId === undefined ? {} : { milestoneId }),
    ...(amount === undefined ? {} : { amount }),
  }
}

export function parseDiagnosticEvents(events: xdr.DiagnosticEvent[] | undefined): ParsedContractEvent[] {
  if (!events?.length) return []
  return events.flatMap((diagnostic) => {
    const parsed = parseContractEvent(diagnostic.event())
    return parsed ? [parsed] : []
  })
}

export function parseContractEvents(events: xdr.ContractEvent[]): ParsedContractEvent[] {
  return events.flatMap((event) => {
    const parsed = parseContractEvent(event)
    return parsed ? [parsed] : []
  })
}

function readContractId(event: xdr.ContractEvent): string | undefined {
  const raw = event.contractId()
  if (!raw) return undefined
  try {
    return StrKey.encodeContract(raw as unknown as Buffer)
  } catch {
    return undefined
  }
}

function readMilestoneId(topics: unknown[]): number | undefined {
  const value = topics[2]
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'bigint') return Number(value)
  return undefined
}

function readAmount(data: unknown): string | undefined {
  if (typeof data === 'bigint' || typeof data === 'number') return data.toString()
  if (data && typeof data === 'object' && 'amount' in data) {
    const amount = (data as { amount: unknown }).amount
    if (typeof amount === 'bigint' || typeof amount === 'number' || typeof amount === 'string') {
      return amount.toString()
    }
  }
  return undefined
}
