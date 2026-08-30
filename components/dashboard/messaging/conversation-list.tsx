"use client";

import { MessageSquare, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export interface Conversation {
  id: string;
  contract_id: string;
  contract_title: string;
  other_party_name: string;
  other_party_avatar?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  loading?: boolean;
}

function formatLastMessageTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  loading = false,
}: ConversationListProps) {
  const [query, setQuery] = useState("");

  const filtered = conversations.filter(
    (c) =>
      c.contract_title.toLowerCase().includes(query.toLowerCase()) ||
      c.other_party_name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/40 shrink-0">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Messages
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="pl-9 h-9 bg-card/50 border-border/40 text-sm"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading conversations…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {query
                ? "No conversations match your search."
                : "No conversations yet. Messages linked to your contracts will appear here."}
            </p>
          </div>
        ) : (
          <ul className="p-2 space-y-1" role="listbox" aria-label="Conversations">
            {filtered.map((conversation) => {
              const isSelected = conversation.id === selectedId;
              const initials = getInitials(conversation.other_party_name);

              return (
                <li key={conversation.id}>
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onSelect(conversation)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-3 py-3 rounded-lg transition-all duration-150",
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-card/50 border border-transparent"
                    )}
                  >
                    {/* Avatar */}
                    <div className="shrink-0 relative mt-0.5">
                      {conversation.other_party_avatar ? (
                        <img
                          src={conversation.other_party_avatar}
                          alt={conversation.other_party_name}
                          className="h-10 w-10 rounded-full object-cover border border-border/40"
                        />
                      ) : (
                        <div
                          className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold border",
                            isSelected
                              ? "bg-primary/15 border-primary/30 text-primary"
                              : "bg-muted border-border/40 text-muted-foreground"
                          )}
                        >
                          {initials}
                        </div>
                      )}
                      {conversation.unread_count > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                          {conversation.unread_count > 9 ? "9+" : conversation.unread_count}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span
                          className={cn(
                            "text-sm font-medium truncate",
                            conversation.unread_count > 0
                              ? "text-foreground"
                              : "text-foreground/80"
                          )}
                        >
                          {conversation.other_party_name}
                        </span>
                        {conversation.last_message_at && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatLastMessageTime(conversation.last_message_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mb-0.5">
                        {conversation.contract_title}
                      </p>
                      {conversation.last_message && (
                        <p
                          className={cn(
                            "text-xs truncate",
                            conversation.unread_count > 0
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {conversation.last_message}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
