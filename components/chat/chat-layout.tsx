'use client';

import { useState, useEffect } from 'react';
import { ContractConversation, ChatMessage } from '@/types/chat';
import { ConversationList } from './conversation-list';
import { ChatMessageThread } from './chat-message-thread';
import { INITIAL_CONVERSATIONS, INITIAL_MESSAGES } from '@/lib/mock-chat';
import { cn } from '@/lib/utils';

interface ChatLayoutProps {
  initialContractId?: string | null;
  currentUserId?: string;
}

export function ChatLayout({ initialContractId, currentUserId = 'client_1' }: ChatLayoutProps) {
  const [conversations, setConversations] = useState<ContractConversation[]>([]);
  const [activeContractId, setActiveContractId] = useState<string | null>(initialContractId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>(initialContractId ? 'thread' : 'list');

  // Fetch Conversations List
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const res = await fetch('/api/messages');
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || INITIAL_CONVERSATIONS);
          if (!activeContractId && (data.conversations || INITIAL_CONVERSATIONS).length > 0) {
            const firstId = (data.conversations || INITIAL_CONVERSATIONS)[0].contractId;
            setActiveContractId(initialContractId || firstId);
          }
        } else {
          setConversations(INITIAL_CONVERSATIONS);
          if (!activeContractId && INITIAL_CONVERSATIONS.length > 0) {
            setActiveContractId(initialContractId || INITIAL_CONVERSATIONS[0].contractId);
          }
        }
      } catch {
        setConversations(INITIAL_CONVERSATIONS);
        if (!activeContractId && INITIAL_CONVERSATIONS.length > 0) {
          setActiveContractId(initialContractId || INITIAL_CONVERSATIONS[0].contractId);
        }
      } finally {
        setLoadingList(false);
      }
    })();
  }, [initialContractId]);

  // Fetch Messages when activeContractId changes
  useEffect(() => {
    if (!activeContractId) return;

    // Reset unread count for selected conversation
    setConversations((prev) =>
      prev.map((c) => (c.contractId === activeContractId ? { ...c, unreadCount: 0 } : c))
    );

    (async () => {
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/messages/${activeContractId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        } else {
          setMessages(INITIAL_MESSAGES[activeContractId] || []);
        }
      } catch {
        setMessages(INITIAL_MESSAGES[activeContractId] || []);
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeContractId]);

  const handleSelectConversation = (contractId: string) => {
    setActiveContractId(contractId);
    setMobileView('thread');
  };

  const handleSendMessage = async (content: string) => {
    if (!activeContractId || !content.trim()) return;

    const currentConv = conversations.find((c) => c.contractId === activeContractId);
    const senderRole = currentConv?.client.id === currentUserId ? 'client' : 'freelancer';
    const senderName =
      senderRole === 'client' ? currentConv?.client.name : currentConv?.freelancer.name;
    const senderAvatar =
      senderRole === 'client' ? currentConv?.client.avatarUrl : currentConv?.freelancer.avatarUrl;

    const tempMessage: ChatMessage = {
      id: `temp_${Date.now()}`,
      contractId: activeContractId,
      senderId: currentUserId,
      senderName: senderName || 'Alex Vance',
      senderRole: senderRole || 'client',
      senderAvatar,
      content,
      timestamp: new Date().toISOString(),
      status: 'sending',
    };

    // Optimistic UI Update
    setMessages((prev) => [...prev, tempMessage]);

    // Update conversation last message snippet
    setConversations((prev) =>
      prev.map((c) =>
        c.contractId === activeContractId
          ? {
              ...c,
              lastMessage: {
                content,
                timestamp: tempMessage.timestamp,
                senderId: currentUserId,
              },
              updatedAt: tempMessage.timestamp,
            }
          : c
      )
    );

    try {
      const res = await fetch(`/api/messages/${activeContractId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          senderId: currentUserId,
          senderName: tempMessage.senderName,
          senderRole: tempMessage.senderRole,
          senderAvatar: tempMessage.senderAvatar,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempMessage.id ? data.message : m))
          );
        }
      } else {
        // Fallback status to sent
        setMessages((prev) =>
          prev.map((m) => (m.id === tempMessage.id ? { ...m, status: 'sent' } : m))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempMessage.id ? { ...m, status: 'sent' } : m))
      );
    }
  };

  const activeConversation = conversations.find((c) => c.contractId === activeContractId) || null;

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[580px] w-full gap-4 relative overflow-hidden">
      {/* Sidebar List Column */}
      <div
        className={cn(
          'w-full lg:w-80 xl:w-96 shrink-0 h-full transition-all duration-300',
          mobileView === 'thread' ? 'hidden lg:block' : 'block'
        )}
      >
        <ConversationList
          conversations={conversations}
          activeContractId={activeContractId}
          onSelectConversation={handleSelectConversation}
          loading={loadingList}
          currentUserId={currentUserId}
        />
      </div>

      {/* Main Chat Thread Column */}
      <div
        className={cn(
          'flex-1 h-full min-w-0 transition-all duration-300',
          mobileView === 'list' ? 'hidden lg:flex' : 'flex'
        )}
      >
        <ChatMessageThread
          conversation={activeConversation}
          messages={messages}
          loading={loadingMessages}
          onSendMessage={handleSendMessage}
          onBackMobile={() => setMobileView('list')}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}
