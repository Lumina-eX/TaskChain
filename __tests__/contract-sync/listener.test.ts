import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SorobanEventListener } from '@/lib/contract-sync/listener'

const { mockGetLatestLedger, mockGetEvents, MockSorobanServer } = vi.hoisted(() => {
  const mGetLatestLedger = vi.fn()
  const mGetEvents = vi.fn()

  const MServer = class {
    getLatestLedger = mGetLatestLedger
    getEvents = mGetEvents
  }

  return {
    mockGetLatestLedger: mGetLatestLedger,
    mockGetEvents: mGetEvents,
    MockSorobanServer: MServer,
  }
})

vi.mock('@stellar/stellar-sdk', () => ({
  default: MockSorobanServer,
}))

describe('SorobanEventListener', () => {
  let listener: SorobanEventListener
  let callback: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    callback = vi.fn()
    mockGetLatestLedger.mockReset()
    mockGetEvents.mockReset()

    listener = new SorobanEventListener({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: ['CA1234'],
      pollIntervalMs: 1000,
      maxLedgerOffset: 100,
    })

    listener.setCallback(callback as any)
  })

  afterEach(() => {
    listener.stop()
    vi.useRealTimers()
  })

  it('initializes with correct options', () => {
    expect(listener.isRunning).toBe(false)
  })

  it('starts and sets running flag', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    expect(listener.isRunning).toBe(true)
  })

  it('stops and clears running flag', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    listener.stop()
    expect(listener.isRunning).toBe(false)
  })

  it('does not start twice', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    await listener.start()
    expect(mockGetLatestLedger).toHaveBeenCalledTimes(1)
  })

  it('fetches latest ledger on start', async () => {
    mockGetLatestLedger.mockResolvedValue({ sequence: 500 })

    await listener.start()
    expect(mockGetLatestLedger).toHaveBeenCalledTimes(1)
  })

  describe('checkpoint resumption', () => {
    it('resumes from an initialLedger option instead of fetching the chain tip', async () => {
      const onCheckpoint = vi.fn()
      const resumable = new SorobanEventListener({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        contractAddresses: ['CA1234'],
        pollIntervalMs: 1000,
        initialLedger: 900,
        onCheckpoint,
      })
      resumable.setCallback(callback as any)

      await resumable.start()

      expect(mockGetLatestLedger).not.toHaveBeenCalled()
      resumable.stop()
    })

    it('setInitialLedger seeds the resume point before start()', async () => {
      listener.setInitialLedger(900)
      await listener.start()

      expect(mockGetLatestLedger).not.toHaveBeenCalled()
    })

    it('setInitialLedger is a no-op once already running', async () => {
      mockGetLatestLedger.mockResolvedValue({ sequence: 500 })
      await listener.start()

      listener.setInitialLedger(900)
      mockGetEvents.mockResolvedValue({ events: [] })
      mockGetLatestLedger.mockResolvedValue({ sequence: 600 })

      await vi.advanceTimersByTimeAsync(1000)

      // startSeq should derive from the original 500 checkpoint (501), not 900
      expect(mockGetEvents).toHaveBeenCalledWith(
        expect.objectContaining({ startLedger: 501 })
      )
    })

    it('invokes onCheckpoint with the new high-water-mark after each poll', async () => {
      const onCheckpoint = vi.fn()
      listener = new SorobanEventListener({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        contractAddresses: ['CA1234'],
        pollIntervalMs: 1000,
        onCheckpoint,
      })
      listener.setCallback(callback as any)

      mockGetLatestLedger.mockResolvedValueOnce({ sequence: 500 })
      await listener.start()

      mockGetEvents.mockResolvedValue({ events: [] })
      mockGetLatestLedger.mockResolvedValue({ sequence: 505 })
      await vi.advanceTimersByTimeAsync(1000)

      expect(onCheckpoint).toHaveBeenCalledWith(505)
    })

    it('normalizes canonical typed event topics and extracts indexed identifiers', async () => {
    vi.useRealTimers()
    const canonicalListener = new SorobanEventListener({
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
      contractAddresses: ['CA1234'],
      initialLedger: 500,
    })
    const canonicalCallback = vi.fn()
    canonicalListener.setCallback(canonicalCallback)

    mockGetEvents.mockResolvedValue({
      events: [{
        topic: ['PaymentReleased', 'CA-CONTRACT', '7', 'GACTOR'],
        value: { recipient: 'GRECIPIENT', amount: '250' },
        ledger: 501,
        txHash: 'tx-canonical',
      }],
    })
    mockGetLatestLedger.mockResolvedValue({ sequence: 505 })

    await (canonicalListener as any).poll()

    expect(canonicalCallback).toHaveBeenCalledWith(expect.objectContaining({
      event: 'payment_released',
      milestoneId: 7,
      amount: '250',
      actor: 'GACTOR',
      recipient: 'GRECIPIENT',
    }))
    canonicalListener.stop()
  })

  it('awaits the callback for each event before advancing the checkpoint', async () => {
      // Uses real timers and calls the private poll() directly so the
      // ordering can be observed deterministically without racing fake-timer
      // microtask flushing against a manually-controlled promise.
      vi.useRealTimers()

      const order: string[] = []
      const onCheckpoint = vi.fn((ledger: number) => order.push(`checkpoint:${ledger}`))
      let resolveCallback!: () => void
      const slowCallback = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveCallback = () => {
              order.push('callback-resolved')
              resolve()
            }
          })
      )

      const realtimeListener = new SorobanEventListener({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        contractAddresses: ['CA1234'],
        pollIntervalMs: 1000,
        initialLedger: 500,
        onCheckpoint,
      })
      realtimeListener.setCallback(slowCallback)

      mockGetEvents.mockResolvedValue({
        events: [{ topic: ['fund'], value: [], ledger: 501, txHash: 'tx1' }],
      })
      mockGetLatestLedger.mockResolvedValue({ sequence: 505 })

      const pollPromise = (realtimeListener as any).poll()
      await Promise.resolve() // let poll() reach the awaited callback
      await Promise.resolve()
      expect(slowCallback).toHaveBeenCalled()
      expect(onCheckpoint).not.toHaveBeenCalled()

      resolveCallback()
      await pollPromise

      expect(order).toEqual(['callback-resolved', 'checkpoint:505'])

      vi.useFakeTimers()
    })
  })
})
