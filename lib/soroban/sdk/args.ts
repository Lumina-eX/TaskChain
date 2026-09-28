import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk'
import { SorobanSdkError, type Milestone } from './types'

const MILESTONE_STATUS_CREATED = 0

export function encodeAddress(address: string): xdr.ScVal {
  return new Address(address).toScVal()
}

export function encodeU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' })
}

export function encodeI128(value: number): xdr.ScVal {
  return nativeToScVal(BigInt(value), { type: 'i128' })
}

export function encodeMilestone(milestone: Milestone): xdr.ScVal {
  const fields: Record<string, xdr.ScVal> = {
    amount: encodeI128(milestone.amount),
    client_approved: nativeToScVal(milestone.clientApproved ?? false),
    deadline: nativeToScVal(BigInt(milestone.deadline ?? 0), { type: 'u64' }),
    description: nativeToScVal(milestone.description ?? ''),
    freelancer_approved: nativeToScVal(milestone.freelancerApproved ?? false),
    id: encodeU32(milestone.id),
    status: encodeU32(milestone.status ?? MILESTONE_STATUS_CREATED),
  }

  const map = Object.keys(fields)
    .sort()
    .map(
      (key) =>
        new xdr.ScMapEntry({
          key: nativeToScVal(key, { type: 'symbol' }),
          val: fields[key],
        })
    )

  return xdr.ScVal.scvMap(map)
}

export function encodeMilestones(milestones: Milestone[]): xdr.ScVal {
  return xdr.ScVal.scvVec(milestones.map(encodeMilestone))
}

export function decodeMilestone(value: xdr.ScVal): Milestone {
  const native = scValToNative(value) as Record<string, unknown>
  return {
    id: readNumber(native.id, 'id'),
    amount: readNumber(native.amount, 'amount'),
    deadline: readNumber(native.deadline, 'deadline'),
    description: typeof native.description === 'string' ? native.description : '',
    status: readNumber(native.status, 'status'),
    clientApproved: native.client_approved === true,
    freelancerApproved: native.freelancer_approved === true,
  }
}

export function assertSafeAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SorobanSdkError(`${label} must be a positive integer in token base units`)
  }
}

export function assertMilestoneId(milestoneId: string): number {
  if (!/^\d+$/.test(milestoneId)) {
    throw new SorobanSdkError('milestoneId must be an unsigned integer')
  }
  const id = Number(milestoneId)
  if (!Number.isSafeInteger(id) || id > 0xffffffff) {
    throw new SorobanSdkError('milestoneId must be an unsigned integer')
  }
  return id
}

function readNumber(value: unknown, label: string): number {
  const parsed = typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : NaN
  if (!Number.isSafeInteger(parsed)) {
    throw new SorobanSdkError(`Milestone ${label} is not a safe integer`)
  }
  return parsed
}
