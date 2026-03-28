import { NotificationType, NotificationTemplate } from './types';

export const templates: Record<NotificationType, (data: any) => NotificationTemplate> = {
  milestone_submitted: (data: { jobTitle: string; freelancerName: string }) => ({
    title: 'Milestone Submitted',
    message: `${data.freelancerName} has submitted a milestone for "${data.jobTitle}".`,
  }),
  funds_released: (data: { jobTitle: string; amount: string; currency: string }) => ({
    title: 'Funds Released',
    message: `Payment of ${data.amount} ${data.currency} for "${data.jobTitle}" has been released to your wallet.`,
  }),
  dispute_opened: (data: { jobTitle: string; reason: string }) => ({
    title: 'Dispute Opened',
    message: `A dispute has been opened for "${data.jobTitle}". Reason: ${data.reason}`,
  }),
  wallet_activity: (data: { action: string; amount: string; currency: string }) => ({
    title: 'Wallet Activity',
    message: `New activity detected: ${data.action} of ${data.amount} ${data.currency}.`,
  }),
  funds_received: (data: { jobTitle: string; amount: string; currency: string }) => ({
    title: 'Funds Received in Escrow',
    message: `A deposit of ${data.amount} ${data.currency} for "${data.jobTitle}" has been confirmed in escrow.`,
  }),
};
