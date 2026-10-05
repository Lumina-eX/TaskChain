import { Account, StrKey, nativeToScVal, xdr, type Transaction } from '@stellar/stellar-sdk'
import { describe, expect, it, vi } from 'vitest'
import { decodeMilestone, encodeMilestone } from '@/lib/soroban/sdk/args'
import { SorobanContractClient } from '@/lib/soroban/sdk/client'
import { parseContractError, parseContractEvent } from '@/lib/soroban/sdk/parse'
import { SorobanSdkError } from '@/lib/soroban/sdk/types'

const CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'
const SOURCE = 'GBVMY7OVKO4ECNXGGHQHK25UCNEL3AOPVLFYAF7QZK6IGCYSSTYQACKH'

function contractEvent(name: string, data: xdr.ScVal, topics: xdr.ScVal[] = []): xdr.ContractEvent {
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: StrKey.decodeContract(CONTRACT_ID) as never,
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(
      0,
      new xdr.ContractEventV0({
        topics: [nativeToScVal(name, { type: 'symbol' }), ...topics],
        data,
      })
    ),
  })
}

function diagnostic(event: xdr.ContractEvent): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({ inSuccessfulContractCall: true, event })
}

function invoked(tx: Transaction): { method: string; argCount: number } {
  const operation = tx.operations[0] as {
    func: { value(): { functionName(): { toString(): string }; args(): xdr.ScVal[] } }
  }
  const fn = operation.func.value()
  return { method: fn.functionName().toString(), argCount: fn.args().length }
}

function client(overrides: {
  simulate?: (tx: Transaction) => Promise<Record<string, unknown>>
  sign?: (xdr: string) => Promise<string>
  getTransaction?: () => Promise<Record<string, unknown>>
} = {}) {
  const sign = vi.fn(overrides.sign ?? (async (xdr: string) => xdr))
  const seen: Transaction[] = []
  const sdk = new SorobanContractClient(
    {
      contractId: CONTRACT_ID,
      sourcePublicKey: SOURCE,
      signTransaction: sign,
      parties: {
        admin: SOURCE,
        client: SOURCE,
        freelancer: SOURCE,
        arbiter: SOURCE,
        token: CONTRACT_ID,
      },
      confirmationAttempts: 1,
      confirmationIntervalMs: 0,
    },
    {
      server: {
        getAccount: async (id: string) => new Account(id, '1'),
        simulateTransaction: async (tx: Transaction) => {
          seen.push(tx)
          return (overrides.simulate
            ? overrides.simulate(tx)
            : { transactionData: {}, events: [] }) as never
        },
        sendTransaction: async () =>
          ({ status: 'PENDING', hash: 'abc', latestLedger: 1, latestLedgerCloseTime: 1 }) as never,
        getTransaction: async () =>
          (overrides.getTransaction
            ? overrides.getTransaction()
            : {
                status: 'SUCCESS',
                ledger: 9,
                returnValue: xdr.ScVal.scvVoid(),
                events: { contractEventsXdr: [[]], transactionEventsXdr: [] },
              }) as never,
      },
      assemble: (tx) => ({ build: () => tx }),
    }
  )
  return { sdk, sign, seen }
}

describe('soroban contract sdk', () => {
  it('round-trips milestone arguments', () => {
    const decoded = decodeMilestone(
      encodeMilestone({ id: 2, amount: 250, deadline: 10, description: 'design' })
    )
    expect(decoded).toEqual({
      id: 2,
      amount: 250,
      deadline: 10,
      description: 'design',
      status: 0,
      clientApproved: false,
      freelancerApproved: false,
    })
  })

  it('maps contract error codes', () => {
    expect(parseContractError('HostError: Error(Contract, #5)')).toMatchObject({
      code: 'ERR_MILESTONE_NOT_FOUND',
      contractCode: 5,
    })
  })

  it('parses an escrow_funded event', () => {
    const parsed = parseContractEvent(contractEvent('escrow_funded', nativeToScVal(BigInt(80), { type: 'i128' })))
    expect(parsed).toMatchObject({
      name: 'escrow_funded',
      contractId: CONTRACT_ID,
      amount: '80',
    })
  })

  it('returns a failed result when simulation hits a contract error', async () => {
    const { sdk, sign } = client({
      simulate: async () => ({ error: 'HostError: Error(Contract, #7)', events: [] }),
    })
    const result = await sdk.approveMilestone(CONTRACT_ID, '4')
    expect(result.status).toBe('failed')
    expect(result.error).toMatchObject({ code: 'ERR_UNAUTHORIZED', contractCode: 7 })
    expect(sign).not.toHaveBeenCalled()
  })

  it('does not submit a fund call when the simulated amount differs', async () => {
    const event = contractEvent('escrow_funded', nativeToScVal(BigInt(50), { type: 'i128' }))
    const { sdk, sign } = client({
      simulate: async () => ({ transactionData: {}, events: [diagnostic(event)] }),
    })
    const result = await sdk.fundEscrow(CONTRACT_ID, 100)
    expect(result.status).toBe('failed')
    expect(result.error?.message).toContain('does not match 100')
    expect(sign).not.toHaveBeenCalled()
  })

  it('builds, simulates, and submits an approve call', async () => {
    const { sdk, sign, seen } = client()
    const result = await sdk.approveMilestone(CONTRACT_ID, '4')
    expect(invoked(seen[0])).toEqual({ method: 'approve', argCount: 1 })
    expect(sign).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ status: 'success', hash: 'abc', method: 'approve', ledger: 9 })
  })

  it('initializes an escrow from the budget when no milestones are given', async () => {
    const { sdk, seen } = client()
    const result = await sdk.createEscrow('project-1', 500)
    expect(invoked(seen[0])).toEqual({ method: 'initialize', argCount: 6 })
    expect(result.projectId).toBe('project-1')
  })

  it('rejects milestone totals that do not match the budget', async () => {
    const { sdk } = client()
    await expect(
      sdk.createEscrow('project-1', 100, [{ id: 1, amount: 40 }])
    ).rejects.toBeInstanceOf(SorobanSdkError)
  })
})
