export type NotificationType = 
  | 'milestone_submitted'
  | 'funds_released'
  | 'dispute_opened'
  | 'wallet_activity'
  | 'funds_received';

export interface NotificationPayload {
  userId: number;
  type: NotificationType;
  data: Record<string, any>;
  link?: string;
}

export interface NotificationTemplate {
  title: string;
  message: string;
}
