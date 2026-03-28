import { sql } from '@/lib/db';
import { NotificationPayload } from './types';
import { templates } from './templates';

export class NotificationService {
  /**
   * Sends a notification to a user via all enabled channels.
   */
  static async send(payload: NotificationPayload) {
    const template = templates[payload.type](payload.data);
    
    // 1. Store in-app notification in the database
    await this.sendToDatabase(payload, template);
    
    // 2. Send email notification (placeholder)
    await this.sendEmail(payload, template);
    
    console.log(`[NotificationService] Notification sent to User #${payload.userId}: ${template.title}`);
  }

  private static async sendToDatabase(payload: NotificationPayload, template: { title: string; message: string }) {
    try {
      await sql`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES (${payload.userId}, ${payload.type}, ${template.title}, ${template.message}, ${payload.link || null})
      `;
    } catch (error) {
      console.error('[NotificationService] Failed to store notification in database:', error);
    }
  }

  private static async sendEmail(payload: NotificationPayload, template: { title: string; message: string }) {
    // Placeholder for email service integration (e.g., Resend, SendGrid)
    // In a real app, we would fetch the user's email and send the message.
    console.log(`[EMAIL SIMULATION] To: User #${payload.userId}`);
    console.log(`[EMAIL SIMULATION] Subject: ${template.title}`);
    console.log(`[EMAIL SIMULATION] Body: ${template.message}`);
  }
}
