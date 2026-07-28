'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ContractConversation, ChatMessage } from '@/types/chat';
import { ChatMessageItem } from './chat-message-item';
import { ChatInput } from './chat-input';
import { ChatEmptyState } from './chat-empty-state';
import { ChatThreadSkeleton } from './chat-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ExternalLink, ShieldCheck, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageThreadProps {
  conversation: ContractConversation | null;
  messages: ChatMessage[];
  loading: boolean;
  onSendMessage: (content: string) => void;
  onBackMobile?: () => void;
  currentUserId?: string;
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Active Contract', bg: 'bg-secondary/20', text: 'text-secondary' },
  in_progress: { label: 'In Progress', bg: 'bg-secondary/20', text: 'text-secondary' },
  pending: { label: 'Pending', bg: 'bg-amber-500/20', text: 'text-amber-500' },
  paused: { label: 'Paused', bg: 'bg-amber-500/20', text: 'text-amber-500' },
  completed: { label: 'Completed', bg: 'bg-accent/20', text: 'text-accent' },
  disputed: { label: 'Disputed', bg: 'bg-destructive/20', text: 'text-destructive' },
};

export function ChatMessageThread({
  conversation,
  messages,
  loading,
  onSendMessage,
  onBackMobile,
  currentUserId = 'client_1',
}: ChatMessageThreadProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Requirement: Auto-scroll to latest message
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages, conversation?.contractId]);

  if (!conversation) {
    return <ChatEmptyState type="no-selected" />;
  }

  const otherParty =
    conversation.client.id === currentUserId ? conversation.freelancer : conversation.client;
  const statusCfg = statusConfig[conversation.contractStatus] || statusConfig.active;

  return (
    <div className="flex-1 flex flex-col h-full bg-card/20 backdrop-blur-md rounded-2xl border border-border/40 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/40 bg-card/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Mobile Back Button */}
          {onBackMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBackMobile}
              className="lg:hidden h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              title="Back to conversation list"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          {/* User Avatar & Info */}
          <div className="relative shrink-0">
            <img
              src={
                otherParty.avatarUrl ||
                `https://api.dicebear.com/7.x/bottts/svg?seed=${otherParty.name}`
              }
              alt={otherParty.name}
              className="h-10 w-10 rounded-full object-cover border border-border/50"
            />
            {otherParty.online && (
              <span
                className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-accent border-2 border-background"
                title="Online"
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate text-foreground">{otherParty.name}</h3>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-border/40">
                {otherParty.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
              <span>{conversation.projectTitle}</span>
              <span className="opacity-40">•</span>
              <span className="font-mono text-[11px]">#{conversation.contractId}</span>
            </p>
          </div>
        </div>

        {/* Contract Actions & Status */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge className={cn('hidden sm:inline-flex border-0 text-xs', statusCfg.bg, statusCfg.text)}>
            {statusCfg.label}
          </Badge>
          <Link href={`/dashboard/contracts/${conversation.contractId}`}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-border/50 hover:bg-card"
            >
              <span className="hidden sm:inline">View Contract</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Messages Thread Container */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
        {loading ? (
          <ChatThreadSkeleton />
        ) : messages.length === 0 ? (
          <ChatEmptyState
            type="no-messages"
            contractTitle={conversation.projectTitle}
            onQuickStart={onSendMessage}
          />
        ) : (
          <>
            {/* Escrow Banner */}
            <div className="mx-auto max-w-sm p-2.5 rounded-xl bg-accent/5 border border-accent/20 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
              <span>
                Contract #{conversation.contractId} — Escrow total:{' '}
                <strong className="text-foreground">
                  {conversation.totalAmount} {conversation.currency}
                </strong>
              </span>
            </div>

            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                isCurrentUser={msg.senderId === currentUserId}
              />
            ))}
            {/* Auto-scroll anchor */}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Component */}
      <ChatInput onSendMessage={onSendMessage} disabled={loading} />
    </div>
  );
}
