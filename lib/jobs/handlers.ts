import type { JobHandler, JobType } from './types'
import type { SorobanEventPayload } from '@/lib/contract-sync/types'

export function createJobHandlers(): Record<JobType, JobHandler> {
  return {
    tx_monitor: async (job) => {
      const { txRecoveryService } = await import('@/lib/tx-recovery')
      const requested = job.payload.batchSize
      const batchSize = typeof requested === 'number' ? requested : 25
      const result = await txRecoveryService.pollPendingQueue(batchSize)
      return { ...result }
    },
    notification: async (job) => {
      const { createNotification } = await import('@/lib/notifications')
      const { userId, title, message, type, eventType, payload } = job.payload
      if (typeof userId !== 'number' && typeof userId !== 'string') {
        throw new Error('notification job requires a userId')
      }
      if (typeof title !== 'string' || typeof message !== 'string' || typeof type !== 'string' || typeof eventType !== 'string') {
        throw new Error('notification job requires title, message, type, and eventType')
      }
      const notification = await createNotification({
        userId: userId as number,
        title,
        message,
        type,
        eventType,
        payload: payload && typeof payload === 'object' && !Array.isArray(payload)
          ? payload as Record<string, unknown>
          : {},
      })
      return { notificationId: notification.id }
    },
    contract_sync: async (job) => {
      const { ContractSyncService } = await import('@/lib/contract-sync')
      await new ContractSyncService().applyEvent(readSyncPayload(job.payload))
      return { synced: true }
    },
    deadline_check: async () => {
      const { DeadlineMonitorService } = await import('@/lib/deadline-monitor')
      const result = await new DeadlineMonitorService().runCheck()
      return { ...result }
    },
  }
}

function readSyncPayload(payload: Record<string, unknown>): SorobanEventPayload {
  const { event, contractAddress, txHash, data } = payload
  if (typeof event !== 'string' || typeof contractAddress !== 'string' || typeof txHash !== 'string' || !Array.isArray(data)) {
    throw new Error('contract_sync job requires event, contractAddress, txHash, and data')
  }
  return {
    event: event as SorobanEventPayload['event'],
    contractAddress,
    txHash,
    data,
    ledgerSequence: typeof payload.ledgerSequence === 'number' ? payload.ledgerSequence : 0,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    milestoneId: typeof payload.milestoneId === 'number' ? payload.milestoneId : undefined,
    disputeId: typeof payload.disputeId === 'number' ? payload.disputeId : undefined,
    amount: typeof payload.amount === 'string' ? payload.amount : undefined,
    actor: typeof payload.actor === 'string' ? payload.actor : undefined,
    recipient: typeof payload.recipient === 'string' ? payload.recipient : undefined,
  }
}
