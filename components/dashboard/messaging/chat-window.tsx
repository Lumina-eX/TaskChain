"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageBubble, MessageDateDivider, type Message } from "./message-bubble";
import { MessageInput } from "./message-input";
import type { Conversation } from "./conversation-list";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  conversation: Conversation | null;
  currentUserId: string | null;
  onBack?: () => void;
  /** Whether this is shown inside the mobile overlay (shows back button) */
  isMobileView?: boolean;
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("tc_dev_access_token")
      : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function groupMessagesByDate(messages: Message[]): Array<{ date: string; messages: Message[] }> {
  const groups: Map<string, Message[]> = new Map();
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString();
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(msg);
  }
  return Array.from(groups.entries()).map(([date, msgs]) => ({
    date: msgs[0].created_at,
    messages: msgs,
  }));
}

export function ChatWindow({
  conversation,
  currentUserId,
  onBack,
  isMobileView = false,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  };

  // Load messages for the selected conversation
  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setError(null);

    const loadMessages = async () => {
      try {
        const res = await fetch(
          `/api/messages?conversation_id=${conversation.id}`,
          { headers: getAuthHeaders(), credentials: "include" }
        );
        if (!res.ok) {
          setError("Failed to load messages.");
          return;
        }
        const data = await res.json();
        const loaded: Message[] = (data.messages ?? []).map((m: Message) => ({
          ...m,
          is_own: m.sender_id === currentUserId,
        }));
        setMessages(loaded);
      } catch {
        setError("Could not connect to the server.");
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [conversation?.id, currentUserId]);

  // Auto-scroll on first load (instant) and on new messages (smooth)
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(loading ? "instant" : "smooth");
    }
  }, [messages, loading]);

  const handleSend = async (content: string) => {
    if (!conversation || !currentUserId) return;
    setSendError(null);

    // Optimistic update
    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      content,
      sender_id: currentUserId,
      sender_name: "You",
      created_at: new Date().toISOString(),
      is_own: true,
    };
    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom("smooth");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify({
          conversation_id: conversation.id,
          content,
        }),
      });

      if (!res.ok) {
        // Roll back optimistic message
        setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
        setSendError("Failed to send message. Please try again.");
        return;
      }

      const data = await res.json();
      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMessage.id
            ? { ...data.message, is_own: true }
            : m
        )
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
      setSendError("Network error. Please try again.");
    }
  };

  // Empty state — no conversation selected
  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Select a conversation</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Choose a conversation from the left to start messaging.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur-sm shrink-0">
        {(isMobileView || onBack) && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        {/* Avatar */}
        <div className="shrink-0">
          {conversation.other_party_avatar ? (
            <img
              src={conversation.other_party_avatar}
              alt={conversation.other_party_name}
              className="h-9 w-9 rounded-full object-cover border border-border/40"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {conversation.other_party_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">
            {conversation.other_party_name}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {conversation.contract_title}
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-smooth"
        aria-live="polite"
        aria-label="Messages"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading messages…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                // Re-trigger by toggling conversation id (hack: force effect)
                setMessages([]);
                setLoading(true);
                fetch(`/api/messages?conversation_id=${conversation.id}`, {
                  headers: getAuthHeaders(),
                  credentials: "include",
                })
                  .then((res) => (res.ok ? res.json() : Promise.reject()))
                  .then((data) => {
                    setMessages(
                      (data.messages ?? []).map((m: Message) => ({
                        ...m,
                        is_own: m.sender_id === currentUserId,
                      }))
                    );
                  })
                  .catch(() => setError("Could not connect to the server."))
                  .finally(() => setLoading(false));
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs text-muted-foreground">
                Start the conversation by sending a message below.
              </p>
            </div>
          </div>
        ) : (
          <>
            {groupMessagesByDate(messages).map((group) => (
              <div key={group.date}>
                <MessageDateDivider date={group.date} />
                <div className="space-y-2">
                  {group.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Send error */}
      {sendError && (
        <div className="mx-4 mb-1 flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {sendError}
        </div>
      )}

      {/* Message Input */}
      <MessageInput
        onSend={handleSend}
        disabled={loading}
        placeholder={`Message ${conversation.other_party_name}…`}
      />
    </div>
  );
}
