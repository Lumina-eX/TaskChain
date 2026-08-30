"use client";

import { cn } from "@/lib/utils";

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string | null;
  created_at: string;
  is_own?: boolean;
}

interface MessageBubbleProps {
  message: Message;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function MessageDateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border/40" />
      <span className="text-xs text-muted-foreground px-2 shrink-0">
        {formatDate(date)}
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOwn = message.is_own ?? false;
  const initials = message.sender_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex items-end gap-2 group",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      {!isOwn && (
        <div className="shrink-0 mb-1">
          {message.sender_avatar ? (
            <img
              src={message.sender_avatar}
              alt={message.sender_name}
              className="h-8 w-8 rounded-full object-cover border border-border/40"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">{initials}</span>
            </div>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "flex flex-col gap-1 max-w-[70%] sm:max-w-[60%]",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {!isOwn && (
          <span className="text-xs text-muted-foreground ml-1 font-medium">
            {message.sender_name}
          </span>
        )}
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words",
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-card/70 border border-border/40 text-foreground rounded-bl-sm backdrop-blur-sm"
          )}
        >
          {message.content}
        </div>
        <span
          className={cn(
            "text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity px-1",
            isOwn ? "text-right" : "text-left"
          )}
        >
          {formatTime(message.created_at)}
        </span>
      </div>

      {/* Own avatar placeholder for alignment */}
      {isOwn && <div className="w-8 shrink-0" />}
    </div>
  );
}
