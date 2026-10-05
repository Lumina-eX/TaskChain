import {
  Account,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Networks,
  rpc,
  StrKey,
  TransactionBuilder,
  scValToNative,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk'
import { assertMilestoneId, assertSafeAmount, encodeAddress, encodeMilestones, encodeU32 } from './args'
import { parseContractError, parseContractEvents, parseDiagnosticEvents } from './parse'
import {
  SorobanSdkError,
  type EscrowParties,
  type Milestone,
  type ParsedContractEvent,
  type SorobanSdkConfig,
  type TxResult,
} from './types'

interface SorobanRpc {
  getAccount(accountId: string): Promise<Account>
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>
  sendTransaction(tx: Transaction | FeeBumpTransaction): Promise<rpc.Api.SendTransactionResponse>
  getTransaction(hash: string): Promise<rpc.Api.GetTransactionResponse>
}

type Assembler = (
  tx: Transaction,
  simulation: rpc.Api.SimulateTransactionResponse
) => { build(): Transaction }

const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org'

/**
 * Builds, simulates, signs, and submits escrow contract calls.
 * Method names follow the app lifecycle; each one invokes the matching
 * Soroban function (`initialize`, `fund`, `submit_milestone`, `approve`,
 * `dispute`, `release`).
 */
export class SorobanContractClient {
  private readonly server: SorobanRpc
  private readonly assemble: Assembler
  private readonly networkPassphrase: string
  private readonly contractId: string
  private readonly sourcePublicKey: string
  private readonly signTransaction: SorobanSdkConfig['signTransaction']
  private readonly parties?: EscrowParties
  private readonly timeoutSeconds: number
  private readonly confirmationAttempts: number
  private readonly confirmationIntervalMs: number

  constructor(config: SorobanSdkConfig, deps?: { server?: SorobanRpc; assemble?: Assembler }) {
    assertContractId(config.contractId, 'contractId')
    assertAddress(config.sourcePublicKey, 'sourcePublicKey')
    if (config.parties) assertParties(config.parties)

    this.networkPassphrase = config.networkPassphrase ?? Networks.TESTNET
    this.contractId = config.contractId
    this.sourcePublicKey = config.sourcePublicKey
    this.signTransaction = config.signTransaction
    this.parties = config.parties
    this.timeoutSeconds = config.timeoutSeconds ?? 300
    this.confirmationAttempts = config.confirmationAttempts ?? 30
    this.confirmationIntervalMs = config.confirmationIntervalMs ?? 2000
    this.server =
      deps?.server ??
      new rpc.Server(config.rpcUrl ?? process.env.STELLAR_RPC_URL ?? DEFAULT_RPC_URL)
    this.assemble = deps?.assemble ?? ((tx, simulation) => rpc.assembleTransaction(tx, simulation))
  }

  async createEscrow(projectId: string, budget: number, milestones?: Milestone[]): Promise<TxResult> {
    if (!projectId.trim()) throw new SorobanSdkError('projectId is required')
    if (!this.parties) throw new SorobanSdkError('Escrow parties are required to create an escrow')
    assertSafeAmount(budget, 'budget')

    const encoded = milestones?.length
      ? validateMilestones(milestones, budget)
      : [{ id: 0, amount: budget, description: projectId }]

    return this.invoke(this.contractId, 'initialize', [
      encodeAddress(this.parties.admin),
      encodeAddress(this.parties.client),
      encodeAddress(this.parties.freelancer),
      encodeAddress(this.parties.arbiter),
      encodeAddress(this.parties.token),
      encodeMilestones(encoded),
    ], { projectId })
  }

  async fundEscrow(escrowId: string, amount: number): Promise<TxResult> {
    assertContractId(escrowId, 'escrowId')
    assertSafeAmount(amount, 'amount')
    return this.invoke(escrowId, 'fund', [], {
      expectedEvent: 'escrow_funded',
      expectedAmount: amount,
    })
  }

  async submitMilestone(escrowId: string, milestoneId: string): Promise<TxResult> {
    assertContractId(escrowId, 'escrowId')
    return this.invoke(escrowId, 'submit_milestone', [encodeU32(assertMilestoneId(milestoneId))])
  }

  async approveMilestone(escrowId: string, milestoneId: string): Promise<TxResult> {
    assertContractId(escrowId, 'escrowId')
    return this.invoke(escrowId, 'approve', [encodeU32(assertMilestoneId(milestoneId))])
  }

  async raiseDispute(escrowId: string, milestoneId: string): Promise<TxResult> {
    assertContractId(escrowId, 'escrowId')
    return this.invoke(escrowId, 'dispute', [
      encodeU32(assertMilestoneId(milestoneId)),
      encodeAddress(this.sourcePublicKey),
    ])
  }

  async releasePayment(escrowId: string, milestoneId: string): Promise<TxResult> {
    assertContractId(escrowId, 'escrowId')
    return this.invoke(escrowId, 'release', [
      encodeU32(assertMilestoneId(milestoneId)),
      encodeAddress(this.sourcePublicKey),
    ])
  }

  private async invoke(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    options: { projectId?: string; expectedEvent?: string; expectedAmount?: number } = {}
  ): Promise<TxResult> {
    try {
      const account = await this.server.getAccount(this.sourcePublicKey)
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(new Contract(contractId).call(method, ...args))
        .setTimeout(this.timeoutSeconds)
        .build()

      const simulation = await this.server.simulateTransaction(tx)
      const simulatedEvents = parseDiagnosticEvents(simulation.events)

      if (rpc.Api.isSimulationError(simulation)) {
        return this.failed(contractId, method, parseContractError(simulation.error).message, {
          events: simulatedEvents,
          error: parseContractError(simulation.error),
          projectId: options.projectId,
        })
      }
      if (rpc.Api.isSimulationRestore(simulation)) {
        return this.failed(contractId, method, 'Contract state has expired and must be restored', {
          events: simulatedEvents,
          projectId: options.projectId,
        })
      }

      const mismatch = amountMismatch(simulatedEvents, options.expectedEvent, options.expectedAmount)
      if (mismatch) {
        return this.failed(contractId, method, mismatch, {
          events: simulatedEvents,
          projectId: options.projectId,
        })
      }

      const prepared = this.assemble(tx, simulation).build()
      const signedXdr = await this.signTransaction(prepared.toXDR())
      const signed = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase)
      const sent = await this.submit(signed)

      if (sent.status === 'ERROR') {
        return this.failed(contractId, method, 'Transaction rejected by the network', {
          hash: sent.hash,
          events: simulatedEvents,
          projectId: options.projectId,
        })
      }

      const confirmed = await this.waitForConfirmation(sent.hash)
      if (confirmed.status !== 'SUCCESS') {
        return this.failed(contractId, method, confirmed.message, {
          hash: sent.hash,
          events: confirmed.events,
          projectId: options.projectId,
        })
      }

      const confirmedMismatch = amountMismatch(confirmed.events, options.expectedEvent, options.expectedAmount)
      if (confirmedMismatch) {
        return this.failed(contractId, method, confirmedMismatch, {
          hash: sent.hash,
          ledger: confirmed.ledger,
          events: confirmed.events,
          projectId: options.projectId,
        })
      }

      return {
        hash: sent.hash,
        status: 'success',
        contractId,
        method,
        ledger: confirmed.ledger,
        returnValue: confirmed.returnValue,
        events: confirmed.events,
        ...(options.projectId ? { projectId: options.projectId } : {}),
      }
    } catch (err) {
      if (err instanceof SorobanSdkError) throw err
      const message = err instanceof Error ? err.message : 'Soroban transaction failed'
      return this.failed(contractId, method, message, { projectId: options.projectId })
    }
  }

  private async submit(tx: Transaction | FeeBumpTransaction): Promise<rpc.Api.SendTransactionResponse> {
    let latest: rpc.Api.SendTransactionResponse | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      latest = await this.server.sendTransaction(tx)
      if (latest.status !== 'TRY_AGAIN_LATER') return latest
      await sleep(this.confirmationIntervalMs)
    }
    return latest!
  }

  private async waitForConfirmation(hash: string): Promise<{
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT'
    message: string
    ledger?: number
    returnValue?: unknown
    events: ParsedContractEvent[]
  }> {
    for (let attempt = 0; attempt < this.confirmationAttempts; attempt++) {
      if (this.confirmationIntervalMs > 0) await sleep(this.confirmationIntervalMs)
      const response = await this.server.getTransaction(hash)
      if (response.status === 'NOT_FOUND') continue

      const events = parseContractEvents(response.events?.contractEventsXdr?.flat() ?? [])
      if (response.status === 'SUCCESS') {
        return {
          status: 'SUCCESS',
          message: 'confirmed',
          ledger: response.ledger,
          returnValue: decodeReturn(response.returnValue),
          events,
        }
      }
      return { status: 'FAILED', message: 'Transaction failed on-chain', events }
    }
    return { status: 'TIMEOUT', message: 'Transaction confirmation timed out', events: [] }
  }

  private failed(
    contractId: string,
    method: string,
    message: string,
    extra: Partial<TxResult> & { error?: TxResult['error'] } = {}
  ): TxResult {
    return {
      hash: extra.hash ?? null,
      status: 'failed',
      contractId,
      method,
      events: extra.events ?? [],
      error: extra.error ?? { message },
      ...(extra.ledger === undefined ? {} : { ledger: extra.ledger }),
      ...(extra.projectId ? { projectId: extra.projectId } : {}),
    }
  }
}

function validateMilestones(milestones: Milestone[], budget: number): Milestone[] {
  const ids = new Set<number>()
  let total = 0
  for (const milestone of milestones) {
    assertSafeAmount(milestone.amount, 'milestone amount')
    if (!Number.isSafeInteger(milestone.id) || milestone.id < 0 || milestone.id > 0xffffffff) {
      throw new SorobanSdkError('milestone id must be an unsigned integer')
    }
    if (ids.has(milestone.id)) throw new SorobanSdkError('milestone ids must be unique')
    ids.add(milestone.id)
    total += milestone.amount
  }
  if (!Number.isSafeInteger(total) || total !== budget) {
    throw new SorobanSdkError('milestone amounts must sum to the budget')
  }
  return milestones
}

function amountMismatch(
  events: ParsedContractEvent[],
  expectedEvent: string | undefined,
  expectedAmount: number | undefined
): string | null {
  if (!expectedEvent || expectedAmount === undefined) return null
  const match = events.find((event) => event.name === expectedEvent && event.amount !== undefined)
  if (!match) return null
  if (match.amount === String(expectedAmount)) return null
  return `Contract event ${expectedEvent} amount ${match.amount} does not match ${expectedAmount}`
}

function decodeReturn(value: xdr.ScVal | undefined): unknown {
  if (!value || value.switch().name === 'scvVoid') return undefined
  return scValToNative(value)
}

function assertContractId(value: string, label: string): void {
  if (!StrKey.isValidContract(value)) throw new SorobanSdkError(`${label} is not a contract address`)
}

function assertAddress(value: string, label: string): void {
  if (!StrKey.isValidEd25519PublicKey(value) && !StrKey.isValidContract(value)) {
    throw new SorobanSdkError(`${label} is not a Stellar address`)
  }
}

function assertParties(parties: EscrowParties): void {
  for (const [label, value] of Object.entries(parties)) {
    assertAddress(value, label)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
