export type UserRole = 'client' | 'freelancer' | 'admin';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface ChatParticipant {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  role: UserRole;
  walletAddress?: string;
  online?: boolean;
}

export interface ChatMessage {
  id: string;
  contractId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  status: MessageStatus;
  attachments?: {
    name: string;
    url: string;
    type: 'file' | 'image' | 'code';
    size?: string;
  }[];
}

export interface ContractConversation {
  contractId: string;
  projectTitle: string;
  jobId: string;
  contractStatus: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled' | 'disputed';
  totalAmount: string;
  currency: string;
  client: ChatParticipant;
  freelancer: ChatParticipant;
  lastMessage?: {
    content: string;
    timestamp: string;
    senderId: string;
  };
  unreadCount: number;
  updatedAt: string;
}
