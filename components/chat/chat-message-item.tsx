'use client';

import { ChatMessage, UserRole } from '@/types/chat';
import { Badge } from '@/components/ui/badge';
import { Check, CheckCheck, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessageItemProps {
  message: ChatMessage;
  isCurrentUser: boolean;
}

function formatMessageTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ChatMessageItem({ message, isCurrentUser }: ChatMessageItemProps) {
  const isClient = message.senderRole === 'client';

  return (
    <div
      className={cn(
        'flex items-start gap-3 group transition-all',
        isCurrentUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0 mt-0.5">
        <img
          src={
            message.senderAvatar ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${message.senderName}`
          }
          alt={message.senderName}
          className="h-8 w-8 rounded-full object-cover border border-border/40 shadow-xs"
        />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background',
            isClient ? 'bg-accent' : 'bg-primary'
          )}
          title={isClient ? 'Client' : 'Freelancer'}
        />
      </div>

      {/* Bubble Container */}
      <div
        className={cn(
          'flex flex-col max-w-[82%] sm:max-w-[70%]',
          isCurrentUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Sender Header */}
        <div className="flex items-center gap-1.5 mb-1 px-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{message.senderName}</span>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 h-4 border-0 font-medium',
              isClient
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'bg-primary/10 text-primary border border-primary/20'
            )}
          >
            {isClient ? 'Client' : 'Freelancer'}
          </Badge>
        </div>

        {/* Message Card */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 shadow-sm text-sm break-words leading-relaxed transition-colors',
            isCurrentUser
              ? 'bg-primary text-primary-foreground rounded-tr-xs'
              : 'bg-card border border-border/50 text-card-foreground rounded-tl-xs backdrop-blur-xs'
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2.5 space-y-1.5 border-t border-border/20 pt-2">
              {message.attachments.map((att, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-lg text-xs transition-colors',
                    isCurrentUser
                      ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20'
                      : 'bg-muted/50 hover:bg-muted'
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate flex-1 font-medium">{att.name}</span>
                  {att.size && <span className="opacity-70 text-[10px]">{att.size}</span>}
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 hover:opacity-80 shrink-0"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info: Timestamp & Read Status */}
        <div className="flex items-center gap-1 mt-1 px-1 text-[11px] text-muted-foreground/80">
          <span>{formatMessageTime(message.timestamp)}</span>
          {isCurrentUser && (
            <span className="ml-0.5">
              {message.status === 'read' ? (
                <CheckCheck className="h-3.5 w-3.5 text-accent" />
              ) : message.status === 'delivered' ? (
                <CheckCheck className="h-3.5 w-3.5 opacity-70" />
              ) : (
                <Check className="h-3.5 w-3.5 opacity-60" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
