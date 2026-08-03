'use client';

import { useState } from 'react';
import { ContractConversation } from '@/types/chat';
import { ChatListSkeleton } from './chat-skeleton';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, MessageSquare, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationListProps {
  conversations: ContractConversation[];
  activeContractId: string | null;
  onSelectConversation: (contractId: string) => void;
  loading: boolean;
  currentUserId?: string;
}

function formatShortTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ConversationList({
  conversations,
  activeContractId,
  onSelectConversation,
  loading,
  currentUserId = 'client_1',
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'unread'>('all');

  const filteredConversations = conversations.filter((conv) => {
    const otherParty = conv.client.id === currentUserId ? conv.freelancer : conv.client;
    const matchesSearch =
      conv.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.contractId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      otherParty.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (tabFilter === 'unread') {
      return matchesSearch && conv.unreadCount > 0;
    }
    return matchesSearch;
  });

  return (
    <div className="w-full flex flex-col h-full bg-card/40 backdrop-blur-md rounded-2xl border border-border/40 shadow-sm overflow-hidden">
      {/* Search & Header */}
      <div className="p-4 border-b border-border/40 space-y-3 bg-card/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-base tracking-tight text-foreground">Contract Chats</h2>
          </div>
          <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5">
            {conversations.length} Active
          </Badge>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contracts or parties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-background/60 border-border/40 focus:bg-background transition-colors"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-2 text-xs border-t border-border/20 pt-2">
          <button
            onClick={() => setTabFilter('all')}
            className={cn(
              'px-3 py-1 rounded-md font-medium transition-colors',
              tabFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            All
          </button>
          <button
            onClick={() => setTabFilter('unread')}
            className={cn(
              'px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5',
              tabFilter === 'unread'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <span>Unread</span>
            {conversations.some((c) => c.unreadCount > 0) && (
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <ChatListSkeleton />
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs space-y-1">
            <Filter className="h-6 w-6 mx-auto opacity-40 mb-2" />
            <p className="font-medium text-foreground">No conversations found</p>
            <p>Try adjusting your search query or filter.</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.contractId === activeContractId;
            const otherParty = conv.client.id === currentUserId ? conv.freelancer : conv.client;

            return (
              <button
                key={conv.contractId}
                onClick={() => onSelectConversation(conv.contractId)}
                className={cn(
                  'w-full text-left p-3 rounded-xl transition-all duration-200 flex items-start gap-3 border group relative',
                  isActive
                    ? 'bg-primary/10 border-primary/40 shadow-xs'
                    : 'bg-transparent hover:bg-card/60 border-transparent hover:border-border/30'
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0 mt-0.5">
                  <img
                    src={
                      otherParty.avatarUrl ||
                      `https://api.dicebear.com/7.x/bottts/svg?seed=${otherParty.name}`
                    }
                    alt={otherParty.name}
                    className="h-10 w-10 rounded-full object-cover border border-border/40"
                  />
                  {otherParty.online && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-accent border-2 border-background" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-xs text-foreground truncate">
                      {otherParty.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatShortTime(conv.lastMessage?.timestamp || conv.updatedAt)}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-foreground/80 truncate">
                    {conv.projectTitle}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <p className="text-[11px] text-muted-foreground truncate flex-1">
                      {conv.lastMessage?.content || 'No messages yet'}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
